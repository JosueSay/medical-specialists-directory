import ipaddr from 'ipaddr.js';
import { logger } from '@/shared/logger.js';

/**
 * Whitelist de IPs administrada como configuracion (RNF-01).
 *
 * Fuentes, en orden de precedencia:
 *   1. Variable IP_WHITELIST, solo para desarrollo local y CI.
 *   2. Documento de Firestore, editable desde la consola para cambiar de red
 *      sin volver a desplegar. No hay endpoint de administracion.
 *
 * Este archivo solo contiene la logica pura de la whitelist; leer el documento
 * de Firestore es responsabilidad de la capa de infraestructura.
 */

export interface WhitelistEntry {
  cidr: string;
  label: string;
}

/** Origen de la whitelist. La infraestructura provee la implementacion concreta. */
export interface WhitelistSource {
  getEntries(): Promise<WhitelistEntry[]>;
}

/** Normaliza una IP suelta o un rango a notacion CIDR; devuelve undefined si es invalida. */
export function normalizeToCidr(value: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.includes('/')) {
    return ipaddr.isValidCIDR(trimmed) ? trimmed : undefined;
  }

  if (!ipaddr.isValid(trimmed)) {
    return undefined;
  }

  const prefix = ipaddr.parse(trimmed).kind() === 'ipv6' ? 128 : 32;
  return `${trimmed}/${prefix}`;
}

/** Convierte valores crudos en entradas validas, descartando y registrando las erroneas. */
export function toWhitelistEntries(
  values: Array<string | { cidr?: string; label?: string }>,
  defaultLabel: string,
): WhitelistEntry[] {
  return values.flatMap((value) => {
    const raw = typeof value === 'string' ? value : (value.cidr ?? '');
    const cidr = normalizeToCidr(raw);

    if (!cidr) {
      logger.warn('Entrada de whitelist invalida, se ignora', { value: raw });
      return [];
    }

    const label = typeof value === 'string' ? defaultLabel : (value.label ?? defaultLabel);
    return [{ cidr, label }];
  });
}

/** Fuente basada en la variable de entorno, usada en desarrollo local. */
export class EnvWhitelistSource implements WhitelistSource {
  constructor(private readonly values: string[]) {}

  async getEntries(): Promise<WhitelistEntry[]> {
    return toWhitelistEntries(this.values, 'variable de entorno');
  }
}

/**
 * Cachea las entradas por un tiempo corto.
 *
 * Sin esto, cada peticion leeria el documento de Firestore. Con la cache, un
 * cambio en la consola tarda a lo sumo `ttlMs` en aplicarse, que es el
 * compromiso deseado entre costo de lectura y rapidez del cambio.
 */
export class CachedWhitelistSource implements WhitelistSource {
  private cache: { entries: WhitelistEntry[]; expiresAt: number } | null = null;

  constructor(
    private readonly source: WhitelistSource,
    private readonly ttlMs: number = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getEntries(): Promise<WhitelistEntry[]> {
    const timestamp = this.now();

    if (this.cache && this.cache.expiresAt > timestamp) {
      return this.cache.entries;
    }

    try {
      const entries = await this.source.getEntries();
      this.cache = { entries, expiresAt: timestamp + this.ttlMs };
      return entries;
    } catch (error) {
      logger.error('No fue posible leer la whitelist, se niega el acceso', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      // Ante un fallo de la fuente se cierra el paso: nunca se abre por defecto
      return this.cache?.entries ?? [];
    }
  }
}

/** Quita el prefijo de IPv4 mapeada a IPv6 que agregan algunos proxies. */
export function normalizeIp(rawIp: string): string {
  return rawIp.startsWith('::ffff:') ? rawIp.slice('::ffff:'.length) : rawIp;
}

/** Indica si una IP cae dentro de alguno de los rangos autorizados. */
export function isIpAllowed(rawIp: string, whitelist: WhitelistEntry[]): boolean {
  const candidate = normalizeIp(rawIp);

  if (!ipaddr.isValid(candidate)) {
    return false;
  }

  const address = ipaddr.parse(candidate);

  return whitelist.some((entry) => {
    try {
      const range = ipaddr.parseCIDR(entry.cidr);
      // Un rango IPv4 no puede contener una IPv6 y viceversa
      return address.kind() === range[0].kind() && address.match(range);
    } catch {
      return false;
    }
  });
}
