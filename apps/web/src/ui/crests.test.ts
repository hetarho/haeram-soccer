import { describe, expect, it } from 'vitest';
import type { ClubIdentity } from '../../../../packages/contracts/src/identity';
import type { World } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { legacyCrestMap } from '../../../../packages/engine/src/identity-legacy';
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
  createWorld({ country: 'ENG', name: 'Crest Club', color, seed, level: 'normal' as const });
/** A compatible world from before club identities: the legacy lookup decides every crest. */
const bare = (w: World): World => ({
  ...w,
  clubs: w.clubs.map((club) => {
    const copy = { ...club };
    delete copy.identity;
    return copy;
  }),
});
/** A newly applied own identity: a one-colour crest in other parts over the given shirts. */
const edited = (kits: ClubIdentity['kits']): ClubIdentity => ({
  version: 1,
  colours: ['#6a0dad'],
  crest: { shape: 'diamond', pattern: 'checks', emblem: 'bolt', primary: '#6a0dad' },
  kits,
});

describe('club crests', () => {
  it('offers hundreds of thousands of readable combinations', () => {
    expect(CREST_COMBINATIONS).toBeGreaterThanOrEqual(100000);
    for (const [p, s] of CREST_PAIRS) expect(p).not.toBe(s);
    expect(CREST_FIELDS).toBe(CREST_PAIRS.length * 10);
  });

  it('gives every club in the world its own colours and pattern', () => {
    const w = bare(world());
    const crests = [...crestMap(w).values()];
    expect(crests).toHaveLength(w.clubs.length);
    expect(new Set(crests.map((c) => `${c.primary}${c.secondary}${c.pattern}`)).size).toBe(
      w.clubs.length,
    );
    for (const crest of crests)
      if (crest.primary !== w.clubs.find((c) => c.id === w.playerClub)!.color)
        expect(contrast(crest.primary, crest.secondary!)).toBeGreaterThanOrEqual(1.8);
  });

  it('is stable per seed and keeps the founding colour', () => {
    const a = bare(world('#d62828')),
      b = bare(world('#d62828'));
    const id = a.clubs[40].id;
    expect(crestOf(a, id)).toEqual(crestOf(b, id));
    expect(crestOf(a, a.playerClub).primary).toBe('#d62828');
    expect(crestOf(bare(world('#d62828', 'other seed')), id)).not.toEqual(crestOf(a, id));
  });

  it('keeps earlier crests when European entrants join later', () => {
    const w = bare(world());
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

  it('keeps a crest without a secondary in its primary instead of generating a colour', () => {
    const red = { primary: '#d62828', shape: 'shield', pattern: 'plain', emblem: 'star' } as const;
    expect(kits(red, { ...red, primary: '#c9184a' })).toEqual(['#d62828', '#c9184a']);
    // A dark shirt on grass has nothing to switch to.
    expect(kits({ ...red, primary: '#12493a' }, red)).toEqual(['#12493a', '#d62828']);
  });

  it('reads applied identities, which a new world installs as the exact legacy crests', () => {
    const w = world();
    expect(w.clubs.every((club) => club.identity)).toBe(true);
    expect(Object.fromEntries(crestMap(w))).toEqual(Object.fromEntries(legacyCrestMap(bare(w))));
    for (const club of [w.clubs[0], w.clubs[40], w.clubs.at(-1)!])
      expect(crestOf(w, club.id)).toBe(club.identity!.crest);
    expect(crestOf(w, 'nowhere')).toEqual(crestOf(w, undefined));
  });

  it('shows a replaced own identity and leaves every opponent crest as it was', () => {
    const w = world();
    const before = crestMap(w);
    const own = w.clubs.find((club) => club.id === w.playerClub)!;
    const next = edited(own.identity!.kits);
    // A new view carries the replaced identity; the owner's colour follows it (→KIT-9).
    const after: World = {
      ...w,
      clubs: w.clubs.map((club) =>
        club === own ? { ...club, color: '#6a0dad', identity: next } : club,
      ),
    };
    expect(crestOf(after, w.playerClub)).toBe(next.crest);
    const map = crestMap(after);
    expect(map.get(w.playerClub)).toBe(next.crest);
    for (const club of w.clubs)
      if (club.id !== w.playerClub) expect(map.get(club.id)).toEqual(before.get(club.id));
  });

  it('never lets the legacy cache hide an own crest applied to a world without identities', () => {
    const w = bare(world());
    const legacy = new Map(legacyCrestMap(w));
    // The legacy lookup is cached on this clubs array, seed and own colour, none of which change.
    expect(crestOf(w, w.playerClub)).toEqual(legacy.get(w.playerClub));
    const own = w.clubs.find((club) => club.id === w.playerClub)!;
    own.identity = edited({
      home: { pattern: 'plain', primary: own.color },
      away: { pattern: 'plain', primary: '#ffffff' },
      third: { pattern: 'plain', primary: '#0b1f44' },
    });
    expect(crestOf(w, w.playerClub)).toBe(own.identity.crest);
    const map = crestMap(w);
    expect(map.get(w.playerClub)).toBe(own.identity.crest);
    // Every other club keeps its exact legacy assignment.
    for (const club of w.clubs)
      if (club.id !== w.playerClub) expect(map.get(club.id)).toEqual(legacy.get(club.id));
  });
});
