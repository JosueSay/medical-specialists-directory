#!/usr/bin/env node
/**
 * Corrida completa del catalogo (docs/design.md).
 *
 * Recorre cada combinacion de especialidad, variante y zona e invoca
 * `POST /api/v1/place-imports` contra el backend, que es quien habla con Google.
 * El script no llama a Places API directamente: si lo hiciera, duplicaria la
 * logica de paginacion, tope y persistencia que ya vive en el caso de uso.
 *
 * Gasta dinero de verdad. El presupuesto aprobado es de 18.90 USD para 770
 * sincronizaciones; sin `--run` hace una pasada en seco que muestra el alcance
 * y el costo estimado sin llamar a nada.
 *
 *   node scripts/runCampaign.mjs                      # simulacion
 *   node scripts/runCampaign.mjs --run                # ejecuta la campana
 *   node scripts/runCampaign.mjs --run --specialty=cardiology
 *   node scripts/runCampaign.mjs --run --zone=10
 *   node scripts/runCampaign.mjs --reset              # olvida el progreso
 *
 * Antes de ejecutarla hay que subir la cuota diaria de Places API de 200 a
 * 2,000 y volver a bajarla al terminar. Con 200 la campana tardaria ocho dias.
 *
 * El catalogo se lee del contrato compilado y no se copia aqui: un script que
 * gasta dinero no puede trabajar sobre una lista que haya quedado desfasada.
 * Requiere `pnpm run --filter @msd/contracts build` antes.
 */

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SPECIALTY_KEYWORD_VARIANTS,
  SUPPORTED_SPECIALTIES,
  SUPPORTED_ZONES,
  buildSearchKeyword,
} from '../../../packages/contracts/dist/specialty.js';

const PROGRESS_FILE = resolve(process.cwd(), '.campaign-progress.jsonl');

/**
 * La cuota por minuto de Places API esta en 60 solicitudes y cada
 * sincronizacion consume dos, de modo que el techo son 30 por minuto. Se deja
 * un margen: agotar la cuota exacta devuelve 429 y obliga a reintentar, que
 * sale mas caro en tiempo que esperar.
 */
const SYNCS_PER_MINUTE = 25;
const DELAY_MS = Math.ceil(60_000 / SYNCS_PER_MINUTE);

/** Llamadas gratuitas al mes en el SKU Text Search Enterprise. */
const FREE_CALLS_PER_MONTH = 1_000;
/** Precio por llamada facturable en ese mismo SKU. */
const COST_PER_CALL = 0.035;

/** Fallos consecutivos tras los que se aborta en lugar de seguir gastando. */
const MAX_CONSECUTIVE_FAILURES = 3;

function readFlag(name, fallback) {
  const argument = process.argv.find((item) => item.startsWith(`--${name}=`));
  return argument ? argument.slice(`--${name}=`.length) : fallback;
}

const BASE_URL = readFlag('base-url', 'http://localhost:4000/api/v1');
const ONLY_SPECIALTY = readFlag('specialty', '');
const ONLY_ZONE = readFlag('zone', '');

function buildCombinations() {
  const specialties = ONLY_SPECIALTY ? [ONLY_SPECIALTY] : [...SUPPORTED_SPECIALTIES];
  const zones = ONLY_ZONE ? [ONLY_ZONE] : [...SUPPORTED_ZONES];

  for (const specialty of specialties) {
    if (!SUPPORTED_SPECIALTIES.includes(specialty)) {
      throw new Error(`Especialidad desconocida: ${specialty}`);
    }
  }

  for (const zone of zones) {
    if (!SUPPORTED_ZONES.includes(zone)) {
      throw new Error(`Zona desconocida: ${zone}`);
    }
  }

  const combinations = [];

  for (const specialty of specialties) {
    for (const variant of SPECIALTY_KEYWORD_VARIANTS[specialty]) {
      for (const zone of zones) {
        combinations.push({
          specialty,
          zone,
          keyword: buildSearchKeyword(variant, zone),
        });
      }
    }
  }

  return combinations;
}

function combinationKey({ specialty, zone, keyword }) {
  return `${specialty}|${zone}|${keyword}`;
}

function readProgress() {
  if (!existsSync(PROGRESS_FILE)) {
    return new Set();
  }

  const lines = readFileSync(PROGRESS_FILE, 'utf8').split('\n').filter(Boolean);
  return new Set(lines.map((line) => JSON.parse(line).key));
}

