import { describe, expect, it } from 'vitest';
import {
  CachedWhitelistSource,
  EnvWhitelistSource,
  isIpAllowed,
  normalizeIp,
  type WhitelistEntry,
  type WhitelistSource,
} from '@/config/ipWhitelist.js';

const whitelist: WhitelistEntry[] = [
  { cidr: '127.0.0.1/32', label: 'loopback' },
  { cidr: '172.16.0.0/12', label: 'docker' },
  { cidr: '::1/128', label: 'loopback ipv6' },
];

describe('whitelist de IPs', () => {
  it('acepta una IP exacta de la lista', () => {
    expect(isIpAllowed('127.0.0.1', whitelist)).toBe(true);
  });

  it('acepta una IP dentro de un rango CIDR', () => {
    expect(isIpAllowed('172.18.0.5', whitelist)).toBe(true);
  });

  it('rechaza una IP fuera de todo rango', () => {
    expect(isIpAllowed('8.8.8.8', whitelist)).toBe(false);
  });

  it('rechaza un valor que no es una IP', () => {
    expect(isIpAllowed('no-es-una-ip', whitelist)).toBe(false);
  });

  it('normaliza la IPv4 mapeada a IPv6 que agregan los proxies', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(isIpAllowed('::ffff:127.0.0.1', whitelist)).toBe(true);
  });

  it('no cruza familias: una IPv6 no entra por un rango IPv4', () => {
    expect(isIpAllowed('2001:db8::1', whitelist)).toBe(false);
    expect(isIpAllowed('::1', whitelist)).toBe(true);
  });
});

describe('fuentes de whitelist', () => {
  it('normaliza IPs sueltas de la variable de entorno a notacion CIDR', async () => {
    const entries = await new EnvWhitelistSource([
      '127.0.0.1',
      '10.0.0.0/8',
      'invalida',
    ]).getEntries();

    expect(entries.map((entry) => entry.cidr)).toEqual(['127.0.0.1/32', '10.0.0.0/8']);
  });

  it('cachea las entradas durante el TTL y las renueva al vencer', async () => {
    let reads = 0;
    let currentTime = 0;

    const source: WhitelistSource = {
      getEntries: async () => {
        reads += 1;
        return whitelist;
      },
    };

    const cached = new CachedWhitelistSource(source, 60_000, () => currentTime);

    await cached.getEntries();
    await cached.getEntries();
    expect(reads).toBe(1);

    currentTime = 61_000;
    await cached.getEntries();
    expect(reads).toBe(2);
  });

  it('ante un fallo de la fuente no autoriza IPs nuevas', async () => {
    const failing: WhitelistSource = {
      getEntries: async () => {
        throw new Error('firestore unavailable');
      },
    };

    const entries = await new CachedWhitelistSource(failing).getEntries();
    expect(entries).toEqual([]);
  });
});
