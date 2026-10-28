import { describe, expect, it } from 'vitest';
import { createWorld } from '../../engine/src/index';
import { nextOwnFixture } from '../../engine/src/calendar';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical } from './index';
import {
  CREST_PALETTE,
  type ClubIdentity,
  type GoalkeeperKit,
  type MatchAppearance,
  type WornKeeper,
} from './identity';
import {
  CURRENT_IDENTITY_VERSION,
  assertAppearanceFormatVersion,
  assertIdentityFormatVersions,
  clubIdentitySchema,
  matchAppearanceSchema,
  normaliseIdentity,
  shirtDesignSchema,
} from './identitySchema';
import { validateWorld } from './schema';
import type { World } from './types';
import { SaveCompatibilityError } from './versions';

const founding = {
  country: 'ENG' as const,
  name: 'Identity Rovers',
  color: '#224466',
  seed: 'identity-contract',
  level: 'easy' as const,
};
const world = () => createWorld(founding);
/** A world saved before club identities: new worlds now install them all (→KIT-11). */
const compatible = () => {
  const w = world();
  for (const club of w.clubs) delete club.identity;
  return w;
};
const identity = (): ClubIdentity => ({
  version: 1,
  colours: ['#224466', '#FFFFFF'],
  crest: {
    shape: 'shield',
    pattern: 'stripes',
    emblem: 'star',
    primary: '#224466',
    secondary: '#ffffff',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#224466', secondary: '#FFFFFF' },
    away: { pattern: 'plain', primary: '#ffffff', trim: '#224466' },
    third: { pattern: 'plain', primary: '#0b1f44', trim: '#FFFFFF' },
  },
});
const appearance = (home: string, away: string): MatchAppearance => {
  const { crest, kits } = identity();
  return {
    version: 1,
    sides: [
      { club: home, crest, role: 'home', shirt: kits.home, goalkeeper: '#f5e663' },
      { club: away, crest, role: 'away', shirt: kits.away, goalkeeper: '#9ccc3d' },
    ],
    warnings: [],
  };
};
const parses = (value: unknown) => clubIdentitySchema.safeParse(value).success;

describe('club identity vocabulary (→KIT-1, KIT-2, KIT-3)', () => {
  it('keeps the existing 24-colour crest palette in its original order', () => {
    expect(CREST_PALETTE).toHaveLength(24);
    expect([CREST_PALETTE[0], CREST_PALETTE[12], CREST_PALETTE[23]]).toEqual([
      '#d62828',
      '#0b1f44',
      '#455a64',
    ]);
  });

  it('accepts one, two or three representative colours and rejects none or a fourth', () => {
    for (const colours of [['#224466'], ['#224466', '#ffffff'], ['#224466', '#ffffff', '#d62828']])
      expect(parses({ ...identity(), colours })).toBe(true);
    expect(parses({ ...identity(), colours: [] })).toBe(false);
    expect(parses({ ...identity(), colours: ['#224466', '#ffffff', '#d62828', '#121212'] })).toBe(
      false,
    );
  });

  it('requires all three kit roles', () => {
    const kits: Partial<ClubIdentity['kits']> = identity().kits;
    delete kits.third;
    expect(parses({ ...identity(), kits })).toBe(false);
  });

  it('rejects unknown fields, future versions and invalid colours', () => {
    expect(parses({ ...identity(), motto: 'x' })).toBe(false);
    expect(parses({ ...identity(), crest: { ...identity().crest, outline: '#000000' } })).toBe(
      false,
    );
    expect(parses({ ...identity(), version: 2 })).toBe(false);
    for (const bad of ['#22446', '#2244667', 'red', '#22446g', 'url(#a)', '#224466ff'])
      expect(parses({ ...identity(), colours: [bad] })).toBe(false);
  });

  it('validates plain and patterned shirt regions', () => {
    expect(shirtDesignSchema.safeParse({ pattern: 'plain', primary: '#ffffff' }).success).toBe(
      true,
    );
    expect(
      shirtDesignSchema.safeParse({ pattern: 'plain', primary: '#ffffff', secondary: '#000000' })
        .success,
    ).toBe(false);
    expect(shirtDesignSchema.safeParse({ pattern: 'sash', primary: '#ffffff' }).success).toBe(
      false,
    );
    expect(
      shirtDesignSchema.safeParse({
        pattern: 'chevron',
        primary: '#ffffff',
        secondary: '#ffffff',
        trim: '#ffffff',
      }).success,
    ).toBe(true);
    // Crest field patterns are not shirt patterns.
    expect(
      shirtDesignSchema.safeParse({ pattern: 'quarters', primary: '#ffffff', secondary: '#000000' })
        .success,
    ).toBe(false);
  });

  it('preserves the literal spelling of custom colours', () => {
    const parsed = clubIdentitySchema.parse(identity());
    expect(parsed.colours).toEqual(['#224466', '#FFFFFF']);
    expect(parsed.kits.home.secondary).toBe('#FFFFFF');
    expect(parsed.kits.third.trim).toBe('#FFFFFF');
  });

  it('rejects unknown appearance warnings and fields', () => {
    const value = appearance('a', 'b');
    expect(matchAppearanceSchema.safeParse(value).success).toBe(true);
    expect(matchAppearanceSchema.safeParse({ ...value, warnings: ['sky'] }).success).toBe(false);
    expect(matchAppearanceSchema.safeParse({ ...value, frames: [] }).success).toBe(false);
  });
});

