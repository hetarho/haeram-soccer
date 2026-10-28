import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical } from '../../contracts/src/index';
import {
  KIT_ROLES,
  type ClubIdentity,
  type GoalkeeperKit,
  type ShirtDesign,
} from '../../contracts/src/identity';
import { matchAppearanceSchema } from '../../contracts/src/identitySchema';
import type { Fixture, Founding, MatchPlayback, World } from '../../contracts/src/types';
import { currentDay, fixtureDay, nextOwnFixture } from './calendar';
import { identityOf } from './club-identity';
import { playFixture } from './knockout';
import { selectMatchKits } from './kit-selection';
import { automaticKeeper, startingShorts } from './kit-wear';
import { appearanceForFixture } from './match-appearance';
import { operate } from './operations';
import { advanceDays, recordMatch } from './season';
import { clubOf } from './world';

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Design Town',
  color: '#223344',
  seed: 'identity-command',
  level: 'normal',
};
/** Lives the days up to and including `f`'s day; returns the playback captured for `f`. */
function playTo(w: World, f: Fixture) {
  let playback: MatchPlayback | undefined;
  const capture = (_: World, p: MatchPlayback) => {
    if (p.record.id === f.id) playback = p;
  };
  advanceDays(w, fixtureDay(f) - currentDay(w), capture, false);
  return playback!;
}
const recorded = (w: World, id: string) => w.ownMatches.find((m) => m.id === id)!;
const ownSide = (w: World, f: Fixture) => (f.home === w.playerClub ? 0 : 1);
/** A role for our side that automatic selection would not pick, so the choice is visible. */
function unlikelyRole(w: World, f: Fixture) {
  const auto = selectMatchKits(identityOf(w, f.home), identityOf(w, f.away));
  return KIT_ROLES.find((role) => role !== auto.roles[ownSide(w, f)])!;
}
/** The own design with every colour replaced: a valid edit no recorded match wore. */
function repainted(identity: ClubIdentity): ClubIdentity {
  const copy = structuredClone(identity);
  copy.colours[0] = '#000000';
  copy.crest.primary = '#000000';
  for (const role of KIT_ROLES) copy.kits[role].primary = '#000000';
  return copy;
}
/** Sporting facts: identities, colours, the kit choice, appearances and revision left out. */
const sporting = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    kitChoice: undefined,
    clubs: w.clubs.map((club) => ({ ...club, identity: undefined, color: undefined })),
    ownMatches: w.ownMatches.map((match) => ({ ...match, appearance: undefined })),
  });

