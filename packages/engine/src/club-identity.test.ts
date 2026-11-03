import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical } from '../../contracts/src/index';
import { CREST_PALETTE, type ClubIdentity } from '../../contracts/src/identity';
import { clubIdentitySchema } from '../../contracts/src/identitySchema';
import type { World } from '../../contracts/src/types';
import type { CareerInput } from './career.testkit';
import { identityOf, installMissingIdentities } from './club-identity';
import { ensureRepresentatives } from './europe';
import { legacyCrestMap } from './identity-legacy';
import { advanceDays } from './index';
import { clubOf } from './world';

const INPUT: CareerInput = { country: 'ENG', seed: 'identity' };
/** A deliberately custom design: three colours, mixed-case spelling, every region used. */
const CUSTOM: ClubIdentity = {
  version: 1,
  colours: ['#3A7bC2', '#F5E663', '#121212'],
  crest: {
    shape: 'badge',
    pattern: 'halves',
    emblem: 'anchor',
    primary: '#3A7bC2',
    accent: '#F5E663',
  },
  kits: {
    home: { pattern: 'hoops', primary: '#3A7bC2', secondary: '#F5E663', trim: '#121212' },
    away: { pattern: 'plain', primary: '#F5E663' },
    third: { pattern: 'checks', primary: '#121212', secondary: '#3A7bC2' },
  },
};
/** A fresh copy of the career taken over with INPUT, its club keeping its generated identity. */
const founded = () => simulatedWorld(INPUT);
/** A compatible world from before identities: the same career with every identity removed. */
function withoutIdentities(w: World) {
  for (const club of w.clubs) delete club.identity;
  return w;
}
/** The legacy crests computed afresh, not through the shared cache. */
const legacyOf = (w: World) => legacyCrestMap({ ...w, clubs: w.clubs.slice() });
const others = (w: World) => w.clubs.filter((club) => club.id !== w.playerClub);

describe('installing missing identities (→KIT-11, KIT-15)', () => {
  it('installs only missing identities and is idempotent', () => {
    const w = founded();
    w.clubs[1].identity = structuredClone(CUSTOM);
    const expected = canonical(w);
    const ids = w.clubs.map((club) => club.id);
    w.clubs.forEach((club, i) => {
      if (i % 3 === 0) delete club.identity;
    });
    expect(installMissingIdentities(w)).toBe(true);
    expect(canonical(w)).toBe(expected);
    expect(w.clubs.map((club) => club.id)).toEqual(ids);
    expect(w.clubs[1].identity).toEqual(CUSTOM);
    expect(installMissingIdentities(w)).toBe(false);
    expect(canonical(w)).toBe(expected);
  });

  it('preserves every legacy crest and NPC colour', () => {
    const w = withoutIdentities(founded());
    const colours = w.clubs.map((club) => club.color);
    const legacy = legacyOf(w);
    installMissingIdentities(w);
    w.clubs.forEach((club, i) => {
      const crest = legacy.get(club.id)!;
      expect(club.color).toBe(colours[i]);
      expect(club.identity).toEqual({
        version: 1,
        colours: [colours[i], crest.secondary],
        crest: { ...crest },
        kits: {
          home: { pattern: 'stripes', primary: colours[i], secondary: crest.secondary },
          away: { pattern: 'plain', primary: '#ffffff', trim: colours[i] },
          third: { pattern: 'plain', primary: '#0b1f44', trim: crest.secondary },
        },
      });
    });
    // An NPC crest keeps its palette primary beside the club's own stored colour.
    expect(others(w).some((club) => club.identity!.crest.primary !== club.color)).toBe(true);
    // A new world installs exactly these identities as it is made, nobody's (→WORLD-13): the same
    // installation with no own club first gives every club the identity the career holds.
    const made = withoutIdentities(founded());
    installMissingIdentities({ ...made, playerClub: '' });
    expect(canonical(made.clubs)).toBe(canonical(founded().clubs));
  });

  it('own edits do not reroll opponents', () => {
    const w = founded();
    const before = others(w).map((club) => canonical(identityOf(w, club.id)));
    const legacy = legacyOf(w);
    // A new own primary that would move some other club's legacy crest.
    const colour = CREST_PALETTE.find((primary) => {
      const moved = legacyOf({
        ...w,
        clubs: w.clubs.map((club) =>
          club.id === w.playerClub ? { ...club, color: primary } : club,
        ),
      });
      return others(w).some(
        (club) => canonical(moved.get(club.id)) !== canonical(legacy.get(club.id)),
      );
    })!;
    expect(colour).toBeDefined();
    const own = clubOf(w);
    own.color = colour;
    own.identity = { ...structuredClone(CUSTOM), colours: [colour] };
    expect(others(w).map((club) => canonical(identityOf(w, club.id)))).toEqual(before);
    expect(installMissingIdentities(w)).toBe(false);
    expect(others(w).map((club) => canonical(club.identity))).toEqual(before);
  });

  it('later European entrants keep all earlier identities', () => {
    const full = founded();
    const w = founded();
    w.clubs = w.clubs.filter((club) => !club.id.startsWith('euro:'));
    for (const id of Object.keys(w.tables)) if (id.startsWith('euro:')) delete w.tables[id];
    const earlier = canonical(w.clubs);
    const count = w.clubs.length;
    // A lookup before the entrants arrive caches this very clubs array.
    legacyCrestMap(w);
    ensureRepresentatives(w);
    expect(w.clubs.length).toBe(full.clubs.length);
    expect(canonical(w.clubs.slice(0, count))).toBe(earlier);
    for (const club of w.clubs.slice(count)) {
      expect(club.id.startsWith('euro:')).toBe(true);
      expect(club.identity).toEqual(full.clubs.find((c) => c.id === club.id)!.identity);
    }
    const after = canonical(w.clubs);
    ensureRepresentatives(w);
    expect(canonical(w.clubs)).toBe(after);
  });
});

it('identityOf on a compatible world without identities is pure', () => {
  const base = withoutIdentities(founded());
  const read = structuredClone(base);
  const before = canonical(base);
  const identities = read.clubs.map((club) => identityOf(read, club.id));
  expect(canonical(read)).toBe(before);
  for (const identity of identities)
    expect(clubIdentitySchema.safeParse(identity).success).toBe(true);
  // The same defaults an installation would write, and an applied identity is returned as stored.
  const installed = structuredClone(base);
  installMissingIdentities(installed);
  expect(identities).toEqual(installed.clubs.map((club) => club.identity));
  expect(identityOf(installed, installed.playerClub)).toBe(clubOf(installed).identity);
  expect(() => identityOf(read, 'nobody')).toThrow();
  // Reading changes no later sporting fact, revision or ID.
  advanceDays(base, 7, undefined, false);
  advanceDays(read, 7, undefined, false);
  expect(read.revision).toBe(base.revision);
  expect(canonical(read)).toBe(canonical(base));
});