const KEEPER: GoalkeeperKit = {
  shirt: { pattern: 'hoops', primary: '#F5E663', secondary: '#121212', trim: '#ffffff' },
  shorts: '#121212',
  socks: '#F5E663',
  gloves: '#00a6c8',
};
const v2 = (extra: Partial<ClubIdentity>): ClubIdentity => ({
  ...identity(),
  version: 2,
  ...extra,
});
/** A version-2 appearance: whole kits on both sides, the away keeper a fallback. */
const kitAppearance = (home: string, away: string): MatchAppearance => {
  const [first, second] = appearance(home, away).sides;
  return {
    version: 2,
    sides: [
      {
        ...first,
        goalkeeper: '#F5E663',
        shorts: '#FFFFFF',
        socks: '#224466',
        keeper: structuredClone(KEEPER),
      },
      {
        ...second,
        shorts: '#224466',
        socks: '#ffffff',
        keeper: {
          shirt: { pattern: 'plain', primary: '#9ccc3d' },
          shorts: '#9ccc3d',
          socks: '#9ccc3d',
          gloves: '#111111',
        },
        keeperFallback: true,
      },
    ],
    warnings: ['goalkeepers'],
  };
};

describe('identity versions 1 and 2 (→KIT-3, KIT-8, SAVE-20)', () => {
  it('accepts version 1 unchanged and version 2 with kit parts and/or a goalkeeper kit', () => {
    expect(parses(identity())).toBe(true);
    for (const extra of [
      { parts: { home: { shorts: '#121212' } } },
      { parts: { away: { socks: '#FFFFFF' }, third: { shorts: '#d62828', socks: '#d62828' } } },
      { goalkeeper: KEEPER },
      { parts: { home: { shorts: '#121212' } }, goalkeeper: KEEPER },
      // Entries that set nothing are harmless beside a set part or a goalkeeper kit.
      { parts: { home: {}, away: { socks: '#121212' } } },
      { parts: {}, goalkeeper: KEEPER },
    ])
      expect(parses(v2(extra)), JSON.stringify(extra)).toBe(true);
    // Any shirt pattern and free colours, the literal spelling kept.
    const parsed = clubIdentitySchema.parse(v2({ goalkeeper: KEEPER }));
    expect(parsed.goalkeeper).toEqual(KEEPER);
  });

  it('rejects version 2 without either field and version 1 with one', () => {
    for (const extra of [{}, { parts: {} }, { parts: { home: {}, third: {} } }])
      expect(parses(v2(extra)), JSON.stringify(extra)).toBe(false);
    for (const extra of [{ parts: { home: { shorts: '#121212' } } }, { goalkeeper: KEEPER }])
      expect(parses({ ...identity(), ...extra }), JSON.stringify(extra)).toBe(false);
    // Malformed parts and goalkeeper kits.
    for (const extra of [
      { parts: { fourth: { shorts: '#121212' } } },
      { parts: { home: { boots: '#121212' } } },
      { parts: { home: { shorts: 'black' } } },
      { goalkeeper: { ...KEEPER, gloves: undefined } },
      { goalkeeper: { ...KEEPER, cap: '#121212' } },
      { goalkeeper: { ...KEEPER, shirt: { pattern: 'checks', primary: '#121212' } } },
    ])
      expect(parses(v2(extra as Partial<ClubIdentity>)), JSON.stringify(extra)).toBe(false);
    expect(parses({ ...v2({ goalkeeper: KEEPER }), version: 3 })).toBe(false);
  });

  it('normalises to the canonical version', () => {
    // Empty entries go, and the version follows what is left.
    expect(normaliseIdentity(v2({ parts: { home: {}, away: { socks: '#121212' } } }))).toEqual(
      v2({ parts: { away: { socks: '#121212' } } }),
    );
    expect(normaliseIdentity(v2({ parts: { home: {} } }))).toEqual(identity());
    expect(normaliseIdentity({ ...identity(), parts: { third: { shorts: '#121212' } } })).toEqual(
      v2({ parts: { third: { shorts: '#121212' } } }),
    );
    expect(normaliseIdentity(v2({ parts: {}, goalkeeper: KEEPER }))).toEqual(
      v2({ goalkeeper: KEEPER }),
    );
    expect(normaliseIdentity(identity())).toEqual(identity());
    // A copy every time.
    const source = v2({ goalkeeper: structuredClone(KEEPER) });
    const copy = normaliseIdentity(source);
    expect(copy.goalkeeper).not.toBe(source.goalkeeper);
    expect(copy.kits).not.toBe(source.kits);
    for (const extra of [{ parts: { home: { shorts: '#121212' }, away: {} } }, {}])
      expect(parses(normaliseIdentity(v2(extra)))).toBe(true);
  });

  it('accepts version-1 and version-2 appearances and nothing in between', () => {
    expect(matchAppearanceSchema.safeParse(appearance('a', 'b')).success).toBe(true);
    const value = kitAppearance('a', 'b');
    expect(matchAppearanceSchema.parse(value)).toEqual(value);
    const damaged: [string, (a: MatchAppearance) => unknown][] = [
      ['v2 without shorts', (a) => (delete a.sides[0].shorts, a)],
      ['v2 without socks', (a) => (delete a.sides[1].socks, a)],
      ['v2 without keeper', (a) => (delete a.sides[1].keeper, a)],
      [
        'v2 shirt-only sides',
        (a) => ({ ...appearance('a', 'b'), version: 2, warnings: a.warnings }),
      ],
      ['v1 with whole kits', (a) => ({ ...a, version: 1 })],
      ['v3', (a) => ({ ...a, version: 3 })],
      ['keeper colour mismatch', (a) => ((a.sides[0].goalkeeper = '#000000'), a)],
      ['false fallback', (a) => ((a.sides[1].keeperFallback = false as never), a)],
      [
        'keeper without gloves',
        (a) => (delete (a.sides[0].keeper as Partial<WornKeeper>).gloves, a),
      ],
    ];
    for (const [name, damage] of damaged)
      expect(matchAppearanceSchema.safeParse(damage(kitAppearance('a', 'b'))).success, name).toBe(
        false,
      );
  });
});

