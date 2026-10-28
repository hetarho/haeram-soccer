import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical } from '../../contracts/src/index';
import {
  KIT_ROLES,
  type AppearanceSide,
  type ClubIdentity,
  type GoalkeeperKit,
  type KitRole,
  type ShirtDesign,
} from '../../contracts/src/identity';
import type { Fixture, Founding, World } from '../../contracts/src/types';
import { nextOwnFixture } from './calendar';
import { identityOf } from './club-identity';
import { createWorld } from './founding';
import { KIT_FIXTURE_CHANGED } from './identity-operations';
import { selectMatchKits } from './kit-selection';
import { BANKRUPT_MESSAGE, operate } from './operations';
import { advanceDays } from './season';
import { pendingDecisions, stoppingReasons } from './stopping';
import { professionalStart } from './testing';
import { clubOf } from './world';

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Design Town',
  color: '#223344',
  seed: 'identity-command',
  level: 'normal',
};
/** A three-colour design in mixed-case spelling, with a primary unlike the founding colour. */
const DESIGN: ClubIdentity = {
  version: 1,
  colours: ['#C8102e', '#FfFfFf', '#0b1f44'],
  crest: {
    shape: 'french',
    pattern: 'sash',
    emblem: 'crown',
    primary: '#C8102e',
    accent: '#FfFfFf',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#C8102e', secondary: '#FfFfFf', trim: '#0b1f44' },
    away: { pattern: 'plain', primary: '#FfFfFf', trim: '#C8102e' },
    third: { pattern: 'chevron', primary: '#0b1f44', secondary: '#C8102e' },
  },
};
const design = () => structuredClone(DESIGN);
const KEEPER: GoalkeeperKit = {
  shirt: { pattern: 'checks', primary: '#F5E663', secondary: '#121212', trim: '#ffffff' },
  shorts: '#121212',
  socks: '#F5E663',
  gloves: '#00a6c8',
};
const apply = (w: World, identity: unknown) =>
  operate(w, { type: 'club-identity', identity: identity as ClubIdentity });
/** The world without what may change: the own identity and colour, and the revision. */
const untouched = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    clubs: w.clubs.map((club) =>
      club.id === w.playerClub ? { ...club, identity: undefined, color: undefined } : club,
    ),
  });
/**
 * Sporting facts: every club's identity and colour, the kit choice, appearances, receipts and
 * revision left out.
 */
const sporting = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    receiptIds: undefined,
    kitChoice: undefined,
    clubs: w.clubs.map((club) => ({ ...club, identity: undefined, color: undefined })),
    ownMatches: w.ownMatches.map((match) => ({ ...match, appearance: undefined })),
  });
const side = (club: string, crest: AppearanceSide['crest']): AppearanceSide => ({
  club,
  crest,
  role: 'home',
  shirt: { pattern: 'plain', primary: '#ffffff' },
  goalkeeper: '#000000',
});

