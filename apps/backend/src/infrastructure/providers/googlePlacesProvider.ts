import { SUPPORTED_ZONES } from '@msd/contracts';
import type { Place } from '@/domain/entities/place.js';
import type { PlacesProvider, ProviderPage, ProviderQuery } from '@/domain/ports/placesProvider.js';
import { AppError } from '@/shared/appError.js';
import { logger } from '@/shared/logger.js';

export interface GooglePlacesConfig {
  apiKey: string;
  baseUrl: string;
  /** Idioma y region de la busqueda; afectan como Google formatea las direcciones. */
  languageCode?: string;
  regionCode?: string;
  /** Tipo de lugar solicitado, por ejemplo `doctor`: descarta farmacias y tiendas. */
  includedType?: string;
  /** Con `true`, Google devuelve solo lugares del tipo solicitado. */
  strictTypeFiltering?: boolean;
  timeoutMs?: number;
}

/**
 * Campos solicitados a Google.
 *
 * Places API cobra por SKU segun el field mask, y una peticion que mezcla campos
 * de varios SKU se factura al mas alto. `nationalPhoneNumber` y `websiteUri`
 * disparan el SKU Enterprise y son obligatorios por enunciado, de modo que toda
 * sincronizacion se factura ahi.
 *
 * Por eso se pide solo lo que se persiste: `places.location` y `places.rating`
 * caen en el mismo SKU pero no se guardan, y solicitarlos seria pagar por un
 * dato que se descarta.
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'nextPageToken',
].join(',');

interface GooglePlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

/**
 * Codigo postal de Ciudad de Guatemala dentro de la direccion.
 *
 * La ciudad usa el formato `010NN`, donde `NN` es el numero de zona: `01010` es
 * zona 10 y `01001` es zona 1. Otros municipios del departamento tambien empiezan
 * por `01` pero no siguen ese tramo, de modo que el patron distingue lo que esta
 * dentro de la ciudad de lo que no.
 */
const GUATEMALA_CITY_POSTAL_CODE = /\b010(\d{2})\b/;

/**
 * Resultado de resolver la zona de una direccion.
 *
 * `unknown` y `outOfScope` no son lo mismo y no se tratan igual: la primera
 * significa que la direccion no permite saberlo, la segunda que si permite saber
 * que el establecimiento no esta en Ciudad de Guatemala.
 */
type ZoneResolution =
  | { readonly kind: 'resolved'; readonly zone: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'outOfScope' };

/**
 * Deduce la zona a partir del codigo postal que Google incluye en la direccion.
 *
 * No es inferencia: `formattedAddress` viene tal cual de Places API y el codigo
 * postal forma parte de esa cadena. Leerlo es usar un dato que el proveedor
 * entrego, no completar uno que falta.
 *
 * Se descarta a proposito el texto libre de la direccion como fuente
 * alternativa, aunque muchas incluyan «zona 9» o «Z.11». Una direccion observada
 * decia «Zona 4 Colonia Venecia 2 Villa Nueva»: esa zona 4 es de Villa Nueva y no
 * de la capital, y solo el codigo postal permite distinguirlo. Ganar cobertura a
 * costa de etiquetar mal los registros no es una mejora.
 */
/**
 * Un nombre es utilizable si contiene al menos una letra o un digito. La
 * comprobacion es deliberadamente minima: no juzga si el nombre es bueno, solo
 * descarta el que no dice nada. Cualquier regla mas estricta empezaria a
 * excluir establecimientos reales de nombre corto o poco convencional.
 */
export function hasReadableName(name: string): boolean {
  return /[\p{L}\p{N}]/u.test(name);
}

export function resolveZoneFromAddress(
  formattedAddress: string,
  supportedZones: readonly string[],
): ZoneResolution {
  const match = GUATEMALA_CITY_POSTAL_CODE.exec(formattedAddress);

  if (!match?.[1]) {
    return { kind: 'unknown' };
  }

  // El cero a la izquierda se descarta: el catalogo usa `4`, no `04`
  const zone = String(Number(match[1]));

  return supportedZones.includes(zone) ? { kind: 'resolved', zone } : { kind: 'outOfScope' };
}

interface GoogleSearchTextResponse {
  places?: GooglePlaceResult[];
  nextPageToken?: string;
}

/**
 * Adaptador contra Google Maps Platform, Places API (searchText).
 *
 * Traduce la respuesta de Google a la entidad `Place`: el caso de uso nunca ve
 * el formato del proveedor. Cualquier fallo del proveedor se convierte en un
 * error de dominio con codigo `places_provider_unavailable`, sin filtrar la
 * API key ni la traza original.
 */
export class GooglePlacesProvider implements PlacesProvider {
  constructor(private readonly config: GooglePlacesConfig) {}

