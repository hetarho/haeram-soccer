import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CREST_EMBLEMS,
  CREST_PALETTE,
  CREST_PATTERNS,
  CREST_SHAPES,
} from '../../contracts/src/identity';
import type { World } from '../../contracts/src/types';
import { ensureRepresentatives } from './europe';
import {
  CREST_COMBINATIONS,
  CREST_FIELDS,
  CREST_PAIRS,
  colourDistance,
  contrast,
  inkOn,
  legacyCrestMap,
  luminance,
  type LegacyCrest,
} from './identity-legacy';
import { createWorld } from './index';
import { hash } from './primitives';

const world = (seed: string, color: string) =>
  createWorld({ country: 'ENG', name: 'Crest Club', color, seed, level: 'normal' as const });
const digest = (map: Map<string, LegacyCrest>) => hash(JSON.stringify([...map]));
const crest = (
  primary: string,
  secondary: string,
  pattern: string,
  shape: string,
  emblem: string,
) => ({ primary, secondary, pattern, shape, emblem });

/**
 * Recorded from the original apps/web/src/ui/crests.ts `crestMap` before the extraction (T236).
 * `digest` hashes every entry in map order (own club first, then ID order); `domestic` is the same
 * world without its European representatives.
 */
const FROZEN = [
  {
    seed: 'crests',
    color: '#24664f',
    digest: 3057270679,
    domestic: 3959773211,
    crests: {
      'ENG:club': crest('#24664f', '#a7b0ba', 'checks', 'shield', 'anchor'),
      'ENG:0:0:0': crest('#121212', '#ffffff', 'quarters', 'round', 'heart'),
      'ENG:0:0:7': crest('#d62828', '#8ecae6', 'cross', 'round', 'moon'),
      'ESP:1:0:3': crest('#fcbf49', '#c9184a', 'chevron', 'crown', 'bird'),
      'GER:2:0:19': crest('#2b9348', '#fcbf49', 'plain', 'crown', 'crown'),
      'ITA:2:1:5': crest('#6a0dad', '#ff8fab', 'hoops', 'crown', 'horseshoe'),
      'euro:0': crest('#6f4518', '#fcbf49', 'sash', 'crown', 'bird'),
      'euro:42': crest('#ff8fab', '#6a0dad', 'cross', 'crown', 'anchor'),
      'euro:159': crest('#9ccc3d', '#2b9348', 'hoops', 'shield', 'tree'),
    },
  },
  {
    seed: 'legacy-a',
    color: '#24664f',
    digest: 1900240654,
    domestic: 842454108,
    crests: {
      'ENG:club': crest('#24664f', '#ffffff', 'quarters', 'crown', 'tower'),
      'ENG:0:0:0': crest('#4fd1a5', '#121212', 'cross', 'shield', 'heart'),
      'ENG:0:0:7': crest('#ffffff', '#ff8fab', 'chevron', 'french', 'wheel'),
      'ESP:1:0:3': crest('#c9184a', '#12493a', 'sash', 'round', 'key'),
      'GER:2:0:19': crest('#a7b0ba', '#c9184a', 'cross', 'shield', 'tree'),
      'ITA:2:1:5': crest('#a7b0ba', '#12493a', 'cross', 'diamond', 'wheel'),
      'euro:0': crest('#2b9348', '#4fd1a5', 'band', 'shield', 'horseshoe'),
      'euro:42': crest('#8ecae6', '#12493a', 'hoops', 'badge', 'tree'),
      'euro:159': crest('#00a6c8', '#6a5acd', 'cross', 'round', 'arrow'),
    },
  },
  {
    seed: 'legacy-b',
    color: '#d62828',
    digest: 1915025131,
    domestic: 3276573418,
    crests: {
      'ENG:club': crest('#d62828', '#9ccc3d', 'hoops', 'french', 'key'),
      'ENG:0:0:0': crest('#00a6c8', '#6f4518', 'hoops', 'badge', 'bolt'),
      'ENG:0:0:7': crest('#6a5acd', '#f5e663', 'sash', 'shield', 'star'),
      'ESP:1:0:3': crest('#2b9348', '#455a64', 'hoops', 'shield', 'flame'),
      'GER:2:0:19': crest('#12493a', '#121212', 'plain', 'round', 'flame'),
      'ITA:2:1:5': crest('#1f4fd1', '#121212', 'plain', 'french', 'clover'),
      'euro:0': crest('#f77f00', '#7f0d16', 'cross', 'crown', 'bolt'),
      'euro:42': crest('#d62828', '#a7b0ba', 'stripes', 'round', 'wheel'),
      'euro:159': crest('#a7b0ba', '#7f0d16', 'hoops', 'round', 'sun'),
    },
  },
  {
    seed: 'crests',
    color: '#3A7bC2',
    digest: 1939581204,
    domestic: 2153877036,
    crests: {
      'ENG:club': crest('#3A7bC2', '#f77f00', 'checks', 'shield', 'anchor'),
      'ENG:0:0:0': crest('#121212', '#ffffff', 'quarters', 'round', 'heart'),
      'ENG:0:0:7': crest('#d62828', '#8ecae6', 'cross', 'round', 'moon'),
      'ESP:1:0:3': crest('#fcbf49', '#c9184a', 'chevron', 'crown', 'bird'),
      'GER:2:0:19': crest('#2b9348', '#fcbf49', 'plain', 'crown', 'crown'),
      'ITA:2:1:5': crest('#6a0dad', '#ff8fab', 'hoops', 'crown', 'horseshoe'),
      'euro:0': crest('#6f4518', '#fcbf49', 'sash', 'crown', 'bird'),
      'euro:42': crest('#ff8fab', '#6a0dad', 'cross', 'crown', 'anchor'),
      'euro:159': crest('#9ccc3d', '#2b9348', 'hoops', 'shield', 'tree'),
    },
  },
] as const;

