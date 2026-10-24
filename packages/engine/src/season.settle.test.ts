import { describe, expect, it } from 'vitest';
import {
  DISABLED_RELEASE,
  ENABLED_RELEASE,
  withCandidateModel,
} from '../../../tests/fixtures/worlds';
import { PD, TD } from '../../contracts/src/detail';
import type { Fixture, Incident, MatchRecord, World } from '../../contracts/src/types';
import { settleRate } from './adaptation';
import { INJURY } from './careers';
import { dayCountedFrom } from './calendar';
import { isUnavailable } from './discipline';
import { M } from './grid/record';
import { createWorld, simulateMatch } from './index';
import { playFixture } from './knockout';
import { type MatchModelRelease, validateFullMatchRecord } from './match-model';
import { adaptationAfter, FORMATIONS, gainLevelFactor, MATCH_GAIN } from './player';
import { recordMatch } from './season';
import { founded } from './season.testkit';
import { fatigueCost } from './strategy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';

/** The release-on probe's world: founded in 1950 in ENG's fourth tier (fixtures 1950:ENG:4). */
function world(release: MatchModelRelease) {
  return createWorld(
    {
      country: 'ENG',
      name: 'Settle Athletic',
      color: '#225544',
      seed: 'settle-match',
      level: 'normal',
    },
    release,
  );
}
/**
 * A 2024 world on the model a new career plays, recorded once the year has moved (founded off,
 * then activated), whatever the switch: it names substitutes (→MATCH-20).
 */
const modern = () => withCandidateModel(founded(2024, DISABLED_RELEASE));
const isOwn = (w: World, f: Fixture) => f.home === w.playerClub || f.away === w.playerClub;
const ownFixtures = (w: World) =>
  w.fixtures
    .filter((f) => (f.kind === 'league' || f.kind === 'lower') && isOwn(w, f))
    .sort((a, b) => a.round - b.round);
/**
 * The fixture played on the grid with `x` among its incidents, and the facts `x` changes so the
 * record still holds (→MATCH-27): a red card counts on its player and his side, and a starter sent
 * off or injured leaves the pitch a minute before the stamp.
 */
function played(w: World, f: Fixture, x: Incident) {
  const playback = simulateMatch(w, f, false, true);
  const r = playback.record;
  const at = r.incidents!.findIndex((y) => y.minute > x.minute);
  r.incidents!.splice(at < 0 ? r.incidents!.length : at, 0, x);
  const line = r.players.find((l) => l.id === x.player)!;
  if (x.kind === 'red') {
    line.detail![PD.redCards]++;
    r.detail![x.side][TD.redCards]++;
  }
  line.metrics[M.minutes] = x.minute - 1;
  return playback;
}
const sideOf = (w: World, f: Fixture) => (f.home === w.playerClub ? 0 : 1);
const player = (w: World, id: string) => w.players.find((p) => p.id === id)!;

