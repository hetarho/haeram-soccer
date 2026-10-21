import { describe, expect, it } from 'vitest';
import type { Fixture, Incident, MatchRecord, World } from '../../contracts/src/types';
import {
  applyDiscipline,
  closeDisciplineSeason,
  isUnavailable,
  serveBans,
  yellowWarning,
} from './discipline';
import { activePlayers, createWorld, ownLeagueClubs, ownStarters, startingSquad } from './index';
import { matchdayRosters } from './aggregate/engine';
import { currentDay } from './calendar';
import { buildGridSetup, eraRules } from './grid/setup';
import { prepareMatch, simulateMatch } from './match';
import { lineOf } from './player';
import { advanceRound } from './season';
import { founded } from './season.testkit';
import { squad } from './world';
import { withCandidateModel } from '../../../tests/fixtures/worlds';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Booking Town',
    color: '#553322',
    seed: 'discipline',
    level: 'normal',
  });
}
/** The own club's league fixtures of the season, in round order. */
const leagueFixtures = (w: World) =>
  w.fixtures
    .filter(
      (f) =>
        (f.kind === 'league' || f.kind === 'lower') &&
        (f.home === w.playerClub || f.away === w.playerClub),
    )
    .sort((a, b) => a.round - b.round);
const ownSide = (w: World, f: Fixture) => (f.home === w.playerClub ? 0 : 1);
/** A recorded fixture whose only facts are its cards. */
function booked(
  f: Fixture,
  side: 0 | 1,
  player: string,
  kind: Incident['kind'] = 'yellow',
  reason?: Incident['reason'],
): MatchRecord {
  return {
    ...f,
    incidents: [{ minute: 30, side, kind, player, ...(reason && { reason }) }],
  } as MatchRecord;
}
const cup = (w: World): Fixture => ({
  id: 'cup:test',
  year: w.year,
  round: 3,
  kind: 'cup',
  home: w.playerClub,
  away: ownLeagueClubs(w).find((c) => c.id !== w.playerClub)!.id,
  country: 'ENG',
  groupKey: 'ENG:fa-cup',
});
const europe = (w: World): Fixture => ({
  ...cup(w),
  id: 'eu:test',
  kind: 'europe',
  groupKey: 'UCL',
});