describe('optional identity fields on a compatible world (→SAVE-20, SAVE-21)', () => {
  it('preserves the absence of identity, kit choice and appearance', () => {
    const w = compatible();
    const parsed = validateWorld(structuredClone(w));
    expect(parsed.clubs.some((c) => 'identity' in c)).toBe(false);
    expect('kitChoice' in parsed).toBe(false);
    expect(canonical(parsed)).toBe(canonical(w));
  });

  it('keeps an explicit identity exactly', () => {
    const w = compatible();
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    own.identity = identity();
    const parsed = validateWorld(structuredClone(w));
    expect(parsed.clubs.find((c) => c.id === w.playerClub)!.identity).toEqual(identity());
    expect(parsed.clubs.filter((c) => c.identity)).toHaveLength(1);
  });

  it('keeps the world schema at 1', () => {
    expect(() => validateWorld({ ...world(), schema: 2 })).toThrow();
  });
});

describe('identity version preflight (→SAVE-22)', () => {
  it('names a future club identity version as a compatibility error, not corruption', () => {
    expect(CURRENT_IDENTITY_VERSION).toBe(2);
    const w = world();
    (w.clubs[3] as unknown as { identity: unknown }).identity = {
      ...v2({ goalkeeper: KEEPER }),
      version: 3,
    };
    expect(() => assertIdentityFormatVersions(w)).toThrow(SaveCompatibilityError);
    expect(() => validateWorld(w)).toThrow(SaveCompatibilityError);
  });

  it('keeps version-1 and version-2 identities and appearances in a world exactly', () => {
    const w = simulatedWorld(founding, { rounds: 2 });
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    own.identity = v2({ parts: { home: { shorts: '#121212' } }, goalkeeper: KEEPER });
    const [first, second] = w.ownMatches;
    first.appearance = appearance(first.home, first.away);
    second.appearance = kitAppearance(second.home, second.away);
    expect(() => assertIdentityFormatVersions(w)).not.toThrow();
    const parsed = validateWorld(structuredClone(w));
    expect(parsed.clubs.find((c) => c.id === w.playerClub)!.identity).toEqual(own.identity);
    expect(parsed.ownMatches[0].appearance).toEqual(first.appearance);
    expect(parsed.ownMatches[1].appearance).toEqual(second.appearance);
    // Other clubs keep their version-1 designs as they were.
    expect(parsed.clubs.filter((c) => c.identity?.version === 1).length).toBe(w.clubs.length - 1);
  });

  it('lets current, missing and invalid markers through to strict validation', () => {
    for (const version of [1, 2, undefined, 0, -1, 1.5, '3', null]) {
      const w = world();
      (w.clubs[0] as unknown as { identity: unknown }).identity = { ...identity(), version };
      expect(() => assertIdentityFormatVersions(w)).not.toThrow();
    }
    expect(() => assertIdentityFormatVersions(null)).not.toThrow();
    expect(() => assertIdentityFormatVersions([])).not.toThrow();
  });

  it('checks one appearance version and bounds the scan', () => {
    expect(() => assertAppearanceFormatVersion({ version: 3 })).toThrow(SaveCompatibilityError);
    expect(() => assertAppearanceFormatVersion({ version: 1 })).not.toThrow();
    expect(() => assertAppearanceFormatVersion({ version: 2 })).not.toThrow();
    expect(() => assertAppearanceFormatVersion(undefined)).not.toThrow();
    expect(() =>
      assertIdentityFormatVersions({ ownMatches: [{ appearance: { version: 3 } }] }),
    ).toThrow(SaveCompatibilityError);
    expect(() =>
      assertIdentityFormatVersions({ ownMatches: [{ appearance: { version: 2 } }] }),
    ).not.toThrow();
    expect(() => assertIdentityFormatVersions({ clubs: new Array(1001).fill({}) })).toThrow(
      /허용 범위/,
    );
    expect(() =>
      assertIdentityFormatVersions({ clubs: [], ownMatches: new Array(100001).fill(null) }),
    ).toThrow(/허용 범위/);
  });
});