  async fetchPage(query: ProviderQuery, pageToken?: string): Promise<ProviderPage> {
    const response = await this.requestSearchText(query.keyword, query.pageSize, pageToken);
    const timestamp = new Date().toISOString();

    const places: Place[] = [];
    let outOfScope = 0;
    let withoutZone = 0;
    let unnamed = 0;

    for (const result of response.places ?? []) {
      if (!result.id) {
        continue;
      }

      // Google Maps no valida el nombre que declara cada negocio, asi que
      // aparecen fichas llamadas ".", "-" o un emoji suelto. Un nombre sin una
      // sola letra ni digito no identifica a nadie: en un directorio que se
      // consulta por nombre, esa fila no se puede usar ni verificar.
      if (!hasReadableName(result.displayName?.text ?? '')) {
        unnamed += 1;
        continue;
      }

      const resolution = resolveZoneFromAddress(result.formattedAddress ?? '', SUPPORTED_ZONES);

      // Google no acota los resultados a la zona consultada ni al municipio: una
      // busqueda de la capital devuelve establecimientos de Villa Nueva o de la
      // carretera a El Salvador. Se descartan porque el directorio se declara de
      // Ciudad de Guatemala, y guardarlos seria prometer un alcance que no tiene.
      if (resolution.kind === 'outOfScope') {
        outOfScope += 1;
        continue;
      }

      if (resolution.kind === 'unknown') {
        withoutZone += 1;
      }

      places.push(
        this.toPlace(
          result as GooglePlaceResult & { id: string },
          query,
          timestamp,
          resolution.kind === 'resolved' ? resolution.zone : '',
        ),
      );
    }

    if (outOfScope > 0 || withoutZone > 0 || unnamed > 0) {
      logger.info('Resultados descartados o sin zona determinable', {
        keyword: query.keyword,
        outOfScope,
        withoutZone,
        unnamed,
      });
    }

    return {
      places,
      ...(response.nextPageToken ? { nextPageToken: response.nextPageToken } : {}),
    };
  }

  private async requestSearchText(
    textQuery: string,
    pageSize: number,
    pageToken?: string,
  ): Promise<GoogleSearchTextResponse> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/places:searchText`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.config.apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery,
          pageSize,
          languageCode: this.config.languageCode ?? 'es',
          regionCode: this.config.regionCode ?? 'GT',
          // El filtro por tipo evita pagar por resultados que no son medicos
          ...(this.config.includedType ? { includedType: this.config.includedType } : {}),
          ...(this.config.strictTypeFiltering === undefined
            ? {}
            : { strictTypeFiltering: this.config.strictTypeFiltering }),
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // El cuerpo de Google puede incluir detalles internos: se registra el
        // status pero no se propaga al cliente.
        logger.error('Places API respondio con error', { status: response.status });
        throw AppError.providerUnavailable(`Places API responded with status ${response.status}`);
      }

      return (await response.json()) as GoogleSearchTextResponse;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Fallo la llamada a Places API', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw AppError.providerUnavailable('Places API is unreachable or timed out');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Traduce un resultado de Google a la entidad de dominio.
   *
   * `zone` y `specialty` se toman de la consulta, nunca de la direccion. Extraer
   * la zona del texto con una expresion regular seria inferir un dato que Google
   * no entrega como campo, y el proyecto no infiere: un acierto parcial mandaria
   * al Ministerio a una zona equivocada sin que nada lo delate.
   *
   * Los campos ausentes se guardan como cadena vacia, no se completan con otras
   * fuentes ni se sustituyen por valores por defecto.
   */
  /**
   * `zone` llega resuelta desde la direccion y no se toma de la consulta.
   *
   * Tomarla de la keyword parecia lo mas honesto porque evitaba deducir, pero
   * producia un dato falso: Google devuelve establecimientos de toda la ciudad
   * ante cualquier consulta de zona, de modo que un consultorio de la zona 10
   * acababa etiquetado como zona 25 si esa fue la ultima busqueda que lo
   * encontro. La procedencia de la consulta no se pierde: queda en
   * `sourceKeyword`, que conserva el texto exacto que origino el registro.
   */
  private toPlace(
    result: GooglePlaceResult & { id: string },
    query: ProviderQuery,
    timestamp: string,
    zone: string,
  ): Place {
    return {
      placeId: result.id,
      name: result.displayName?.text ?? '',
      formattedAddress: result.formattedAddress ?? '',
      specialty: query.specialty,
      zone,
      phoneNumber: result.nationalPhoneNumber ?? '',
      website: result.websiteUri ?? '',
      sourceKeyword: query.keyword,
      createdAt: timestamp,
      collectedAt: timestamp,
    };
  }
}