describe('discipline (→MATCH-19)', () => {
  it('bans for five league yellows before mid-season but not after', () => {
    const w = world();
    const fixtures = leagueFixtures(w);
    const [early, late] = activePlayers(w);
    for (const f of fixtures.slice(0, 5)) applyDiscipline(w, booked(f, ownSide(w, f), early.id));
    expect(w.discipline!.bans).toEqual([
      { player: early.id, club: w.playerClub, matches: 1, scope: 'league', reason: 'yellows' },
    ]);
    const half = Math.ceil(fixtures.length / 2);
    for (const f of fixtures.slice(half, half + 5))
      applyDiscipline(w, booked(f, ownSide(w, f), late.id));
    expect(w.discipline!.yellows[late.id].league).toBe(5);
    expect(w.discipline!.bans.some((b) => b.player === late.id)).toBe(false);
  });
  it('bans two matches for ten yellows before 84% of the rounds and three for fifteen', () => {
    const w = world();
    const fixtures = leagueFixtures(w);
    const p = activePlayers(w)[0];
    for (const f of fixtures.slice(0, 15)) applyDiscipline(w, booked(f, ownSide(w, f), p.id));
    expect(w.discipline!.bans.map((b) => b.matches)).toEqual([1, 2, 3]);
    // The tenth yellow after 84% of the rounds bans nobody.
    const q = activePlayers(w)[1];
    const cut = Math.round(0.84 * fixtures.length);
    w.discipline!.yellows[q.id] = { league: 9 };
    applyDiscipline(w, booked(fixtures[cut], ownSide(w, fixtures[cut]), q.id));
    expect(w.discipline!.bans.some((b) => b.player === q.id)).toBe(false);
  });
  it('bans one cup match every third cup yellow and keeps league and cup counts apart', () => {
    const w = world();
    const p = activePlayers(w)[0];
    const f = leagueFixtures(w)[0];
    applyDiscipline(w, booked(f, ownSide(w, f), p.id));
    for (let i = 0; i < 3; i++) applyDiscipline(w, booked(cup(w), 0, p.id));
    expect(w.discipline!.yellows[p.id]).toEqual({ league: 1, 'cup:ENG:fa-cup': 3 });
    expect(w.discipline!.bans).toEqual([
      { player: p.id, club: w.playerClub, matches: 1, scope: 'cup:ENG:fa-cup', reason: 'yellows' },
    ]);
  });
  it('bans three domestic matches for violent conduct, one for a second yellow or DOGSO, two for dissent', () => {
    const w = world();
    const f = leagueFixtures(w)[0];
    const side = ownSide(w, f);
    const [a, b, c, d] = activePlayers(w);
    applyDiscipline(w, booked(f, side, a.id, 'red', 'violent'));
    applyDiscipline(w, booked(f, side, b.id, 'secondYellow', 'reckless'));
    applyDiscipline(w, booked(f, side, c.id, 'red', 'dogso'));
    applyDiscipline(w, booked(f, side, d.id, 'red', 'dissent'));
    expect(w.discipline!.bans.map((x) => [x.player, x.matches, x.scope, x.reason])).toEqual([
      [a.id, 3, 'domestic', 'violent'],
      [b.id, 1, 'domestic', 'secondYellow'],
      [c.id, 1, 'domestic', 'dogso'],
      [d.id, 2, 'domestic', 'dissent'],
    ]);
    // The second yellow counted towards accumulation too.
    expect(w.discipline!.yellows[b.id].league).toBe(1);
    // Each own ban reaches the inbox and the event log.
    expect(w.inbox!.filter((item) => item.title.startsWith('징계 통보')).length).toBe(4);
    expect(w.events.filter((e) => e.kind === 'suspension').length).toBe(4);
    // A red card in Europe bans in Europe only.
    applyDiscipline(w, booked(europe(w), 0, a.id, 'red', 'serious'));
    expect(w.discipline!.bans.at(-1)).toMatchObject({ scope: 'europe', matches: 3 });
  });
  it('serves domestic bans in league and cup matches but not in Europe', () => {
    const w = world();
    const f = leagueFixtures(w)[0];
    const p = activePlayers(w)[0];
    applyDiscipline(w, booked(f, ownSide(w, f), p.id, 'red', 'dissent'));
    expect(isUnavailable(w, p, w.playerClub, europe(w))).toBe(false);
    expect(isUnavailable(w, p, w.playerClub, cup(w))).toBe(true);
    serveBans(w, europe(w));
    expect(w.discipline!.bans[0].matches).toBe(2);
    serveBans(w, cup(w));
    expect(w.discipline!.bans[0].matches).toBe(1);
    serveBans(w, leagueFixtures(w)[1]);
    expect(w.discipline!.bans).toEqual([]);
    expect(isUnavailable(w, p, w.playerClub, f)).toBe(false);
  });
  it('carries an unserved ban into next season and resets yellows', () => {
    const w = world();
    const f = leagueFixtures(w)[0];
    const [a, b] = activePlayers(w);
    applyDiscipline(w, booked(f, ownSide(w, f), a.id, 'red', 'serious'));
    applyDiscipline(w, booked(f, ownSide(w, f), b.id));
    w.discipline!.out.push({ player: 'npc', club: f.away, until: { year: w.year, day: 400 } });
    w.year++;
    closeDisciplineSeason(w);
    expect(w.discipline).toMatchObject({ year: w.year, yellows: {}, out: [] });
    expect(w.discipline!.bans).toHaveLength(1);
  });
  it('leaves a banned own player out of the XI and the bench', () => {
    const w = world();
    const f = leagueFixtures(w)[0];
    const starter = ownStarters(w)[0];
    applyDiscipline(w, booked(f, ownSide(w, f), starter.id, 'red', 'serious'));
    expect(ownStarters(w, f).map((p) => p.id)).not.toContain(starter.id);
    const setup = buildGridSetup(w, f, { observe: false, recordPlayers: true });
    expect(setup.rosters[ownSide(w, f)].map((p) => p.id)).not.toContain(starter.id);
    // Europe is outside a domestic ban's scope.
    expect(ownStarters(w, europe(w)).map((p) => p.id)).toContain(starter.id);
  });
  it('replaces an unavailable NPC starter from the bench places', () => {
    const w = world();
    const f = leagueFixtures(w)[0];
    const club = ownLeagueClubs(w).find((c) => c.id === (ownSide(w, f) === 0 ? f.away : f.home))!;
    const xi = startingSquad(w, club);
    const out = xi[5];
    const side = ownSide(w, f) === 0 ? 1 : 0;
    applyDiscipline(w, booked(f, side, out.id, 'red', 'violent'));
    const replaced = startingSquad(w, club, f);
    expect(replaced).toHaveLength(xi.length);
    expect(replaced.map((p) => p.id)).not.toContain(out.id);
    const comes = replaced[5];
    expect(xi).not.toContain(comes);
    expect(squad(w, club).slice(xi.length, 18)).toContain(comes);
    expect(lineOf(comes.position)).toBe(lineOf(out.position));
    // Everyone else keeps his place.
    expect(replaced.filter((p, i) => i !== 5)).toEqual(xi.filter((p, i) => i !== 5));
  });
  it('warns a player one yellow short of a league ban', () => {
    const w = world();
    const [p, q] = activePlayers(w);
    w.discipline = {
      year: w.year,
      yellows: { [p.id]: { league: 4 }, [q.id]: { league: 3 } },
      bans: [],
      out: [],
    };
    expect(yellowWarning(w, p)).toBe(true);
    expect(yellowWarning(w, q)).toBe(false);
  });
});

