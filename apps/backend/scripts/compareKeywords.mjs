#!/usr/bin/env node
/**
 * Verificacion empirica de las variantes de keyword (docs/design.md).
 *
 * El enunciado propone buscar con el sustantivo agentivo (`cardiologo`), y el
 * equipo decidio usar el sustantivo de disciplina (`cardiologia`) razonando que
 * Places API indexa establecimientos y no personas. Este script comprueba ese
 * razonamiento en lugar de dejarlo como intuicion.
 *
 * Compara los `placeId` devueltos por dos consultas que solo difieren en la
 * forma de la palabra (agentivo contra disciplina). Todo lo demas (zona, tipo,
 * idioma, region) se mantiene igual que en el adaptador real, porque si variara
 * mas de una cosa a la vez la comparacion no diria nada.
 *
 * Los terminos salen de SPECIALTY_KEYWORD_VARIANTS (@msd/contracts), el mismo
 * catalogo que usa el adaptador real: el orden ya establecido ahi es
 * [disciplina, agentivo, ...], asi que no hay una segunda lista que pueda
 * desincronizarse de la que de verdad se usa en produccion.
 *
 * Cuesta dinero: son llamadas reales a Places API. Sin `--run` hace una pasada
 * en seco que muestra que consultaria y cuanto costaria.
 *
 *   node scripts/compareKeywords.mjs                                # cardiologia, simulacion
 *   node scripts/compareKeywords.mjs --run                          # cardiologia, ejecuta de verdad
 *   node scripts/compareKeywords.mjs --specialty=oncology --run     # una especialidad puntual
 *   node scripts/compareKeywords.mjs --specialty=all --run          # las diez de una corrida
 *   node scripts/compareKeywords.mjs --run --page-size=20           # pagina completa
 *
 * Sin `--specialty`, el comportamiento es el original: solo cardiologia, con la
 * comparacion de diacriticos incluida (ya resuelta, se documenta en design.md,
 * seccion de verificaciones previas). Con `--specialty`, la comparacion de
 * diacriticos se omite: ese eje ya se dio por eliminado en general, y repetirlo
 * por especialidad solo gastaria llamadas en una pregunta ya contestada.
 *
 * El tamano de pagina importa para leer el resultado. Con 10 resultados por
 * consulta, un registro que ronde el puesto 10 entra en una y sale en otra, y la
 * comparacion no distingue si cambio la cobertura o solo el orden. Con 20, que
 * es el maximo de la API, esa ambiguedad desaparece.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SPECIALTY_KEYWORD_VARIANTS,
  SUPPORTED_SPECIALTIES,
  isSupportedSpecialty,
} from '@msd/contracts';

const ENV_PATH = resolve(process.cwd(), '../../.env');
const BASE_URL = 'https://places.googleapis.com/v1/places:searchText';

// Solo identificador y nombre: la comparacion es entre conjuntos de placeId y
// no necesita telefono ni sitio web, que son los campos que disparan el SKU caro.
const FIELD_MASK = 'places.id,places.displayName';

const ZONE = '10';

/** Places API admite hasta 20 resultados por pagina en searchText. */
const MAX_PAGE_SIZE = 20;

function readPageSize() {
  const argument = process.argv.find((item) => item.startsWith('--page-size='));
  const value = argument ? Number(argument.slice('--page-size='.length)) : 10;

  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`--page-size debe ser un entero entre 1 y ${MAX_PAGE_SIZE}`);
  }

  return value;
}

/** Sin `--specialty`, se preserva el comportamiento original: solo cardiologia. */
function readSpecialties() {
  const argument = process.argv.find((item) => item.startsWith('--specialty='));
  if (!argument) {
    return { specialties: ['cardiology'], explicit: false };
  }

  const raw = argument.slice('--specialty='.length);
  const requested = raw === 'all' ? [...SUPPORTED_SPECIALTIES] : raw.split(',');

  for (const specialty of requested) {
    if (!isSupportedSpecialty(specialty)) {
      throw new Error(
        `Especialidad no soportada: "${specialty}". Catalogo: ${SUPPORTED_SPECIALTIES.join(', ')}`,
      );
    }
  }

  return { specialties: requested, explicit: true };
}

const PAGE_SIZE = readPageSize();
const { specialties: SPECIALTIES, explicit: SPECIALTY_EXPLICIT } = readSpecialties();
// El eje de diacriticos solo se repite en el caso por defecto (cardiologia sola,
// sin --specialty), que es el que ya documenta design.md.
const INCLUDE_DIACRITICS = !SPECIALTY_EXPLICIT;

function buildQueriesFor(specialty) {
  const variants = SPECIALTY_KEYWORD_VARIANTS[specialty];
  // El orden del catalogo es [disciplina, agentivo, ...]: no se reordena aqui,
  // se lee tal cual lo usa el adaptador real.
  const disciplina = variants[0];
  const agentivo = variants[1];

  const queries = [
    { key: 'agentivo', term: agentivo, label: 'Sustantivo agentivo, sin tilde' },
    { key: 'disciplina', term: disciplina, label: 'Sustantivo de disciplina, sin tilde' },
  ];

  const comparisons = [
    {
      title: `${specialty}: agentivo contra disciplina`,
      left: 'agentivo',
      right: 'disciplina',
      decides:
        'Si el agentivo aporta registros que la disciplina no encuentra, se conserva como variante; si no, se descarta.',
    },
  ];

  if (INCLUDE_DIACRITICS) {
    queries.push({
      key: 'disciplinaTilde',
      term: withAccent(specialty),
      label: 'Sustantivo de disciplina, con tilde',
    });
    comparisons.push({
      title: `${specialty}: diacriticos`,
      left: 'disciplina',
      right: 'disciplinaTilde',
      decides:
        'Si los resultados coinciden, el eje ortografico se elimina y las variantes se reservan para ejes que si aportan cobertura.',
    });
  }

  return { queries, comparisons };
}