describe('world references of identity data (→KIT-7, KIT-12)', () => {
  const played = () => simulatedWorld(founding, { rounds: 2 });

  it('accepts an appearance whose sides are the record home then away', () => {
    const w = played();
    const m = w.ownMatches[0];
    m.appearance = appearance(m.home, m.away);
    expect(validateWorld(structuredClone(w)).ownMatches[0].appearance).toEqual(m.appearance);
  });

  it('rejects swapped appearance side IDs', () => {
    const w = played();
    const m = w.ownMatches[0];
    m.appearance = appearance(m.away, m.home);
    expect(() => validateWorld(w)).toThrow('경기 복장 기록 참조 손상');
  });

  it('accepts a kit choice for any unplayed own fixture of the season, not only the earliest', () => {
    const w = world();
    const own = w.fixtures.filter(
      (f) => !f.score && f.year === w.year && (f.home === w.playerClub || f.away === w.playerClub),
    );
    const later = own.find((f) => f.id !== nextOwnFixture(w)!.id)!;
    w.kitChoice = { fixtureId: later.id, role: 'third' };
    expect(validateWorld(structuredClone(w)).kitChoice).toEqual(w.kitChoice);
  });

  it('accepts a kit choice naming an own cup or European fixture', () => {
    const w = played();
    const other = [
      ...(w.cups || []).flatMap((c) => c.fixtures),
      ...w.europe.flatMap((t) => t.fixtures),
    ].filter(
      (f) => !f.score && f.year === w.year && (f.home === w.playerClub || f.away === w.playerClub),
    );
    // A cup tie need not be drawn yet; synthesize one in the owner's cup to cover the lookup.
    const cup = (w.cups || []).find((c) => c.clubs.includes(w.playerClub));
    if (!other.length && cup) {
      const opponent = cup.clubs.find((c) => c !== w.playerClub)!;
      cup.fixtures.push({
        id: 'identity-cup-tie',
        year: w.year,
        round: w.round + 3,
        kind: 'cup',
        home: w.playerClub,
        away: opponent,
        country: cup.country,
        groupKey: 'cup',
      });
    }
    const target = other[0]?.id ?? 'identity-cup-tie';
    w.kitChoice = { fixtureId: target, role: 'away' };
    expect(validateWorld(structuredClone(w)).kitChoice?.fixtureId).toBe(target);
  });

  it('rejects a kit choice for a played, unknown, past-season or other-club fixture', () => {
    const w = played() as World;
    const playedOwn = w.fixtures.find(
      (f) => f.score && (f.home === w.playerClub || f.away === w.playerClub),
    )!;
    const otherClubs = w.fixtures.find(
      (f) => !f.score && f.home !== w.playerClub && f.away !== w.playerClub,
    )!;
    for (const fixtureId of [playedOwn.id, 'no-such-fixture', otherClubs.id]) {
      const copy = structuredClone(w);
      copy.kitChoice = { fixtureId, role: 'home' };
      expect(() => validateWorld(copy)).toThrow('경기 복장 선택 참조 손상');
    }
    const lastSeason = structuredClone(w);
    const unplayed = lastSeason.fixtures.find(
      (f) => !f.score && (f.home === w.playerClub || f.away === w.playerClub),
    )!;
    unplayed.year = w.year - 1;
    lastSeason.kitChoice = { fixtureId: unplayed.id, role: 'home' };
    expect(() => validateWorld(lastSeason)).toThrow();
  });
});