describe('candidate model incidents and availability (→LEAGUE-15, MATCH-19, MATCH-21)', () => {
  it('carries incidents into the next lineup', () => {
    const w = withCandidateModel(founded(2024));
    const others = w.fixtures.filter(
      (f) =>
        f.round === 1 && f.kind === 'league' && f.home !== w.playerClub && f.away !== w.playerClub,
    );
    // What the first round's aggregate matches settle: the same facts on every call.
    const incidents = others.flatMap((f) => {
      const r = simulateMatch(w, f).record;
      return r.incidents!.map((x) => ({ x, club: x.side === 0 ? r.home : r.away }));
    });
    const hurt = incidents.filter(({ x }) => x.kind === 'injury');
    const sent = incidents.filter(({ x }) => x.kind === 'red' || x.kind === 'secondYellow');
    expect(hurt.length).toBeGreaterThan(0);
    expect(sent.length).toBeGreaterThan(0);
    advanceRound(w, undefined, false);
    // Each became the world's own: an injury entry for his club, a ban by person.
    const d = w.discipline!;
    for (const { x, club } of hurt)
      expect(d.out.some((o) => o.player === x.player && o.club === club)).toBe(true);
    for (const { x, club } of sent)
      expect(d.bans.some((b) => b.player === x.player && b.club === club)).toBe(true);
    // The club's next league match leaves out whoever is still unavailable for it.
    let left = 0;
    for (const { x, club } of [...hurt, ...sent]) {
      const next = w.fixtures
        .filter((f) => !f.score && f.kind === 'league' && (f.home === club || f.away === club))
        .sort((a, b) => a.round - b.round)[0]!;
      if (!isUnavailable(w, x.player, club, next)) continue;
      const p = simulateMatch(w, next);
      expect(p.squads[next.home === club ? 0 : 1].map((q) => q.id)).not.toContain(x.player);
      expect(p.record.players.map((l) => l.id)).not.toContain(x.player);
      left++;
    }
    expect(left).toBeGreaterThanOrEqual(sent.length);
  });

  it('shares one availability rule on both candidate paths', () => {
    const w = withCandidateModel(founded(2024));
    const f = leagueFixtures(w)[0]!;
    const side = ownSide(w, f);
    const xi = ownStarters(w, f);
    const [fit, ...spare] = activePlayers(w).filter((p) => !xi.includes(p));
    // Two starters are hurt and so is every other player but one: too few are fit, so the XI
    // keeps the hurt starters and one fit player waits on the bench.
    const hurt = [xi[3]!, xi[7]!];
    for (const p of [...hurt, ...spare])
      p.injury = { year: w.year, day: currentDay(w) + 30, label: '테스트 부상' };
    expect(ownStarters(w, f)).toEqual(expect.arrayContaining(hurt));
    // The detailed engine sends the fit substitute on for the first, as the aggregate path would.
    const setup = buildGridSetup(w, f, { observe: false, recordPlayers: true });
    expect(setup.model).toBeDefined();
    expect(setup.rosters[side].map((p) => p.id)).toEqual(
      xi.map((p, slot) => (slot === 3 ? fit! : p).id),
    );
    expect(setup.bench[side]).toBe(0);
    const shared = matchdayRosters(w, f, prepareMatch(w, f), eraRules(f.year));
    expect(setup.rosters).toEqual(shared);
    // The pre-feature grid keeps him, as its settled matches always have.
    const plain = structuredClone(w);
    delete plain.matchModel;
    delete plain.npcSeason;
    const before = buildGridSetup(plain, f, { observe: false, recordPlayers: true });
    expect(before.rosters[side].map((p) => p.id)).toEqual([...xi, fit!].map((p) => p.id));
  });
});
