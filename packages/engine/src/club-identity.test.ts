import { describe, expect, it, vi } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  CREST_PALETTE,
  CREST_PRESETS,
  CREST_SHAPES,
  type ClubIdentity,
} from '../../contracts/src/identity';
import { clubIdentitySchema } from '../../contracts/src/identitySchema';
import type { Founding, World } from '../../contracts/src/types';
import {
  createIdentityDraft,
  identityOf,
  installMissingIdentities,
  presetCrests,
} from './club-identity';
import { ensureRepresentatives } from './europe';
import { legacyCrestMap } from './identity-legacy';
import { advanceDays, createWorld } from './index';
import { clubOf } from './world';

const INPUT: Founding = {
  country: 'ENG',
  name: 'Identity United',
  color: '#3A7bC2',
  seed: 'identity',
  level: 'normal',
};
/** A deliberately custom founding design: three colours, mixed-case spelling, every region used. */
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
/** A fresh copy of the world founded with INPUT and no explicit identity. */
const founded = () => simulatedWorld(INPUT);
/** A compatible world from before identities: the same founding with every identity removed. */
function withoutIdentities(w: World) {
  for (const club of w.clubs) delete club.identity;
  return w;
}
/** The legacy crests computed afresh, not through the shared cache. */
const legacyOf = (w: World) => legacyCrestMap({ ...w, clubs: w.clubs.slice() });
const others = (w: World) => w.clubs.filter((club) => club.id !== w.playerClub);

describe('founding drafts (→KIT-14)', () => {
  it('default drafts are deterministic and complete', () => {
    const random = vi.spyOn(Math, 'random');
    const draft = createIdentityDraft(INPUT);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(createIdentityDraft({ ...INPUT })).toEqual(draft);
    expect(clubIdentitySchema.parse(draft)).toEqual(draft);
    // The requested primary in its own spelling, with the secondary the own legacy crest wears.
    const legacy = legacyOf(founded()).get('ENG:club')!;
    expect(draft.colours).toEqual(['#3A7bC2', legacy.secondary]);
    const [primary, secondary] = draft.colours as [string, string];
    expect(draft.kits).toEqual({
      home: { pattern: 'stripes', primary, secondary },
      away: { pattern: 'plain', primary: '#ffffff', trim: primary },
      third: { pattern: 'plain', primary: '#0b1f44', trim: secondary },
    });
    expect(presetCrests(draft.colours)).toContainEqual(draft.crest);
    // Six complete ready-made crests, one per outer shape, in the contract's order.
    const presets = presetCrests(draft.colours);
    expect(presets.map(({ shape, pattern, emblem }) => ({ shape, pattern, emblem }))).toEqual(
      CREST_PRESETS,
    );
    expect(presets.map((crest) => crest.shape).sort()).toEqual([...CREST_SHAPES].sort());
    for (const crest of presets) expect(crest).toMatchObject({ primary, secondary });
    // Seed and country choose among all six templates; the name and level never matter.
    const shapes = new Set(
      Array.from(
        { length: 40 },
        (_, i) => createIdentityDraft({ ...INPUT, seed: `s${i}` }).crest.shape,
      ),
    );
    expect(shapes.size).toBe(6);
    expect(createIdentityDraft({ ...INPUT, name: 'Other', level: 'easy' } as Founding)).toEqual(
      draft,
    );
    expect(() => createIdentityDraft({ ...INPUT, color: 'red' })).toThrow();
  });

  it('founding installs the exact explicit draft', () => {
    const identity = structuredClone(CUSTOM);
    const w = createWorld({ ...INPUT, identity });
    expect(clubOf(w).identity).toEqual(CUSTOM);
    expect(clubOf(w).identity).not.toBe(identity);
    expect(clubOf(w).color).toBe('#3A7bC2');
    identity.kits.home.primary = '#000000';
    expect(clubOf(w).identity).toEqual(CUSTOM);
    expect(() => validateWorld(structuredClone(w))).not.toThrow();
    // The draft changes nothing else: opponents, players, money and the calendar are the same.
    const plain = founded();
    for (const world of [w, plain]) delete clubOf(world).identity;
    expect(canonical(w)).toBe(canonical(plain));
  });

  it.each<[string, unknown]>([
    ['four colours', { ...CUSTOM, colours: ['#111111', '#222222', '#333333', '#444444'] }],
    [
      'a missing third shirt',
      { ...CUSTOM, kits: { home: CUSTOM.kits.home, away: CUSTOM.kits.away } },
    ],
    ['an unknown field', { ...CUSTOM, sponsor: 'x' }],
    ['a future version', { ...CUSTOM, version: 2 }],
    [
      'a named colour',
      { ...CUSTOM, kits: { ...CUSTOM.kits, away: { pattern: 'plain', primary: 'red' } } },
    ],
    [
      'a plain shirt with a secondary',
      { ...CUSTOM, kits: { ...CUSTOM.kits, away: { ...CUSTOM.kits.away, secondary: '#ffffff' } } },
    ],
  ])('invalid explicit founding identity leaves no world: %s', (_, identity) => {
    const before = JSON.stringify(identity);
    expect(() => createWorld({ ...INPUT, identity: identity as ClubIdentity })).toThrow(
      '구단 디자인',
    );
    expect(JSON.stringify(identity)).toBe(before);
  });

  it('explicit input colour must match representative primary', () => {
    for (const color of ['#123456', '#3a7bc2'])
      expect(() => createWorld({ ...INPUT, color, identity: CUSTOM })).toThrow('구단 디자인');
    // Scripted callers that send only the colour still found a club, wearing that colour.
    expect(INPUT.identity).toBeUndefined();
    expect(clubOf(founded()).identity?.colours[0]).toBe('#3A7bC2');
  });
});

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
    // A new world is founded with exactly these identities.
    expect(canonical(founded())).toBe(canonical(w));
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
    // An explicit founding design leaves every opponent as a plain founding would.
    const explicit = createWorld({ ...INPUT, identity: CUSTOM });
    expect(others(explicit).map((club) => canonical(club.identity))).toEqual(before);
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
