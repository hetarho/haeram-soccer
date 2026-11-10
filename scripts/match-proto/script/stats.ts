// Script statistics: counts per team, the move histogram and who received what. Pure: it reads a
// beat list and nothing else.
import { isShotLike, PASS_KINDS, type Beat, type TeamId } from '../core/types.ts';

export interface TeamStats {
  beats: number;
  passes: number;
  completed: number;
  shots: number;
  onTarget: number;
  goals: number;
  offsides: number;
  crosses: number;
  corners: number;
  throwIns: number;
  goalKicks: number;
  freeKicks: number;
  tackles: number;
  interceptions: number;
  fouls: number;
  throughBalls: number;
  takeOns: number;
  possessions: number;
  counters: number;
}

export interface ScriptStats {
  teams: [TeamStats, TeamStats];
  /** Beats per move id. */
  moves: Record<string, number>;
  /** Receivers flagged offside, one entry per call. */
  offsideBy: number[];
  /** Receivers of completed through balls. */
  throughTo: number[];
  /** Move id → receivers of its completed beats. */
  receivedBy: Record<string, number[]>;
  score: [number, number];
}

const emptyTeam = (): TeamStats => ({
  beats: 0,
  passes: 0,
  completed: 0,
  shots: 0,
  onTarget: 0,
  goals: 0,
  offsides: 0,
  crosses: 0,
  corners: 0,
  throwIns: 0,
  goalKicks: 0,
  freeKicks: 0,
  tackles: 0,
  interceptions: 0,
  fouls: 0,
  throughBalls: 0,
  takeOns: 0,
  possessions: 0,
  counters: 0,
});

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

const KIND_COUNTER = {
  corner: 'corners',
  throwIn: 'throwIns',
  goalKick: 'goalKicks',
  freeKick: 'freeKicks',
  takeOn: 'takeOns',
} as const;

function countBeat(s: ScriptStats, b: Beat): void {
  const t = s.teams[b.team];
  const o = s.teams[other(b.team)];
  t.beats += 1;
  s.moves[b.move] = (s.moves[b.move] ?? 0) + 1;
  const shotLike = isShotLike(b);
  if (PASS_KINDS.includes(b.kind) && !shotLike) {
    t.passes += 1;
    if (b.outcome === 'complete') t.completed += 1;
  }
  if (shotLike) {
    t.shots += 1;
    if (b.outcome === 'goal' || b.outcome === 'saved') t.onTarget += 1;
  }
  if (b.outcome === 'goal') {
    t.goals += 1;
    s.score[b.team] += 1;
  }
  if (b.outcome === 'offside') {
    t.offsides += 1;
    if (b.receiver !== undefined) s.offsideBy.push(b.receiver);
  }
  if (b.move === 'cross') t.crosses += 1;
  const kindKey = (KIND_COUNTER as Partial<Record<string, keyof TeamStats>>)[b.kind];
  if (kindKey) t[kindKey] += 1;
  if (b.outcome === 'tackled') o.tackles += 1;
  if (b.outcome === 'intercepted') o.interceptions += 1;
  if (b.outcome === 'foul') o.fouls += 1;
  if (b.through) {
    t.throughBalls += 1;
    if (b.outcome === 'complete' && b.receiver !== undefined) s.throughTo.push(b.receiver);
  }
  if (b.outcome === 'complete' && b.receiver !== undefined) {
    (s.receivedBy[b.move] ??= []).push(b.receiver);
  }
}

export function scriptStats(beats: readonly Beat[]): ScriptStats {
  const s: ScriptStats = {
    teams: [emptyTeam(), emptyTeam()],
    moves: {},
    offsideBy: [],
    throughTo: [],
    receivedBy: {},
    score: [0, 0],
  };
  /** Possession number → its team (from its first beat) and whether it holds a counter beat. */
  const possessions = new Map<number, { team: TeamId; counter: boolean }>();
  for (const b of beats) {
    countBeat(s, b);
    let entry = possessions.get(b.possession);
    if (entry === undefined) {
      entry = { team: b.team, counter: false };
      possessions.set(b.possession, entry);
    }
    if (b.phase === 'counter' && b.team === entry.team) entry.counter = true;
  }
  for (const { team, counter } of possessions.values()) {
    s.teams[team].possessions += 1;
    if (counter) s.teams[team].counters += 1;
  }
  return s;
}
