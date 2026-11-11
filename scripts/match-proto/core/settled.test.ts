import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CA,
  EV,
  EVENT_KINDS,
  EVENT_RESULTS,
  FO,
  fixtureOf,
  PLAYER_ROW,
  readSettled,
  SH,
  SHOT_OUTCOMES,
  TEAM_ROW,
  type Settled,
} from './settled.ts';

const DIR = new URL('../fixtures/settled/', import.meta.url);
const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const load = (name: string): unknown => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));

const result = (name: (typeof EVENT_RESULTS)[number]) => EVENT_RESULTS.indexOf(name);
const outcome = (name: (typeof SHOT_OUTCOMES)[number]) => SHOT_OUTCOMES.indexOf(name);
const PASS_KINDS = new Set([0, 1, 2, 3, 4]);
const TAKE_ON = EVENT_KINDS.indexOf('takeOn');

/** The player and team rows recomputed from the file's events, shots, fouls and cards. */
function recount(s: Settled) {
  const players = Array.from({ length: 22 }, () => Array<number>(PLAYER_ROW.length).fill(0));
  const team = [0, 1].map(() => Array<number>(TEAM_ROW.length).fill(0));
  const P = (name: (typeof PLAYER_ROW)[number]) => PLAYER_ROW.indexOf(name);
  const T = (name: (typeof TEAM_ROW)[number]) => TEAM_ROW.indexOf(name);
  for (const e of s.events) {
    const side = e[EV.side]!,
      actor = e[EV.actor]!,
      res = e[EV.result]!,
      other = e[EV.other]!;
    if (PASS_KINDS.has(e[EV.kind]!)) {
      players[actor]![P('passes')]!++;
      team[side]![T('passes')]!++;
      if (res === result('complete')) {
        players[actor]![P('completed')]!++;
        team[side]![T('completed')]!++;
      }
    }
    if (e[EV.kind] === TAKE_ON) players[actor]![P('takeOns')]!++;
    if (res === result('tackled')) players[other]![P('tackles')]!++;
    if (res === result('intercepted')) players[other]![P('interceptions')]!++;
    if (res === result('offside')) {
      players[other]![P('offsides')]!++;
      team[side]![T('offsides')]!++;
      // Production's free kicks (ledger.ts `freeKicksOf`): the opponent's offsides are its own.
      team[1 - side]![T('freeKicks')]!++;
    }
    if (res === result('cornerWon')) team[side]![T('corners')]!++;
    // Throw-ins and goal kicks go to the side that did not put the ball out (`sideCounters`).
    if (res === result('outTouch')) team[1 - side]![T('throwIns')]!++;
    if (res === result('outByline')) team[1 - side]![T('goalKicks')]!++;
  }
  for (const shot of s.shots) {
    const side = shot[SH.side]!,
      shooter = shot[SH.shooter]!,
      out = shot[SH.outcome]!;
    const goal = out === outcome('goal');
    players[shooter]![P('shots')]!++;
    team[side]![T('shots')]!++;
    if (goal || out === outcome('save')) {
      players[shooter]![P('onTarget')]!++;
      team[side]![T('onTarget')]!++;
    }
    if (goal) {
      players[shooter]![P('goals')]!++;
      team[side]![T('goals')]!++;
      if (shot[SH.passer]! >= 0) players[shot[SH.passer]!]![P('assists')]!++;
    }
    if (out === outcome('save')) players[shot[SH.keeper]!]![P('saves')]!++;
    if (shot[SH.corner] === 1) team[side]![T('corners')]!++;
    // Production's goal kicks also count the opponent's missed shots (`sideCounters`).
    if (out === outcome('miss')) team[1 - side]![T('goalKicks')]!++;
  }
  for (const foul of s.fouls) {
    const fouled = foul[FO.fouledSide]!;
    players[foul[FO.fouler]!]![P('fouls')]!++;
    players[foul[FO.fouled]!]![P('foulsWon')]!++;
    team[1 - fouled]![T('fouls')]!++;
    // A foul on a side is its free kick: no exported match holds a penalty (`freeKicksOf`).
    team[fouled]![T('freeKicks')]!++;
  }
  for (const card of s.cards) players[card[CA.player]!]![P('yellowCards')]!++;
  return { players, team };
}

