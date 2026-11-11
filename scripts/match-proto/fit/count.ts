// The record counted back from a fitted script's beats (T820): passes, shots, restarts and duels
// are read from each beat's kind, outcome, actor, receiver and opponent, by the definitions T819
// fixed (core/settled.test.ts `recount`). `settled` gives the fixture's sides, the yellow cards
// (no beat carries a booking) and the cost's references; the counted rows never read an event,
// shot or foul row, so `compareRecord` is a proof rather than an echo.
import {
  CA,
  EV,
  PLAYER_ROW,
  SET_PIECES,
  SH,
  SHOT_KINDS,
  TEAM_ROW,
  type Settled,
} from '../core/settled.ts';
import { type Beat, PASS_KINDS, type Script, isShotLike } from '../core/types.ts';
import { dist } from '../core/vec.ts';
import { buildTouches, dealFixed } from './touches.ts';
import { minuteTimes } from './write.ts';

export interface Counted {
  team: [number[], number[]];
  players: number[][];
}

const P = (name: (typeof PLAYER_ROW)[number]) => PLAYER_ROW.indexOf(name);
const T = (name: (typeof TEAM_ROW)[number]) => TEAM_ROW.indexOf(name);
const RESTART_ROW: Partial<Record<Beat['kind'], (typeof TEAM_ROW)[number]>> = {
  throwIn: 'throwIns',
  goalKick: 'goalKicks',
  corner: 'corners',
  freeKick: 'freeKicks',
};

/** The record's rows (`TEAM_ROW`, `PLAYER_ROW`) counted from a script's beats alone, by the definitions T819 fixed. */
export function countScript(script: Script, settled: Settled): Counted {
  const players = Array.from({ length: 22 }, () => Array<number>(PLAYER_ROW.length).fill(0));
  const team: [number[], number[]] = [
    Array<number>(TEAM_ROW.length).fill(0),
    Array<number>(TEAM_ROW.length).fill(0),
  ];
  const teamOf = (i: number) => script.fixture.players[i]!.team;
  const beats = script.beats;
  beats.forEach((b, i) => {
    const row = RESTART_ROW[b.kind];
    if (row !== undefined) team[b.team][T(row)]!++;
    const counted = b.event !== undefined;
    if (counted && PASS_KINDS.includes(b.kind)) {
      players[b.actor]![P('passes')]!++;
      team[b.team][T('passes')]!++;
      if (b.outcome === 'complete') {
        players[b.actor]![P('completed')]!++;
        team[b.team][T('completed')]!++;
      }
    }
    if (counted && b.kind === 'takeOn') players[b.actor]![P('takeOns')]!++;
    if (counted && b.outcome === 'tackled') players[b.opponent!]![P('tackles')]!++;
    if (counted && b.outcome === 'intercepted') players[b.opponent!]![P('interceptions')]!++;
    if (counted && b.outcome === 'offside') {
      players[b.receiver!]![P('offsides')]!++;
      team[b.team][T('offsides')]!++;
    }
    if (b.outcome === 'foul') {
      players[b.opponent!]![P('fouls')]!++;
      players[b.actor]![P('foulsWon')]!++;
      team[teamOf(b.opponent!)][T('fouls')]!++;
    }
    if (isShotLike(b)) {
      players[b.actor]![P('shots')]!++;
      team[b.team][T('shots')]!++;
      if (b.outcome === 'goal' || b.outcome === 'saved') {
        players[b.actor]![P('onTarget')]!++;
        team[b.team][T('onTarget')]!++;
      }
      if (b.outcome === 'saved') players[b.opponent!]![P('saves')]!++;
      if (b.outcome === 'goal') {
        players[b.actor]![P('goals')]!++;
        team[b.team][T('goals')]!++;
        // The assist: the completed pass the scorer received, his own carries between.
        for (let k = i - 1; k >= 0; k--) {
          const a = beats[k]!;
          if (a.team !== b.team) break;
          if (a.actor === b.actor && (a.kind === 'carry' || a.kind === 'takeOn')) continue;
          if (
            a.event !== undefined &&
            PASS_KINDS.includes(a.kind) &&
            a.outcome === 'complete' &&
            a.receiver === b.actor
          )
            players[a.actor]![P('assists')]!++;
          break;
        }
      }
    }
  });
  for (const card of settled.cards) players[card[CA.player]!]![P('yellowCards')]!++;
  return { team, players };
}

/** Every cell that differs, as `player:<index>:<row>=<counted>/<recorded>` or `team:<side>:<row>=…`. */
export function compareRecord(settled: Settled, counted: Counted): string[] {
  const out: string[] = [];
  counted.team.forEach((row, side) =>
    row.forEach((v, k) => {
      const want = settled.record.team[side]![k]!;
      if (v !== want) out.push(`team:${side}:${TEAM_ROW[k]}=${v}/${want}`);
    }),
  );
  counted.players.forEach((row, p) =>
    row.forEach((v, k) => {
      const want = settled.record.players[p]![k]!;
      if (v !== want) out.push(`player:${p}:${PLAYER_ROW[k]}=${v}/${want}`);
    }),
  );
  return out;
}

export interface FitCost {
  beats: number;
  counted: number;
  links: number;
  linkMetres: number;
  miscontrols: number;
  connectiveRestarts: number;
  countedRestarts: number;
  orphanSetPieces: number;
  orphanFreeKickShots: number;
  movedCarries: number;
  maxOverrun: number;
}

/** What the joins cost: connective beats, orphaned set pieces, moved carries and the clock's largest overrun. */
export function fitCost(script: Script, settled: Settled): FitCost {
  const b = script.beats;
  const restart = (k: Beat['kind']) => k !== 'pass' && PASS_KINDS.includes(k);
  // The writer's dealing (T822): a floating carry "moves" when it joins a release fixed to a minute.
  const dealt = dealFixed(settled);
  const moved = { events: [...dealt.events], fouls: [...dealt.fouls] };
  buildTouches(settled, moved);
  const FREE_KICK = SHOT_KINDS.indexOf('freeKick');
  let maxOverrun = 0;
  for (let m = 0; m < 90; m++) {
    const list = b.filter((x) => Math.floor(x.clock! / 60) === m);
    if (list.length > 0) maxOverrun = Math.max(maxOverrun, minuteTimes(list, m).need - 60);
  }
  return {
    beats: b.length,
    counted: b.filter((x) => x.event !== undefined || x.shot !== undefined || x.foul !== undefined)
      .length,
    links: b.filter((x) => x.move === 'link').length,
    linkMetres: Math.round(
      b.filter((x) => x.move === 'link').reduce((s, x) => s + dist(x.from, x.to), 0),
    ),
    miscontrols: b.filter((x) => x.move === 'miscontrol').length,
    connectiveRestarts: b.filter((x) => x.move === 'restart').length,
    countedRestarts: b.filter(
      (x) => restart(x.kind) && (x.event !== undefined || x.shot !== undefined),
    ).length,
    orphanSetPieces: b.filter(
      (x) =>
        x.event !== undefined &&
        x.kind === 'pass' &&
        SET_PIECES[settled.events[x.event]![EV.setPiece]!] !== 'none',
    ).length,
    orphanFreeKickShots: b.filter(
      (x) =>
        x.shot !== undefined &&
        x.kind === 'shot' &&
        settled.shots[x.shot]![SH.kind] === FREE_KICK &&
        settled.shots[x.shot]![SH.source]! < 0,
    ).length,
    movedCarries: moved.events.filter((m, i) => m !== dealt.events[i]).length,
    maxOverrun: Math.round(Math.max(0, maxOverrun) * 10) / 10,
  };
}