/** Solo se usa para el caso por defecto (cardiologia); ver INCLUDE_DIACRITICS. */
function withAccent(specialty) {
  if (specialty !== 'cardiology') {
    throw new Error('La comparacion de diacriticos solo esta definida para cardiologia');
  }
  return 'cardiología';
}

function readApiKey() {
  let content;

  try {
    content = readFileSync(ENV_PATH, 'utf8');
  } catch {
    throw new Error(`No se encontro el archivo .env en ${ENV_PATH}`);
  }

  const line = content.split('\n').find((item) => item.startsWith('GOOGLE_MAPS_API_KEY='));
  const value = line?.slice('GOOGLE_MAPS_API_KEY='.length).trim().replace(/\r$/, '');

  if (!value || value === 'your_google_maps_api_key') {
    throw new Error('GOOGLE_MAPS_API_KEY no tiene un valor real en el .env');
  }

  return value;
}

async function search(apiKey, term) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${term} zona ${ZONE} Guatemala`,
      pageSize: PAGE_SIZE,
      languageCode: 'es',
      regionCode: 'GT',
      includedType: 'doctor',
      strictTypeFiltering: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Places API respondio ${response.status} para "${term}"`);
  }

  const body = await response.json();
  const places = body.places ?? [];

  return {
    ids: new Set(places.map((place) => place.id)),
    names: new Map(places.map((place) => [place.id, place.displayName?.text ?? ''])),
  };
}

function compare(left, right) {
  const onlyLeft = [...left.ids].filter((id) => !right.ids.has(id));
  const onlyRight = [...right.ids].filter((id) => !left.ids.has(id));
  const shared = [...left.ids].filter((id) => right.ids.has(id));

  return { onlyLeft, onlyRight, shared };
}

function printDryRun() {
  console.log('Simulacion. No se llamo a Places API.\n');
  console.log('Consultas que se ejecutarian:\n');

  let totalQueries = 0;
  for (const specialty of SPECIALTIES) {
    const { queries } = buildQueriesFor(specialty);
    for (const query of queries) {
      console.log(`  "${query.term} zona ${ZONE} Guatemala"   ${specialty} - ${query.label}`);
    }
    totalQueries += queries.length;
  }

  console.log(`\n  ${totalQueries} llamadas, una pagina de ${PAGE_SIZE} resultados cada una.`);
  console.log(
    '  Campos solicitados: solo identificador y nombre, para no tocar el SKU Enterprise.',
  );
  console.log('\nPara ejecutar de verdad, agregar --run');
}

async function main() {
  if (!process.argv.includes('--run')) {
    printDryRun();
    return;
  }

  const apiKey = readApiKey();
  const summary = [];

  for (const specialty of SPECIALTIES) {
    const { queries, comparisons } = buildQueriesFor(specialty);
    const results = new Map();

    for (const query of queries) {
      const result = await search(apiKey, query.term);
      results.set(query.key, result);
      console.log(`"${query.term} zona ${ZONE} Guatemala"  ->  ${result.ids.size} resultados`);
    }

    console.log('\n---\n');

    for (const comparison of comparisons) {
      const left = queries.find((query) => query.key === comparison.left);
      const right = queries.find((query) => query.key === comparison.right);
      const { onlyLeft, onlyRight, shared } = compare(
        results.get(comparison.left),
        results.get(comparison.right),
      );

      console.log(`## ${comparison.title}\n`);
      console.log(`| Consulta | Resultados | Exclusivos |`);
      console.log(`| :--- | ---: | ---: |`);
      console.log(
        `| \`${left.term}\` | ${results.get(comparison.left).ids.size} | ${onlyLeft.length} |`,
      );
      console.log(
        `| \`${right.term}\` | ${results.get(comparison.right).ids.size} | ${onlyRight.length} |`,
      );
      console.log(`| Coincidentes | ${shared.length} | |\n`);

      if (onlyLeft.length > 0) {
        console.log(`Solo en \`${left.term}\`:`);
        for (const id of onlyLeft) {
          console.log(`  - ${results.get(comparison.left).names.get(id)}`);
        }
        console.log('');
      }

      if (onlyRight.length > 0) {
        console.log(`Solo en \`${right.term}\`:`);
        for (const id of onlyRight) {
          console.log(`  - ${results.get(comparison.right).names.get(id)}`);
        }
        console.log('');
      }

      console.log(`Decide: ${comparison.decides}\n`);

      if (comparison.left === 'agentivo') {
        summary.push({
          specialty,
          agentivoExclusivos: onlyLeft.length,
          agentivoTotal: results.get('agentivo').ids.size,
        });
      }
    }

    console.log('===\n');
  }

  if (summary.length > 1) {
    console.log('## Resumen: aporte del agentivo por especialidad\n');
    console.log(`| Especialidad | Resultados agentivo | Exclusivos | Aporta |`);
    console.log(`| :--- | ---: | ---: | :---: |`);
    for (const row of summary) {
      const aporta = row.agentivoExclusivos > 0 ? 'si' : 'no';
      console.log(
        `| ${row.specialty} | ${row.agentivoTotal} | ${row.agentivoExclusivos} | ${aporta} |`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