describe('the own-club design command (→KIT-9, KIT-13)', () => {
  it('applies a deep copied identity and primary alias', () => {
    const w = simulatedWorld(FOUNDING);
    const previous = clubOf(w).identity!;
    const before = canonical(previous);
    const identity = design();
    apply(w, identity);
    const own = clubOf(w);
    expect(own.identity).toEqual(DESIGN);
    expect(own.color).toBe('#C8102e');
    for (const copy of [own.identity, own.identity!.crest, own.identity!.kits.home])
      expect([identity, identity.crest, identity.kits.home]).not.toContain(copy);
    // Neither the caller's object nor the replaced identity is shared with the world.
    identity.kits.home.primary = '#000000';
    identity.colours[0] = '#000000';
    expect(own.identity).toEqual(DESIGN);
    expect(canonical(previous)).toBe(before);
    expect(own.identity).not.toBe(previous);
  });

  it('applies and normalises a version-2 identity', () => {
    const w = simulatedWorld(FOUNDING);
    const before = untouched(w);
    // A draft carrying an entry that sets nothing beside real parts and a goalkeeper kit.
    const draft: ClubIdentity = {
      ...design(),
      version: 2,
      parts: { home: { shorts: '#0b1f44' }, away: {}, third: { socks: '#FfFfFf' } },
      goalkeeper: structuredClone(KEEPER),
    };
    apply(w, draft);
    const own = clubOf(w).identity!;
    expect(own).toEqual({
      ...DESIGN,
      version: 2,
      parts: { home: { shorts: '#0b1f44' }, third: { socks: '#FfFfFf' } },
      goalkeeper: KEEPER,
    });
    expect('away' in own.parts!).toBe(false);
    expect(own.goalkeeper).not.toBe(draft.goalkeeper);
    expect(own.goalkeeper!.shirt).not.toBe(draft.goalkeeper!.shirt);
    expect(untouched(w)).toBe(before);
    // Only a goalkeeper kit, its parts all empty: still version 2, without `parts`.
    apply(w, { ...design(), version: 2, parts: {}, goalkeeper: structuredClone(KEEPER) });
    expect(clubOf(w).identity).toEqual({ ...DESIGN, version: 2, goalkeeper: KEEPER });
    // Founding takes the confirmed version-2 draft the same way, and refuses an invalid one.
    const founded = createWorld({ ...FOUNDING, color: DESIGN.colours[0], identity: draft });
    expect(clubOf(founded).identity).toEqual(own);
    expect(() =>
      createWorld({
        ...FOUNDING,
        color: DESIGN.colours[0],
        identity: { ...design(), version: 2, parts: { away: {} } },
      }),
    ).toThrow('구단 디자인을 확인해');
  });

  it('malformed edit leaves canonical world unchanged', () => {
    const w = simulatedWorld(FOUNDING);
    const before = canonical(w);
    const malformed: unknown[] = [
      undefined,
      { ...design(), version: 2 },
      { ...design(), colours: ['#111111', '#222222', '#333333', '#444444'] },
      { ...design(), colours: [] },
      { ...design(), colours: ['red'] },
      { ...design(), crest: { ...DESIGN.crest, primary: '#12345' } },
      { ...design(), crest: { ...DESIGN.crest, image: 'https://example.com/crest.svg' } },
      { ...design(), club: w.clubs[1].id },
      { ...design(), kits: { ...DESIGN.kits, third: undefined } },
      { ...design(), kits: { ...DESIGN.kits, home: { pattern: 'hoops', primary: '#C8102e' } } },
      {
        ...design(),
        kits: {
          ...DESIGN.kits,
          away: { pattern: 'plain', primary: '#ffffff', secondary: '#000000' },
        },
      },
      // Kit parts and the goalkeeper kit belong to version 2 only, and version 2 needs one of them.
      { ...design(), parts: { home: { shorts: '#000000' } } },
      { ...design(), goalkeeper: KEEPER },
      { ...design(), version: 2, parts: { home: {} } },
      { ...design(), version: 3, goalkeeper: KEEPER },
      { ...design(), version: 2, parts: { fourth: { shorts: '#000000' } } },
      { ...design(), version: 2, parts: { home: { boots: '#000000' } } },
      { ...design(), version: 2, parts: { home: { socks: 'white' } } },
      { ...design(), version: 2, goalkeeper: { ...KEEPER, gloves: undefined } },
      {
        ...design(),
        version: 2,
        goalkeeper: { ...KEEPER, shirt: { pattern: 'sash', primary: '#000000' } },
      },
    ];
    for (const identity of malformed) {
      expect(() => apply(w, identity), JSON.stringify(identity)).toThrow('구단 디자인을 확인해');
      expect(canonical(w)).toBe(before);
    }
    // Bankruptcy keeps its refusal; a world still missing designs is refused before any write.
    w.bankrupt = { year: w.year, round: w.round, day: 0 };
    expect(() => apply(w, design())).toThrow(BANKRUPT_MESSAGE);
    delete w.bankrupt;
    delete w.clubs.find((club) => club.id !== w.playerClub)!.identity;
    const missing = canonical(w);
    expect(() => apply(w, design())).toThrow('구단 디자인 정보를 갱신한 뒤');
    expect(canonical(w)).toBe(missing);
  });

  it('changes only the own identity, colour and revision', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 2 });
    expect(w.ownMatches.length).toBeGreaterThan(0);
    const match = w.ownMatches.at(-1)!;
    // A recorded appearance holding the own club's current crest object itself.
    match.appearance = {
      version: 1,
      sides: [
        side(match.home, identityOf(w, match.home).crest),
        side(match.away, identityOf(w, match.away).crest),
      ],
      warnings: [],
    };
    const recorded = canonical(match.appearance);
    const rival = w.clubs.find((club) => club.id !== w.playerClub)!;
    const before = untouched(w),
      revision = w.revision;
    // A club target is no part of the command: the own club is edited, never the named one.
    operate(w, { type: 'club-identity', identity: design(), club: rival.id } as never);
    expect(clubOf(w).identity).toEqual(DESIGN);
    expect(w.revision).toBe(revision + 1);
    expect(untouched(w)).toBe(before);
    expect(canonical(match.appearance)).toBe(recorded);
  });

  it('cosmetic edits preserve sporting outcomes', () => {
    const base = simulatedWorld(FOUNDING);
    const edited = structuredClone(base);
    apply(edited, design());
    expect(clubOf(edited).color).not.toBe(clubOf(base).color);
    // Our first match is on day 7: both worlds play it with the same commands.
    for (const w of [base, edited]) advanceDays(w, 7, undefined, false);
    expect(base.ownMatches.length).toBeGreaterThan(0);
    expect(sporting(edited)).toBe(sporting(base));
    expect(edited.revision).toBe(base.revision + 1);
    expect(clubOf(edited).identity).toEqual(DESIGN);
  });
});