describe('settling a played match into the world (→MATCH-21, PLAYER-12, CLUB-23)', () => {
  it('gives a substitute the substitute adaptation gain', () => {
    const w = modern();
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const playback = simulateMatch(w, f, false, true);
    const xi = playback.squads[side].slice(0, 11);
    // The manager's first change of a starter: the substitute takes that starter's slot.
    const change = playback.record.incidents!.find(
      (x) => x.kind === 'sub' && x.side === side && xi.some((p) => p.id === x.player),
    )!;
    expect(change).toBeDefined();
    const sub = player(w, change.other!);
    const before = sub.adaptation;
    const slot =
      FORMATIONS[playback.record.tactics[side]].slots[xi.findIndex((p) => p.id === change.player)]!;
    const expected = adaptationAfter(
      before,
      MATCH_GAIN.sub * settleRate(w, sub) * gainLevelFactor(sub.positions, slot.position),
    );
    recordMatch(w, playback, true);
    expect(player(w, sub.id).adaptation).toBeCloseTo(expected, 10);
    expect(player(w, sub.id).adaptation).toBeGreaterThan(before);
  });
  it('adds fatigue by minutes played', () => {
    const w = modern();
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const playback = simulateMatch(w, f, false, true);
    // The own lines with the most and the fewest minutes, as the manager's changes left them.
    const lines = playback.record.players
      .filter((l) => player(w, l.id))
      .sort((a, b) => b.metrics[M.minutes]! - a.metrics[M.minutes]!);
    const [full, part] = [lines[0]!, lines.at(-1)!];
    const onPitch = [full, part].map((l) => l.metrics[M.minutes]!);
    expect(onPitch[1]).toBeLessThan(onPitch[0]!);
    const tactic = playback.record.tactics[side];
    const extra = managerStyleEffects(w).fatigueCost - synergyEffects(w).fatigueRelief;
    const added = (id: string, minutes: number) =>
      Math.max(1, Math.round(((fatigueCost(player(w, id), tactic) + extra) * minutes) / 90));
    const expected = [full, part].map((l, i) =>
      Math.min(100, player(w, l.id).fatigue + added(l.id, onPitch[i]!)),
    );
    recordMatch(w, playback, true);
    expect([full, part].map((l) => player(w, l.id).fatigue)).toEqual(expected);
    expect(added(part.id, onPitch[1]!)).toBeLessThan(added(full.id, onPitch[0]!));
  });
  it('injures players during the match and keeps CLUB-23 bands', () => {
    const w = world(ENABLED_RELEASE);
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const probe = simulateMatch(w, f, false, true);
    const hurt = probe.squads[side][2];
    recordMatch(w, played(w, f, { minute: 50, side, kind: 'injury', player: hurt.id }), true);
    const injury = player(w, hurt.id).injury!;
    expect(injury).toBeDefined();
    const days = injury.day - dayCountedFrom(w, injury.year);
    expect(INJURY.bands.some((b) => days >= b.days[0] && days <= b.days[1])).toBe(true);
    expect(INJURY.bands.some((b) => (b.label as readonly string[]).includes(injury.label))).toBe(
      true,
    );
    expect(w.inbox!.some((item) => item.ref === hurt.id && item.kind === 'staff-report')).toBe(
      true,
    );
  });
  it('records an NPC injury in the unavailable list', () => {
    const w = world(ENABLED_RELEASE);
    const f = ownFixtures(w)[0];
    const other = sideOf(w, f) === 0 ? 1 : 0;
    const club = other === 0 ? f.home : f.away;
    const probe = simulateMatch(w, f, false, true);
    const hurt = probe.squads[other][4];
    recordMatch(
      w,
      played(w, f, { minute: 20, side: other, kind: 'injury', player: hurt.id }),
      true,
    );
    const out = w.discipline!.out;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ player: hurt.id, club, until: { year: w.year } });
    const days = out[0].until.day - dayCountedFrom(w, w.year);
    expect(INJURY.bands.some((b) => days >= b.days[0] && days <= b.days[1])).toBe(true);
    expect(isUnavailable(w, hurt.id, club, ownFixtures(w)[1])).toBe(true);
  });
  it('turns cards into bans after the match and serves them in the next', () => {
    const w = world(ENABLED_RELEASE);
    const [first, second] = ownFixtures(w);
    const side = sideOf(w, first);
    const probe = simulateMatch(w, first, false, true);
    const sent = probe.squads[side][1];
    recordMatch(
      w,
      played(w, first, { minute: 70, side, kind: 'red', player: sent.id, reason: 'dogso' }),
      true,
    );
    expect(w.discipline!.bans).toEqual([
      { player: sent.id, club: w.playerClub, matches: 1, scope: 'domestic', reason: 'dogso' },
    ]);
    // Banned for the next fixture: he is not in its XI or on its bench, and it serves his ban.
    const next = simulateMatch(w, second, false, true);
    expect(next.squads[sideOf(w, second)].map((p) => p.id)).not.toContain(sent.id);
    recordMatch(w, next, true);
    expect(w.discipline!.bans.filter((b) => b.player === sent.id)).toEqual([]);
  });
});

describe('settling an activated world (→MATCH-13, MATCH-26, MATCH-27)', () => {
  it('an activated world settles only valid full records', () => {
    // The release-on probe's world: its own league's first two rounds and the national cup's first
    // round, each with the own match on the grid and the others on the aggregate path, level ties
    // going to extra time and a shoot-out.
    const w = world(ENABLED_RELEASE);
    const league: MatchRecord[] = [];
    for (const f of w.fixtures.filter((f) => f.id.startsWith('1950:ENG:4:') && f.round <= 2)) {
      const playback = simulateMatch(w, f, false, true);
      f.score = playback.record.score;
      recordMatch(w, playback, true);
      league.push(playback.record);
    }
    const cup = w.cups!.find((c) => c.fixtures.some((f) => isOwn(w, f)))!;
    const ties = cup.fixtures
      .filter((f) => f.id.includes(':k0:'))
      .map((f) => playFixture(w, f, undefined, false, { awayGoals: false })!.record);
    for (const r of [...league, ...ties]) expect(validateFullMatchRecord(r), r.id).toEqual([]);
    // Both result paths in the league rounds and in the cup round.
    for (const records of [league, ties]) {
      expect(records.some((r) => isOwn(w, r))).toBe(true);
      expect(records.some((r) => !isOwn(w, r))).toBe(true);
    }
    expect(ties.some((r) => r.regulation)).toBe(true);
    expect(ties.some((r) => r.shootout)).toBe(true);
  });
});
