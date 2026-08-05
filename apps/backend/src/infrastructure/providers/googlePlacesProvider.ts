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

    const places = (response.places ?? [])
      .filter((result): result is GooglePlaceResult & { id: string } => Boolean(result.id))
      .map((result) => this.toPlace(result, query, timestamp));

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
  private toPlace(
    result: GooglePlaceResult & { id: string },
    query: ProviderQuery,
    timestamp: string,
  ): Place {
    return {
      placeId: result.id,
      name: result.displayName?.text ?? '',
      formattedAddress: result.formattedAddress ?? '',
      specialty: query.specialty,
      zone: query.zone,
      phoneNumber: result.nationalPhoneNumber ?? '',
      website: result.websiteUri ?? '',
      sourceKeyword: query.keyword,
      createdAt: timestamp,
      collectedAt: timestamp,
    };
  }
}