const worlds = new Map<string, World>();
const frozenWorld = (seed: string, color: string) => {
  const key = `${seed}|${color}`;
  if (!worlds.has(key)) worlds.set(key, world(seed, color));
  return worlds.get(key)!;
};
const withoutRepresentatives = (w: World) => ({
  ...w,
  clubs: w.clubs.filter((club) => !club.id.startsWith('euro:')),
});

describe('legacy crest map (T236)', () => {
  it.each(FROZEN)('keeps the old crests for seed $seed with own colour $color', (frozen) => {
    const w = frozenWorld(frozen.seed, frozen.color);
    expect(w.clubs.find((club) => club.id === w.playerClub)!.color).toBe(frozen.color);
    const map = legacyCrestMap(w);
    expect(map.size).toBe(w.clubs.length);
    for (const [id, expected] of Object.entries(frozen.crests))
      expect(map.get(id)).toEqual(expected);
    expect(digest(map)).toBe(frozen.digest);
    expect(digest(legacyCrestMap(withoutRepresentatives(w)))).toBe(frozen.domestic);
  });

  it('keeps the old fallbacks for an unreadable own colour and a missing own club', () => {
    const w = frozenWorld('crests', '#24664f');
    const unreadable = legacyCrestMap({
      ...w,
      clubs: w.clubs.map((club) => (club.id === w.playerClub ? { ...club, color: 'teal' } : club)),
    });
    expect([...unreadable.keys()][0]).toBe('ENG:club');
    expect(unreadable.get('ENG:club')).toEqual(
      crest('#fcbf49', '#1f4fd1', 'band', 'shield', 'anchor'),
    );
    expect(digest(unreadable)).toBe(1021904830);
    const ownerless = legacyCrestMap({ ...w, playerClub: 'nobody' });
    expect([...ownerless.keys()][0]).toBe('BEL:0:0:0');
    expect(digest(ownerless)).toBe(392807712);
  });

  it('probes the own club first, before every other club in ID order', () => {
    for (const frozen of FROZEN) {
      const w = frozenWorld(frozen.seed, frozen.color);
      const ids = [...legacyCrestMap(w).keys()];
      const others = w.clubs.map((club) => club.id).filter((id) => id !== w.playerClub);
      expect(ids).toEqual([w.playerClub, ...others.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]);
    }
    // Seed s6: the own club and BEL:0:0:7 hash to the same field. Probing the own club first
    // (here with an unreadable colour, so it competes like any club) lets it keep that field and
    // moves BEL:0:0:7 on; in ID order BEL:0:0:7 would win it instead. Recorded from the old module.
    const w = world('s6', '#24664f');
    const ownFirst = legacyCrestMap({
      ...w,
      clubs: w.clubs.map((club) => (club.id === w.playerClub ? { ...club, color: 'teal' } : club)),
    });
    expect(ownFirst.get('ENG:club')).toEqual(crest('#ffffff', '#6a0dad', 'sash', 'crown', 'gem'));
    expect(ownFirst.get('BEL:0:0:7')).toEqual(
      crest('#9ccc3d', '#c9184a', 'quarters', 'diamond', 'anchor'),
    );
    const idOrder = legacyCrestMap({ ...w, playerClub: 'nobody' });
    expect(idOrder.get('ENG:club')).toEqual(crest('#fcbf49', '#6a0dad', 'band', 'crown', 'gem'));
    expect(idOrder.get('BEL:0:0:7')).toEqual(
      crest('#ffffff', '#6a0dad', 'sash', 'diamond', 'anchor'),
    );
  });

  it('keeps every domestic crest when representatives are added later', () => {
    const domestic = structuredClone(withoutRepresentatives(frozenWorld('legacy-a', '#24664f')));
    for (const id of Object.keys(domestic.tables))
      if (id.startsWith('euro:')) delete domestic.tables[id];
    const before = legacyCrestMap(domestic);
    const grown = { ...domestic, clubs: [...domestic.clubs] };
    ensureRepresentatives(grown);
    expect(grown.clubs.length).toBe(domestic.clubs.length + 160);
    const after = legacyCrestMap(grown);
    for (const club of domestic.clubs) expect(after.get(club.id)).toEqual(before.get(club.id));
    expect(digest(after)).toBe(FROZEN[1].digest);
  });

  it('leaves the world and its sporting generation untouched', () => {
    const w = world('legacy-b', '#d62828');
    const order = w.clubs.map((club) => club.id);
    const snapshot = JSON.stringify(w);
    legacyCrestMap(w);
    legacyCrestMap(withoutRepresentatives(w));
    expect(JSON.stringify(w)).toBe(snapshot);
    expect(w.clubs.map((club) => club.id)).toEqual(order);
    expect(JSON.stringify(world('legacy-b', '#d62828'))).toBe(snapshot);
  });

  it('recomputes when the own colour changes on the same clubs array', () => {
    const w = structuredClone(frozenWorld('crests', '#24664f'));
    const first = legacyCrestMap(w);
    expect(legacyCrestMap(w)).toBe(first);
    w.clubs.find((club) => club.id === w.playerClub)!.color = '#3A7bC2';
    const recoloured = legacyCrestMap(w);
    expect(recoloured).not.toBe(first);
    expect(digest(recoloured)).toBe(FROZEN[3].digest);
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