const choose = (w: World, fixtureId: string, role: KitRole | null) =>
  operate(w, { type: 'match-kit', fixtureId, role });
/** The world without its kit choice and revision. */
const withoutChoice = (w: World) => canonical({ ...w, revision: undefined, kitChoice: undefined });
const isOwn = (w: World, f: Fixture) => f.home === w.playerClub || f.away === w.playerClub;
/**
 * An unplayed own tie three days before the next league match, as a draw would add it: our away
 * leg in the domestic cup, or our home leg in a continental competition.
 */
function earlierTie(w: World, kind: 'cup' | 'europe') {
  const league = nextOwnFixture(w)!;
  const opponent = league.home === w.playerClub ? league.away : league.home;
  const own = clubOf(w);
  const tie: Fixture = {
    id: `kit-${kind}-tie`,
    year: w.year,
    round: league.round,
    kind,
    home: kind === 'cup' ? opponent : own.id,
    away: kind === 'cup' ? own.id : opponent,
    country: own.country,
    groupKey: kind,
  };
  const cup = w.cups?.find((c) => c.country === own.country);
  if (kind === 'europe')
    w.europe.push({
      key: 'kit-test',
      name: '클럽대항전',
      field: 2,
      format: 'knockout',
      games: 1,
      stage: '1라운드',
      clubs: [own.id, opponent],
      fixtures: [tie],
      standings: {},
    });
  else if (cup) cup.fixtures.push(tie);
  else
    (w.cups ??= []).push({
      country: own.country,
      name: '컵',
      clubs: [own.id, opponent],
      rounds: [],
      fixtures: [tie],
    });
  return tie;
}

