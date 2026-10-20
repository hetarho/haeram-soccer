import { describe, expect, it } from 'vitest';
import type { Fixture, Incident, MatchPlayback, World } from '../../contracts/src/types';
import { settleRate } from './adaptation';
import { INJURY } from './careers';
import { dayCountedFrom } from './calendar';
import { isUnavailable } from './discipline';
import { activePlayers, createWorld, simulateMatch } from './index';
import { zeroMetrics } from './primitives';
import { adaptationAfter, FORMATIONS, gainLevelFactor, MATCH_GAIN } from './player';
import { recordMatch } from './season';
import { fatigueCost } from './strategy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Settle Athletic',
    color: '#225544',
    seed: 'settle-match',
    level: 'normal',
  });
}
const ownFixtures = (w: World) =>
  w.fixtures
    .filter(
      (f) =>
        (f.kind === 'league' || f.kind === 'lower') &&
        (f.home === w.playerClub || f.away === w.playerClub),
    )
    .sort((a, b) => a.round - b.round);
/** The fixture played on the grid, with its own incidents replaced by `incidents`. */
function played(w: World, f: Fixture, incidents: Incident[]) {
  const playback = simulateMatch(w, f, false, true) as MatchPlayback;
  playback.record.incidents = incidents;
  return playback;
}
const sideOf = (w: World, f: Fixture) => (f.home === w.playerClub ? 0 : 1);
const player = (w: World, id: string) => w.players.find((p) => p.id === id)!;

describe('settling a played match into the world (→MATCH-21, PLAYER-12, CLUB-23)', () => {
  it('gives a substitute the substitute adaptation gain', () => {
    const w = world();
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const playback = played(w, f, []);
    const xi = playback.squads[side].slice(0, 11);
    // 1950 names no substitutes, so one comes off the squad for the case.
    const sub = activePlayers(w).find((p) => !xi.includes(p))!;
    playback.squads[side].push(sub);
    playback.record.incidents = [
      { minute: 60, side, kind: 'sub', player: xi[3].id, other: sub.id },
    ];
    const metrics = zeroMetrics();
    metrics[10] = 30;
    playback.record.players.push({ id: sub.id, metrics });
    const before = player(w, sub.id).adaptation;
    const slot = FORMATIONS[playback.record.tactics[side]].slots[3]!;
    const expected = adaptationAfter(
      before,
      MATCH_GAIN.sub *
        settleRate(w, player(w, sub.id)) *
        gainLevelFactor(sub.positions, slot.position),
    );
    recordMatch(w, playback, true);
    expect(player(w, sub.id).adaptation).toBeCloseTo(expected, 10);
    expect(player(w, sub.id).adaptation).toBeGreaterThan(before);
  });
  it('adds fatigue by minutes played', () => {
    const w = world();
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const playback = played(w, f, []);
    const lines = playback.record.players.filter((l) => player(w, l.id));
    const [full, half] = lines;
    full.metrics[10] = 90;
    half.metrics[10] = 45;
    const tactic = playback.record.tactics[side];
    const extra = managerStyleEffects(w).fatigueCost - synergyEffects(w).fatigueRelief;
    const added = (id: string, minutes: number) =>
      Math.max(1, Math.round(((fatigueCost(player(w, id), tactic) + extra) * minutes) / 90));
    const expected = [full, half].map((l, i) =>
      Math.min(100, player(w, l.id).fatigue + added(l.id, i ? 45 : 90)),
    );
    recordMatch(w, playback, true);
    expect([full, half].map((l) => player(w, l.id).fatigue)).toEqual(expected);
    expect(added(half.id, 45)).toBeLessThan(added(full.id, 90));
  });
  it('injures players during the match and keeps CLUB-23 bands', () => {
    const w = world();
    const f = ownFixtures(w)[0];
    const side = sideOf(w, f);
    const probe = simulateMatch(w, f, false, true);
    const hurt = probe.squads[side][2];
    recordMatch(w, played(w, f, [{ minute: 50, side, kind: 'injury', player: hurt.id }]), true);
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
    const w = world();
    const f = ownFixtures(w)[0];
    const other = sideOf(w, f) === 0 ? 1 : 0;
    const club = other === 0 ? f.home : f.away;
    const probe = simulateMatch(w, f, false, true);
    const hurt = probe.squads[other][4];
    recordMatch(
      w,
      played(w, f, [{ minute: 20, side: other, kind: 'injury', player: hurt.id }]),
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
    const w = world();
    const [first, second] = ownFixtures(w);
    const side = sideOf(w, first);
    const probe = simulateMatch(w, first, false, true);
    const sent = probe.squads[side][1];
    recordMatch(
      w,
      played(w, first, [{ minute: 70, side, kind: 'red', player: sent.id, reason: 'dogso' }]),
      true,
    );
    expect(w.discipline!.bans).toEqual([
      { player: sent.id, club: w.playerClub, matches: 1, scope: 'domestic', reason: 'dogso' },
    ]);
    // Banned for the next fixture: he is not in its XI or on its bench.
    const next = simulateMatch(w, second, false, true);
    expect(next.squads[sideOf(w, second)].map((p) => p.id)).not.toContain(sent.id);
    next.record.incidents = [];
    recordMatch(w, next, true);
    expect(w.discipline!.bans).toEqual([]);
  });
});
