import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import {
  CREST_COMBINATIONS,
  CREST_FIELDS,
  CREST_PAIRS,
  colourDistance,
  contrast,
  crestMap,
  crestOf,
  kits,
} from './crests';

const world = (color = '#24664f', seed = 'crests') =>
  createWorld({ country: 'ENG', name: 'Crest Club', color, seed, difficulty: 1 });

describe('club crests', () => {
  it('offers hundreds of thousands of readable combinations', () => {
    expect(CREST_COMBINATIONS).toBeGreaterThanOrEqual(100000);
    for (const [p, s] of CREST_PAIRS) expect(p).not.toBe(s);
    expect(CREST_FIELDS).toBe(CREST_PAIRS.length * 10);
  });

  it('gives every club in the world its own colours and pattern', () => {
    const w = world();
    const crests = [...crestMap(w).values()];
    expect(crests).toHaveLength(w.clubs.length);
    expect(new Set(crests.map((c) => `${c.primary}${c.secondary}${c.pattern}`)).size).toBe(
      w.clubs.length,
    );
    for (const crest of crests)
      if (crest.primary !== w.clubs.find((c) => c.id === w.playerClub)!.color)
        expect(contrast(crest.primary, crest.secondary)).toBeGreaterThanOrEqual(1.8);
  });

  it('is stable per seed and keeps the founding colour', () => {
    const a = world('#d62828'),
      b = world('#d62828');
    const id = a.clubs[40].id;
    expect(crestOf(a, id)).toEqual(crestOf(b, id));
    expect(crestOf(a, a.playerClub).primary).toBe('#d62828');
    expect(crestOf(world('#d62828', 'other seed'), id)).not.toEqual(crestOf(a, id));
  });

  it('keeps earlier crests when European entrants join later', () => {
    const w = world();
    const domestic = w.clubs.filter((club) => !club.id.startsWith('euro:'));
    const before = crestMap({ ...w, clubs: domestic });
    const after = crestMap(w);
    for (const club of domestic) expect(after.get(club.id)).toEqual(before.get(club.id));
  });

  it('changes the away kit when the shirts would clash', () => {
    const red = {
      primary: '#d62828',
      secondary: '#ffffff',
      shape: 'shield',
      pattern: 'plain',
      emblem: 'star',
    } as const;
    const alsoRed = { ...red, primary: '#c9184a', secondary: '#121212' };
    expect(kits(red, alsoRed)).toEqual(['#d62828', '#121212']);
    expect(colourDistance(...kits(red, { ...red, primary: '#1f4fd1' }))).toBeGreaterThan(150);
  });
});
