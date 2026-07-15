import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { AppError } from '../utils/errors.js';

const blockedHostnames = new Set(['localhost', 'localhost.localdomain']);
const blockedMetadataIps = new Set(['169.254.169.254', '100.100.100.200']);

function isBlockedIp(address: string): boolean {
  if (blockedMetadataIps.has(address)) return true;
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return true;
  }

  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }

  const range = parsed.range();
  return [
    'unspecified',
    'broadcast',
    'multicast',
    'linkLocal',
    'loopback',
    'private',
    'reserved',
    'uniqueLocal',
    'carrierGradeNat',
  ].includes(range);
}

export interface ValidatedTarget {
  url: URL;
  addresses: string[];
}

export async function validatePublicHttpUrl(input: string | URL): Promise<ValidatedTarget> {
  const url = input instanceof URL ? new URL(input) : new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'UNSAFE_SERVER_URL', 'Endereço de servidor inválido.');
  }
  if (url.username || url.password || blockedHostnames.has(url.hostname.toLowerCase())) {
    throw new AppError(400, 'UNSAFE_SERVER_URL', 'Endereço de servidor inválido.');
  }
  if (url.port && !/^\d{1,5}$/.test(url.port)) {
    throw new AppError(400, 'UNSAFE_SERVER_URL', 'Porta inválida.');
  }

  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new AppError(400, 'UNSAFE_SERVER_URL', 'Destino não permitido.');
  }

  url.hash = '';
  return { url, addresses: records.map((record) => record.address) };
}

export function buildProviderUrl(base: URL, path: string): URL {
  const root = new URL(base);
  root.pathname = root.pathname.endsWith('/') ? root.pathname : `${root.pathname}/`;
  root.search = '';
  root.hash = '';
  return new URL(path.replace(/^\/+/, ''), root);
}
