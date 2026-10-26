/** Versioned setup for UI journeys; loading it never simulates a season. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { validateWorld } from '../../packages/contracts/src/schema';
import type { World } from '../../packages/contracts/src/types';

export interface PreparedWorld {
  format: 1;
  synthetic: true;
  name: string;
  source: { commit: string; computation: string };
  sha256: string;
  gzip: string;
}

const loaded = new Map<string, string>();

export function decodePreparedWorld(fixture: PreparedWorld): World {
  if (fixture.format !== 1 || fixture.synthetic !== true)
    throw new Error('Unsupported prepared world');
  const json = gunzipSync(Buffer.from(fixture.gzip, 'base64')).toString('utf8');
  if (createHash('sha256').update(json).digest('hex') !== fixture.sha256)
    throw new Error('Prepared-world checksum mismatch');
  return validateWorld(JSON.parse(json));
}

export function preparedWorld(name: 'manager-journey' | 'manager-activation'): World {
  let json = loaded.get(name);
  if (json === undefined) {
    const fixture = JSON.parse(
      readFileSync(new URL(`./prepared/${name}.json`, import.meta.url), 'utf8'),
    ) as PreparedWorld;
    json = JSON.stringify(decodePreparedWorld(fixture));
    loaded.set(name, json);
  }
  return JSON.parse(json) as World;
}