function recordProgress(entry) {
  appendFileSync(PROGRESS_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function sleep(ms) {
  await new Promise((done) => {
    setTimeout(done, ms);
  });
}

async function synchronize(combination) {
  const response = await fetch(`${BASE_URL}/place-imports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: combination.keyword,
      specialty: combination.specialty,
      zone: combination.zone,
    }),
  });

  const body = await response.json().catch(() => ({}));

  return { status: response.status, body };
}

function printDryRun(combinations, pending) {
  const billable = Math.max(0, combinations.length * 2 - FREE_CALLS_PER_MONTH);
  const minutes = Math.ceil((pending.length * DELAY_MS) / 60_000);

  console.log('Simulacion. No se llamo a ningun servicio.\n');
  console.log(`  Combinaciones en el alcance : ${combinations.length}`);
  console.log(`  Ya sincronizadas            : ${combinations.length - pending.length}`);
  console.log(`  Pendientes                  : ${pending.length}`);
  console.log(`  Llamadas a Places API       : ${pending.length * 2}`);
  console.log(`  Facturables del alcance     : ${billable}`);
  console.log(`  Costo estimado              : ${(billable * COST_PER_CALL).toFixed(2)} USD`);
  console.log(`  Duracion estimada           : ${minutes} minutos a ${SYNCS_PER_MINUTE}/min`);
  console.log(`\n  Backend destino             : ${BASE_URL}`);

  if (pending.length > 0) {
    console.log('\nPrimeras combinaciones:\n');
    for (const item of pending.slice(0, 5)) {
      console.log(`  ${item.specialty.padEnd(16)} zona ${item.zone.padEnd(3)} "${item.keyword}"`);
    }
  }

  console.log('\nAntes de ejecutar: subir la cuota diaria de Places API a 2,000.');
  console.log('Para ejecutar de verdad, agregar --run');
}

async function main() {
  if (process.argv.includes('--reset')) {
    if (existsSync(PROGRESS_FILE)) {
      rmSync(PROGRESS_FILE);
      console.log('Progreso olvidado. La proxima corrida empieza desde cero.');
    } else {
      console.log('No habia progreso que olvidar.');
    }
    return;
  }

  const combinations = buildCombinations();
  const done = readProgress();
  const pending = combinations.filter((item) => !done.has(combinationKey(item)));

  if (!process.argv.includes('--run')) {
    printDryRun(combinations, pending);
    return;
  }

  if (pending.length === 0) {
    console.log('Nada pendiente: todas las combinaciones del alcance ya se sincronizaron.');
    return;
  }

  let upserted = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  let cooldowns = 0;

  for (const [index, combination] of pending.entries()) {
    const position = `${index + 1}/${pending.length}`;

    try {
      const { status, body } = await synchronize(combination);

      // Se comprueba que el resumen corresponda a esta combinacion y no a otra
      // corrida: dar por buena cualquier respuesta 201 fue lo que hizo que la
      // primera campana reportara 770 sincronizaciones habiendo ejecutado 220.
      if (status === 201 && body.data?.keyword === combination.keyword) {
        upserted += body.data?.itemsUpserted ?? 0;
        consecutiveFailures = 0;
        recordProgress({ key: combinationKey(combination), status, at: new Date().toISOString() });
        console.log(`${position}  ${combination.keyword}  ->  ${body.data?.itemsUpserted ?? 0}`);
      } else if (status === 201) {
        failures += 1;
        consecutiveFailures += 1;
        console.error(
          `${position}  ${combination.keyword}  ->  201 con el resumen de otra corrida (${body.data?.keyword})`,
        );
      } else if (body.code === 'place_import_cooldown_active') {
        // Ya se sincronizo hace poco: se anota como hecha para no reintentarla
        cooldowns += 1;
        consecutiveFailures = 0;
        recordProgress({ key: combinationKey(combination), status, at: new Date().toISOString() });
        console.log(`${position}  ${combination.keyword}  ->  cooldown, se omite`);
      } else {
        failures += 1;
        consecutiveFailures += 1;
        console.error(`${position}  ${combination.keyword}  ->  ${status} ${body.code ?? ''}`);
      }
    } catch (error) {
      failures += 1;
      consecutiveFailures += 1;
      console.error(`${position}  ${combination.keyword}  ->  ${error.message}`);
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `\nAbortado tras ${MAX_CONSECUTIVE_FAILURES} fallos seguidos. El progreso quedo guardado:`,
      );
      console.error('corregir la causa y volver a lanzar continua donde se quedo.');
      process.exitCode = 1;
      return;
    }

    if (index < pending.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n---\n');
  console.log(`  Sincronizaciones ejecutadas : ${pending.length - failures - cooldowns}`);
  console.log(`  Omitidas por cooldown       : ${cooldowns}`);
  console.log(`  Fallidas                    : ${failures}`);
  console.log(`  Registros persistidos       : ${upserted}`);
  console.log('\nAl terminar: devolver la cuota diaria de Places API a 200.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
