import type { Place } from '@/domain/entities/place.js';

export interface FreshnessPolicyConfig {
  /** Minutos tras los cuales un registro se considera desactualizado. */
  ttlMinutes: number;
  /** Horas tras las cuales los datos de Places API deben purgarse. */
  retentionHours: number;
}

/**
 * Politica de frescura del cache.
 *
 * Vive en el dominio porque expresa una regla de negocio, no un detalle de
 * infraestructura: cuando un dato deja de considerarse vigente y cuando deja de
 * poder conservarse. La consulta la usa para marcar resultados y la
 * sincronizacion para purgar.
 *
 * La consulta nunca dispara una llamada a Google: un registro `stale` se sigue
 * devolviendo, marcado, y solo una sincronizacion explicita lo actualiza.
 */
export class FreshnessPolicy {
  constructor(private readonly config: FreshnessPolicyConfig) {}

  isStale(place: Place, now: Date = new Date()): boolean {
    const collectedAt = new Date(place.collectedAt).getTime();

    if (Number.isNaN(collectedAt)) {
      // Una fecha ilegible se trata como desactualizada: nunca se presenta
      // como vigente algo que no se puede verificar
      return true;
    }

    return now.getTime() - collectedAt > this.config.ttlMinutes * 60 * 1000;
  }

  /**
   * Fecha limite de retencion: todo registro con `collectedAt` anterior debe
   * purgarse. Solo el `placeId` puede conservarse indefinidamente segun las
   * politicas de Places API.
   */
  retentionCutoff(now: Date = new Date()): string {
    return new Date(now.getTime() - this.config.retentionHours * 60 * 60 * 1000).toISOString();
  }
}
