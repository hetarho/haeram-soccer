import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CREST_EMBLEMS,
  CREST_PALETTE,
  CREST_PATTERNS,
  CREST_SHAPES,
} from '../../contracts/src/identity';
import type { World } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';
import { ensureRepresentatives } from './europe';
import {
  CREST_COMBINATIONS,
  CREST_PAIRS,
  CREST_FIELDS,
  colourDistance,
  contrast,
  inkOn,
  legacyCrestMap,
  luminance,
} from './identity-legacy';
import { hash } from './primitives';

// The crests frozen from the original web module were recorded on founded worlds, which left with
// the founding (T671); these cases keep the map's rules on a taken-over career.
const worlds = new Map<string, World>();
const world = (seed: string) => {
  if (!worlds.has(seed)) worlds.set(seed, careerWorld({ seed }));
  return worlds.get(seed)!;
};
const withoutRepresentatives = (w: World) => ({
  ...w,
  clubs: w.clubs.filter((club) => !club.id.startsWith('euro:')),
});

describe('legacy crest map (T236)', () => {
  it('maps every club and probes the own club first, before every other club in ID order', () => {
    for (const seed of ['crests', 'legacy-a', 'legacy-b']) {
      const w = world(seed);
      const map = legacyCrestMap(w);
      expect(map.size).toBe(w.clubs.length);
      const ids = [...map.keys()];
      const others = w.clubs.map((club) => club.id).filter((id) => id !== w.playerClub);
      expect(ids).toEqual([w.playerClub, ...others.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]);
      // The own crest keeps the own colour as its primary.
      expect(map.get(w.playerClub)!.primary).toBe(
        w.clubs.find((club) => club.id === w.playerClub)!.color,
      );
    }
  });

  it('keeps every domestic crest when representatives are added later', () => {
    const domestic = structuredClone(withoutRepresentatives(world('legacy-a')));
    for (const id of Object.keys(domestic.tables))
      if (id.startsWith('euro:')) delete domestic.tables[id];
    const before = legacyCrestMap(domestic);
    const grown = { ...domestic, clubs: [...domestic.clubs] };
    ensureRepresentatives(grown);
    expect(grown.clubs.length).toBe(domestic.clubs.length + 160);
    const after = legacyCrestMap(grown);
    for (const club of domestic.clubs) expect(after.get(club.id)).toEqual(before.get(club.id));
  });

  it('leaves the world and its sporting generation untouched', () => {
    const w = careerWorld({ seed: 'legacy-b' });
    const order = w.clubs.map((club) => club.id);
    const snapshot = JSON.stringify(w);
    legacyCrestMap(w);
    legacyCrestMap(withoutRepresentatives(w));
    expect(JSON.stringify(w)).toBe(snapshot);
    expect(w.clubs.map((club) => club.id)).toEqual(order);
    expect(JSON.stringify(careerWorld({ seed: 'legacy-b' }))).toBe(snapshot);
  });

  it('recomputes when the own colour changes on the same clubs array', () => {
    const w = structuredClone(world('crests'));
    const first = legacyCrestMap(w);
    expect(legacyCrestMap(w)).toBe(first);
    w.clubs.find((club) => club.id === w.playerClub)!.color = '#3A7bC2';
    const recoloured = legacyCrestMap(w);
    expect(recoloured).not.toBe(first);
    expect(recoloured.get(w.playerClub)!.primary).toBe('#3A7bC2');
  });

  it('keeps the colour maths and catalog order of the old module', () => {
    expect(luminance('#d62828')).toBe(0.15966926393926958);
    expect(luminance('#3A7bC2')).toBe(0.18960500235393368);
    expect(contrast('#d62828', '#ffffff')).toBe(5.007887089755468);
    expect(contrast('#0b1f44', '#f3e3c3')).toBe(12.821102384198399);
    expect(colourDistance('#d62828', '#c9184a')).toBe(63.44662803786345);
    expect(colourDistance('#3A7bC2', '#1f4fd1')).toBe(99.8184876100114);
    expect([inkOn('#f5e663'), inkOn('#0b1f44')]).toEqual(['#121212', '#ffffff']);
    expect([CREST_PAIRS.length, CREST_FIELDS, CREST_COMBINATIONS]).toEqual([360, 3600, 432000]);
    expect(hash(JSON.stringify(CREST_PAIRS))).toBe(3397386243);
    expect(CREST_PALETTE[0]).toBe('#d62828');
    expect(CREST_PALETTE.at(-1)).toBe('#455a64');
    expect([CREST_SHAPES.length, CREST_PATTERNS.length, CREST_EMBLEMS.length]).toEqual([6, 10, 20]);
  });

  it('imports neither the web app nor React', () => {
    const source = readFileSync(new URL('./identity-legacy.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual([
      '../../contracts/src/identity',
      '../../contracts/src/types',
      './primitives',
    ]);
  });
});
