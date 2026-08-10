/**
 * Identificador del turno de sincronizacion de una combinacion de keyword y
 * zona.
 *
 * Tiene que ser determinista: el turno se toma escribiendo un documento con
 * este identificador, y dos peticiones de la misma combinacion solo compiten
 * por el mismo documento si ambas lo calculan igual. Con identificadores
 * generados al azar cada peticion tomaria un turno distinto y no habria
 * exclusion ninguna.
 *
 * La keyword es texto libre del operador, asi que no puede usarse tal cual:
 * Firestore rechaza los identificadores que contienen `/`, los que valen `.` o
 * `..`, y los que superan los 1500 bytes.
 *
 * Todo lo que no sea `a-z0-9` se reduce a guion, acentos incluidos. Eso hace
 * que dos keywords distintas puedan caer en el mismo identificador y que una
 * espere por la otra: es una colision conservadora, del lado seguro, y el
 * catalogo cerrado hace que en la practica no ocurra.
 */
export function importSlotId(keyword: string, zone: string): string {
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200);

  // La zona puede venir vacia, y un identificador no puede terminar en el
  // separador sin volverse ambiguo respecto de la keyword sola
  return `${slug(keyword)}__${slug(zone) || 'sin-zona'}`;
}