describe('settled own-match appearance (→KIT-12, SAVE-22)', () => {
  it('freezes live and saved appearance across own edits', () => {
    const w = simulatedWorld(FOUNDING);
    const next = nextOwnFixture(w)!;
    const expected = appearanceForFixture(w, next);
    expect(expected.version).toBe(2);
    expect(expected.sides.map((s) => s.club)).toEqual([next.home, next.away]);
    const live = playTo(w, next);
    const saved = recorded(w, next.id);
    expect(live.record.appearance).toEqual(expected);
    expect(saved.appearance).toEqual(expected);
    // A copy: no object of the snapshot is one of the identities it was taken from.
    const own = clubOf(w).identity!,
      side = saved.appearance!.sides[ownSide(w, next)];
    expect(side.crest).not.toBe(own.crest);
    expect(Object.values(own.kits)).not.toContain(side.shirt);
    const frozen = canonical(saved.appearance);
    operate(w, { type: 'club-identity', identity: repainted(own) });
    for (const club of w.clubs) club.identity!.crest.primary = '#ffffff';
    expect(canonical(saved.appearance)).toBe(frozen);
    expect(canonical(live.record.appearance)).toBe(frozen);
  });

  it('consumes only the named choice at settlement', () => {
    const w = simulatedWorld(FOUNDING);
    const league = nextOwnFixture(w)!;
    const role = unlikelyRole(w, league);
    operate(w, { type: 'match-kit', fixtureId: league.id, role });
    // A cup tie drawn before it settles first, automatically, and leaves that choice alone.
    const rival = league.home === w.playerClub ? league.away : league.home;
    const tie: Fixture = {
      id: 'kit-earlier-tie',
      year: w.year,
      round: league.round,
      kind: 'cup',
      home: rival,
      away: w.playerClub,
      country: league.country,
      groupKey: 'cup',
    };
    const auto = selectMatchKits(identityOf(w, tie.home), identityOf(w, tie.away));
    playFixture(w, tie);
    expect(recorded(w, tie.id).appearance!.sides.map((s) => s.role)).toEqual(auto.roles);
    expect(w.kitChoice).toEqual({ fixtureId: league.id, role });
    // The named match wears the chosen role and consumes the choice.
    playTo(w, league);
    expect(recorded(w, league.id).appearance!.sides[ownSide(w, league)].role).toBe(role);
    expect('kitChoice' in w).toBe(false);
  });

  it('duplicate settlement never rewrites appearance', () => {
    const w = simulatedWorld(FOUNDING);
    const first = nextOwnFixture(w)!;
    const live = playTo(w, first);
    const frozen = canonical(recorded(w, first.id).appearance);
    // Newer work: a design edit and a choice for the following fixture.
    operate(w, { type: 'club-identity', identity: repainted(clubOf(w).identity!) });
    const following = nextOwnFixture(w)!;
    operate(w, { type: 'match-kit', fixtureId: following.id, role: 'third' });
    const before = canonical(w);
    recordMatch(w, live);
    const bare = structuredClone(live);
    delete bare.record.appearance;
    recordMatch(w, bare);
    expect(canonical(w)).toBe(before);
    expect(bare.record.appearance).toBeUndefined();
    expect(canonical(recorded(w, first.id).appearance)).toBe(frozen);
    expect(w.kitChoice).toEqual({ fixtureId: following.id, role: 'third' });
  });

  it('version-2 appearance records worn kits and fallback', () => {
    const w = simulatedWorld(FOUNDING);
    const next = nextOwnFixture(w)!;
    const side = ownSide(w, next);
    const rivalId = side === 0 ? next.away : next.home;
    const rival = w.clubs.find((club) => club.id === rivalId)!;
    const keeper: GoalkeeperKit = {
      shirt: { pattern: 'band', primary: '#f5e663', secondary: '#121212' },
      shorts: '#121212',
      socks: '#f5e663',
      gloves: '#00A6C8',
    };
    operate(w, {
      type: 'club-identity',
      identity: {
        ...clubOf(w).identity!,
        version: 2,
        kits: {
          home: { pattern: 'plain', primary: '#ffffff', trim: '#0b1f44' },
          away: { pattern: 'plain', primary: '#0b1f44' },
          third: { pattern: 'stripes', primary: '#d62828', secondary: '#ffffff' },
        },
        parts: { home: { shorts: '#d62828' }, away: { socks: '#ffffff' } },
        goalkeeper: keeper,
      },
    });
    const own = clubOf(w).identity!;
    const saved = canonical(own);
    /** The appearance against the rival wearing `shirt` in all three roles. */
    const against = (shirt: ShirtDesign) => {
      rival.identity = { ...rival.identity!, kits: { home: shirt, away: shirt, third: shirt } };
      const appearance = appearanceForFixture(w, next);
      expect(matchAppearanceSchema.parse(appearance)).toEqual(appearance);
      expect(appearance.version).toBe(2);
      const kits = selectMatchKits(identityOf(w, next.home), identityOf(w, next.away));
      appearance.sides.forEach((s, i) => {
        expect(s.role).toBe(kits.roles[i]);
        expect([s.shirt, s.shorts, s.socks]).toEqual([
          kits.kits[i].shirt,
          kits.kits[i].shorts,
          kits.kits[i].socks,
        ]);
        expect(s.keeper).toEqual(kits.keepers[i]);
        expect(s.goalkeeper).toBe(s.keeper!.shirt.primary);
      });
      // The own side wears its own kit's parts: set ones as set, the rest by the starting rule.
      const ours = appearance.sides[side];
      const identity = clubOf(w).identity!;
      expect({ shorts: ours.shorts, socks: ours.socks }).toEqual({
        shorts: identity.parts?.[ours.role]?.shorts ?? startingShorts(ours.shirt),
        socks: identity.parts?.[ours.role]?.socks ?? ours.shirt.primary,
      });
      // An opponent has no designed keeper, so nothing of its own can fall back.
      expect('keeperFallback' in appearance.sides[1 - side]).toBe(false);
      return ours;
    };
    // Against purple the designed kit is worn as saved.
    const kept = against({ pattern: 'plain', primary: '#6a0dad' });
    expect(kept.keeper).toEqual(keeper);
    expect('keeperFallback' in kept).toBe(false);
    // Against yellow it gives way to an automatic colour in this fixture only.
    const fallback = against({ pattern: 'plain', primary: '#f5e663' });
    expect(fallback.keeperFallback).toBe(true);
    expect(fallback.keeper).toEqual(automaticKeeper(fallback.goalkeeper));
    expect(canonical(clubOf(w).identity)).toBe(saved);
    // The capture is a copy: no recorded object is the saved kit itself.
    expect(kept.keeper).not.toBe(own.goalkeeper);
    expect(kept.keeper!.shirt).not.toBe(own.goalkeeper!.shirt);
  });

  it('legacy records remain absent', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 2 });
    // Records from before appearances, as an older save holds them.
    for (const m of w.ownMatches) delete m.appearance;
    const legacy = new Set(w.ownMatches.map((m) => m.id));
    expect(legacy.size).toBeGreaterThan(0);
    operate(w, { type: 'club-identity', identity: repainted(clubOf(w).identity!) });
    playTo(w, nextOwnFixture(w)!);
    expect(w.ownMatches.length).toBeGreaterThan(legacy.size);
    for (const m of w.ownMatches) expect('appearance' in m, m.id).toBe(!legacy.has(m.id));
  });

  it('kit choices leave grid results, counters and unavailability unchanged', () => {
    // Our cup tie on day 32 plays the grid engine; NPC ties and club business share its days.
    const base = simulatedWorld(FOUNDING, { rounds: 4 });
    const tie = nextOwnFixture(base)!;
    expect(tie.kind).toBe('cup');
    const chosen = structuredClone(base);
    operate(chosen, { type: 'match-kit', fixtureId: tie.id, role: unlikelyRole(chosen, tie) });
    for (const w of [base, chosen]) playTo(w, tie);
    expect(recorded(chosen, tie.id).appearance).not.toEqual(recorded(base, tie.id).appearance);
    expect(sporting(chosen)).toBe(sporting(base));
  });
});
