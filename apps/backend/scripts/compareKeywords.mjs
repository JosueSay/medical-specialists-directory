#!/usr/bin/env node
/**
 * Verificacion empirica de las variantes de keyword (docs/design.md).
 *
 * El enunciado propone buscar con el sustantivo agentivo (`cardiologo`), y el
 * equipo decidio usar el sustantivo de disciplina (`cardiologia`) razonando que
 * Places API indexa establecimientos y no personas. Este script comprueba ese
 * razonamiento en lugar de dejarlo como intuicion, y de paso resuelve si los
 * diacriticos cambian los resultados.
 *
 * Compara los `placeId` devueltos por tres consultas que solo difieren en la
 * forma de la palabra. Todo lo demas (zona, tipo, idioma, region) se mantiene
 * igual que en el adaptador real, porque si variara mas de una cosa a la vez la
 * comparacion no diria nada.
 *
 * Cuesta dinero: son llamadas reales a Places API. Sin `--run` hace una pasada
 * en seco que muestra que consultaria y cuanto costaria.
 *
 *   node scripts/compareKeywords.mjs                        # simulacion
 *   node scripts/compareKeywords.mjs --run                  # ejecuta de verdad
 *   node scripts/compareKeywords.mjs --run --page-size=20   # pagina completa
 *
 * El tamano de pagina importa para leer el resultado. Con 10 resultados por
 * consulta, un registro que ronde el puesto 10 entra en una y sale en otra, y la
 * comparacion no distingue si cambio la cobertura o solo el orden. Con 20, que
 * es el maximo de la API, esa ambiguedad desaparece.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const PAGE_SIZE = readPageSize();

/**
 * Las tres formas a comparar. `disciplina` participa en las dos pruebas, de modo
 * que bastan tres llamadas y no cuatro.
 */
const QUERIES = [
  { key: 'agentivo', term: 'cardiologo', label: 'Sustantivo agentivo, sin tilde' },
  { key: 'disciplina', term: 'cardiologia', label: 'Sustantivo de disciplina, sin tilde' },
  { key: 'disciplinaTilde', term: 'cardiología', label: 'Sustantivo de disciplina, con tilde' },
];

const COMPARISONS = [
  {
    title: 'Forma agentiva contra disciplina',
    left: 'agentivo',
    right: 'disciplina',
    decides:
      'Si el agentivo aporta registros que la disciplina no encuentra, se conserva como variante; si no, se descarta.',
  },
  {
    title: 'Diacriticos',
    left: 'disciplina',
    right: 'disciplinaTilde',
    decides:
      'Si los resultados coinciden, el eje ortografico se elimina y las variantes se reservan para ejes que si aportan cobertura.',
  },
];

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

  for (const query of QUERIES) {
    console.log(`  "${query.term} zona ${ZONE} Guatemala"   ${query.label}`);
  }

  console.log(`\n  ${QUERIES.length} llamadas, una pagina de ${PAGE_SIZE} resultados cada una.`);
  console.log(
    '  Campos solicitados: solo identificador y nombre, para no tocar el SKU Enterprise.',
  );
  console.log('\nPara ejecutar de verdad:  node scripts/compareKeywords.mjs --run');
}

async function main() {
  if (!process.argv.includes('--run')) {
    printDryRun();
    return;
  }

  const apiKey = readApiKey();
  const results = new Map();

  for (const query of QUERIES) {
    const result = await search(apiKey, query.term);
    results.set(query.key, result);
    console.log(`"${query.term} zona ${ZONE} Guatemala"  ->  ${result.ids.size} resultados`);
  }

  console.log('\n---\n');

  for (const comparison of COMPARISONS) {
    const left = QUERIES.find((query) => query.key === comparison.left);
    const right = QUERIES.find((query) => query.key === comparison.right);
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
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