describe('match-proto settled matches (T819)', () => {
  it('every exported match reads and holds together', () => {
    expect(files).toHaveLength(10);
    for (const name of files) {
      const s = readSettled(load(name));
      expect(`${s.id}.json`).toBe(name);
      const { players, team } = recount(s);
      expect(players, `${name} players`).toEqual(s.record.players);
      expect(team, `${name} team`).toEqual(s.record.team);
      expect(s.score).toEqual([team[0]![0], team[1]![0]]);
      // A shot's source is a completed attempt of its side by its passer (or, after a carry, its
      // shooter), each used once; its keeper is the opponent's slot 0.
      const used = new Set<number>();
      for (const shot of s.shots) {
        expect(shot[SH.keeper]).toBe((1 - shot[SH.side]!) * 11);
        const source = shot[SH.source]!;
        if (source < 0) continue;
        expect(used.has(source)).toBe(false);
        used.add(source);
        const e = s.events[source]!;
        expect(e[EV.side]).toBe(shot[SH.side]);
        expect(e[EV.result]).toBe(result('complete'));
        const by = PASS_KINDS.has(e[EV.kind]!) ? shot[SH.passer] : shot[SH.shooter];
        expect(e[EV.actor]).toBe(by);
      }
      // Events of one side and group sit together, in ledger order; ids are positions 0…n-1.
      for (let i = 1; i < s.events.length; i++) {
        const [a, b] = [s.events[i - 1]!, s.events[i]!];
        expect(a[EV.side]! * 1e6 + a[EV.group]!).toBeLessThanOrEqual(
          b[EV.side]! * 1e6 + b[EV.group]!,
        );
      }
      for (const e of s.events) {
        if (e[EV.result] === result('offside')) expect(e[EV.other]).not.toBe(e[EV.actor]);
        const own = Math.floor(e[EV.actor]! / 11);
        expect(own).toBe(e[EV.side]);
      }
    }
  });

  it('readSettled refuses a row of the wrong length and an unknown code', () => {
    const base = load(files[0]!) as Settled;
    const copy = () => JSON.parse(JSON.stringify(base)) as Settled;
    const short = copy();
    short.events[3] = short.events[3]!.slice(0, 9);
    expect(() => readSettled(short)).toThrow(/events\[3\].*length 9/);
    const unknown = copy();
    unknown.shots[0]![SH.outcome] = SHOT_OUTCOMES.length;
    expect(() => readSettled(unknown)).toThrow(/shots\[0\].*column 6/);
    const result = copy();
    result.events[0]![EV.result] = EVENT_RESULTS.length;
    expect(() => readSettled(result)).toThrow(/events\[0\]/);
    const version = { ...copy(), version: 2 };
    expect(() => readSettled(version)).toThrow(/version/);
    const role = copy();
    (role.sides[1].players[4] as { role: string }).role = 'libero';
    expect(() => readSettled(role)).toThrow(/sides\[1\]\.players\[4\]/);
  });

  it("fixtureOf gives the prototype's 22 players in slot order", () => {
    const s = readSettled(load(files[0]!));
    const fixture = fixtureOf(s);
    expect(fixture.players).toHaveLength(22);
    fixture.players.forEach((player, i) => {
      expect(player.index).toBe(i);
      expect(player.team).toBe(i < 11 ? 0 : 1);
      expect(player.slot).toBe(i % 11);
      expect(fixture.teams[player.team].players[player.slot]).toBe(player);
      const source = s.sides[player.team].players[player.slot]!;
      expect(player.position).toBe(source.position);
      expect(player.role).toBe(source.role);
      expect(player.attrs.passing).toBe(source.attrs[0]);
      expect(player.attrs.composure).toBe(source.attrs[9]);
    });
    expect(fixture.teams[0].code).toBe('H');
    expect(fixture.teams[1].code).toBe('A');
    expect(fixture.teams[0].formation).toBe(s.sides[0].formation);
    expect(fixture.players[0]!.position).toBe('GK');
    expect(fixture.players[11]!.position).toBe('GK');
  });
});