describe('the next-fixture kit command (→KIT-6, KIT-7)', () => {
  it('chooses for a league/cup/continental next own fixture', () => {
    const cup = simulatedWorld(FOUNDING),
      europe = simulatedWorld(FOUNDING);
    earlierTie(cup, 'cup');
    earlierTie(europe, 'europe');
    const worlds = [
      [simulatedWorld(FOUNDING), 'lower'],
      [professionalStart(simulatedWorld(FOUNDING)), 'league'],
      [cup, 'cup'],
      [europe, 'europe'],
    ] as const;
    for (const [w, kind] of worlds) {
      const next = nextOwnFixture(w)!;
      expect(next.kind).toBe(kind);
      for (const role of KIT_ROLES) {
        const before = withoutChoice(w),
          revision = w.revision;
        choose(w, next.id, role);
        expect(w.kitChoice).toEqual({ fixtureId: next.id, role });
        expect(w.revision).toBe(revision + 1);
        expect(withoutChoice(w)).toBe(before);
      }
    }
  });

  it('null restores automatic selection', () => {
    const w = simulatedWorld(FOUNDING);
    const league = nextOwnFixture(w)!;
    const revision = w.revision;
    choose(w, league.id, 'third');
    choose(w, league.id, null);
    expect('kitChoice' in w).toBe(false);
    expect(w.revision).toBe(revision + 2);
    // A choice named for the league match outlives a cup tie drawn before it, and returning that
    // tie to automatic selection leaves the league match's choice in place.
    choose(w, league.id, 'away');
    const tie = earlierTie(w, 'cup');
    expect(nextOwnFixture(w)!.id).toBe(tie.id);
    choose(w, tie.id, null);
    expect(w.kitChoice).toEqual({ fixtureId: league.id, role: 'away' });
  });

  it('stale/missing/settled/NPC fixture leaves the world unchanged', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 2 });
    const league = nextOwnFixture(w)!;
    const settled = w.fixtures.find((f) => f.score && isOwn(w, f))!;
    const npc = w.fixtures.find((f) => !f.score && !isOwn(w, f))!;
    const later = w.fixtures.find((f) => !f.score && isOwn(w, f) && f.round > league.round)!;
    choose(w, league.id, 'home');
    // The next fixture changes after the caller read it: a cup tie is drawn before it.
    const tie = earlierTie(w, 'cup');
    const before = canonical(w);
    for (const fixtureId of [league.id, later.id, settled.id, npc.id, 'no-such-fixture', ''])
      for (const role of [...KIT_ROLES, null]) {
        expect(() => choose(w, fixtureId, role), fixtureId).toThrow(KIT_FIXTURE_CHANGED);
        expect(canonical(w)).toBe(before);
      }
    for (const role of ['fourth', 'goalkeeper', '', undefined])
      expect(() => choose(w, tie.id, role as KitRole)).toThrow('유니폼을 확인해');
    w.bankrupt = { year: w.year, round: w.round, day: 0 };
    expect(() => choose(w, tie.id, 'third')).toThrow(BANKRUPT_MESSAGE);
    delete w.bankrupt;
    expect(canonical(w)).toBe(before);
    // With no own fixture left this season there is nothing to choose for.
    w.fixtures = w.fixtures.filter((f) => f.score || !isOwn(w, f));
    w.cups = [];
    const over = canonical(w);
    expect(() => choose(w, tie.id, 'third')).toThrow(KIT_FIXTURE_CHANGED);
    expect(canonical(w)).toBe(over);
  });

  it('choice does not edit saved shirt designs', () => {
    const w = simulatedWorld(FOUNDING);
    const next = nextOwnFixture(w)!;
    const designs = w.clubs.map((club) => canonical(club.identity));
    const kits = clubOf(w).identity!.kits;
    for (const role of [...KIT_ROLES, null]) choose(w, next.id, role);
    expect(w.clubs.map((club) => canonical(club.identity))).toEqual(designs);
    expect(clubOf(w).identity!.kits).toBe(kits);
  });

  it('accepts a clashing manual role without a stop; the selector warns on its own', () => {
    const w = simulatedWorld(FOUNDING);
    const next = nextOwnFixture(w)!;
    const side = next.home === w.playerClub ? 0 : 1;
    const rival = w.clubs.find((club) => club.id === (side === 0 ? next.away : next.home))!;
    // Every rival shirt and our third are the same plain red, so our third clashes whatever they wear.
    const red = (): ShirtDesign => ({ pattern: 'plain', primary: '#d62828' });
    rival.identity = { ...rival.identity!, kits: { home: red(), away: red(), third: red() } };
    const own = clubOf(w);
    own.identity = { ...own.identity!, kits: { ...own.identity!.kits, third: red() } };
    const kits = (forced?: { side: 0 | 1; role: KitRole }) => {
      const [home, away] = side === 0 ? [own.id, rival.id] : [rival.id, own.id];
      return selectMatchKits(identityOf(w, home), identityOf(w, away), forced);
    };
    expect(kits({ side, role: 'third' }).warnings).toContain('teams');
    const before = withoutChoice(w),
      stops = stoppingReasons(w),
      pending = pendingDecisions(w);
    choose(w, next.id, 'third');
    expect(w.kitChoice).toEqual({ fixtureId: next.id, role: 'third' });
    // No inbox item, event or decision: only the choice and the revision changed.
    expect(withoutChoice(w)).toBe(before);
    expect(stoppingReasons(w)).toEqual(stops);
    expect(pendingDecisions(w)).toEqual(pending);
    expect(kits({ side, role: 'third' }).warnings).toContain('teams');
    expect(kits().roles[side]).not.toBe('third');
  });

  it('a kit choice changes no sporting outcome', () => {
    const base = simulatedWorld(FOUNDING);
    const chosen = structuredClone(base);
    choose(chosen, nextOwnFixture(chosen)!.id, 'third');
    for (const w of [base, chosen]) advanceDays(w, 7, undefined, false);
    expect(base.ownMatches.length).toBeGreaterThan(0);
    expect(sporting(chosen)).toBe(sporting(base));
  });
});
