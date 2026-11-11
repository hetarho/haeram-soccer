/** Recount the script through the same leaf counter definitions as the aggregate record. */
import { TD } from '../../../contracts/src/detail';
import { recordOf } from './recount';
import type { MatchDetail } from './detail';
import { EVENT_KINDS, EVENT_RESULTS, SET_PIECES, SHOT_KINDS, SHOT_OUTCOMES } from './codes';
import type { Beat, Script } from './types';
import { isPassLike, isRestartKind } from './types';
import { cellAt, dist } from './cells';
import { buildTouches, dealFixed } from './touches';
import { minuteTimes } from './clock';
import { planRestarts } from './restarts';
import { incidentRows } from './incidents';

export type Counted = ReturnType<typeof recordOf>;
const shotOutcome = (b: Beat) =>
  b.outcome === 'saved'
    ? 'save'
    : b.outcome === 'blocked'
      ? 'block'
      : b.outcome === 'wide'
        ? 'miss'
        : 'goal';
const eventResult = (b: Beat) =>
  b.outcome === 'out'
    ? b.outKind!
    : b.outcome === 'loose'
      ? b.opponent === undefined
        ? 'looseKept'
        : 'looseRecovered'
      : b.outcome;
const setPiece = (b: Beat) => b.setPiece ?? 'none';

/** Beat IDs mark recorded actions; coordinates/outcomes/credits supply their counted facts.
 * Only xG, line-breaking and source qualifiers are carried verbatim, since the picture cannot infer them.
 * Participation minutes remain the record's; incidents and knockout kicks are read from beats. */
export function countScript(
  script: Script,
  detail: MatchDetail,
  scope: 'complete' | 'prefix' = 'complete',
): Counted {
  const events: number[][] = [],
    shots: number[][] = [],
    fouls: number[][] = [];
  const eventIds = new Map<number, number>();
  for (const b of script.beats) {
    if (b.event === undefined) continue;
    eventIds.set(b.event, events.length);
    events.push([
      b.side,
      events.length,
      EVENT_KINDS.indexOf(b.move as (typeof EVENT_KINDS)[number]),
      SET_PIECES.indexOf(setPiece(b)),
      cellAt(b.side, b.from),
      cellAt(b.side, b.to),
      b.actor,
      EVENT_RESULTS.indexOf(eventResult(b) as (typeof EVENT_RESULTS)[number]),
      b.lineBreaking ? 1 : 0,
      b.outcome === 'offside' ? b.receiver! : b.creditedOpponent ? (b.opponent ?? -1) : -1,
      b.period <= 2 ? 0 : 1,
    ]);
  }
  for (const [i, b] of script.beats.entries()) {
    if (b.shot !== undefined) {
      let passer = -1;
      // A goal's assist is read from its actual delivery. On other shots the recorded chance
      // source states whether a pass created it or the shooter made it from his own carry.
      if (b.source! >= 0 && (b.outcome === 'goal' || (b.keyPass !== undefined && b.keyPass >= 0))) {
        for (let k = i - 1; k >= 0; k--) {
          const prev = script.beats[k]!;
          if (prev.side !== b.side) break;
          if ((prev.kind === 'carry' || prev.kind === 'takeOn') && prev.actor === b.actor) continue;
          if (
            prev.event !== undefined &&
            isPassLike(prev.kind) &&
            prev.outcome === 'complete' &&
            prev.receiver === b.actor
          )
            passer = prev.actor;
          break;
        }
      }
      shots.push([
        b.side,
        Math.floor(b.clock / 60) + 1,
        cellAt(b.side, b.from),
        SHOT_KINDS.indexOf(b.shotKind!),
        b.header ? 1 : 0,
        b.xg!,
        SHOT_OUTCOMES.indexOf(shotOutcome(b)),
        b.corner ? 1 : 0,
        b.actor,
        passer,
        b.source! >= 0 ? (eventIds.get(b.source!) ?? -1) : -1,
        b.outcome === 'saved' ? b.opponent! : b.keeper!,
      ]);
    }
    if (b.foul !== undefined) {
      const next = script.beats.slice(i + 1).find((x) => x.kind !== 'stoppage');
      fouls.push([
        b.side,
        cellAt(b.side, b.from),
        b.opponent!,
        b.actor,
        b.incidents?.length ? Math.floor(b.clock / 60) + 1 : -1,
        next?.kind === 'penalty' ? 1 : 0,
        b.period <= 2 ? 0 : 1,
      ]);
    }
  }
  const counted = recordOf(
    {
      ...detail,
      events,
      shots,
      fouls,
      incidents: incidentRows(script.beats),
      shootout: script.beats
        .filter((b) => b.kind === 'shootoutKick')
        .map((b) => [b.side, b.actor, b.outcome === 'goal' ? 1 : 0]),
    },
    scope,
  );
  // A restart is a script event, including one with no recorded delivery. Count it directly.
  const restarts = {
    corner: TD.corners,
    throwIn: TD.throwIns,
    goalKick: TD.goalKicks,
    freeKick: TD.freeKicks,
  };
  for (const side of [0, 1] as const)
    for (const [kind, col] of Object.entries(restarts))
      counted.detail![side]![col] = script.beats.filter(
        (b) => b.side === side && b.kind === kind,
      ).length;
  return counted;
}

/** Every M, TD and PD cell is compared, including layout/presence mismatches. */
export function compareRecord(
  detail: MatchDetail,
  counted: Counted,
  expected: Counted = recordOf(detail),
): string[] {
  const out: string[] = [];
  const rows = (
    label: string,
    a: readonly number[] | undefined,
    b: readonly number[] | undefined,
  ) => {
    if (!a || !b) {
      if (a !== b) out.push(`${label}:missing`);
      return;
    }
    for (let k = 0; k < Math.max(a.length, b.length); k++)
      if (a[k] !== b[k]) out.push(`${label}:${k}=${a[k]}/${b[k]}`);
  };
  for (const side of [0, 1] as const) {
    rows(`team:${side}:M`, counted.metrics[side], expected.metrics[side]);
    rows(`team:${side}:TD`, counted.detail?.[side], expected.detail?.[side]);
  }
  rows('xg', counted.xg, expected.xg);
  for (const key of ['score', 'regulation'] as const)
    if (JSON.stringify(counted[key]) !== JSON.stringify(expected[key])) out.push(key);
  if (counted.players.length !== expected.players.length) out.push('players:length');
  expected.players.forEach((p, i) => {
    const got = counted.players[i];
    if (got?.id !== p.id) out.push(`player:${i}:id`);
    rows(`player:${i}:M`, got?.metrics, p.metrics);
    rows(`player:${i}:PD`, got?.detail, p.detail);
  });
  if (JSON.stringify(counted.shootout) !== JSON.stringify(expected.shootout)) out.push('shootout');
  const incidents = (r: Counted) => r.incidents?.map((x) => JSON.stringify(x)).sort();
  if (JSON.stringify(incidents(counted)) !== JSON.stringify(incidents(expected)))
    out.push('incidents');
  return out;
}

export interface ScriptCost {
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
export function scriptCost(script: Script, detail: MatchDetail): ScriptCost {
  const b = script.beats,
    dealt = dealFixed(detail),
    moved = { events: [...dealt.events], fouls: [...dealt.fouls] };
  buildTouches(detail, moved, planRestarts(detail, dealt).reserve);
  let maxOverrun = 0;
  for (let m = 0; m < detail.length; m++) {
    const list = b.filter((x) => Math.floor(x.clock / 60) === m);
    if (list.length) maxOverrun = Math.max(maxOverrun, minuteTimes(list, m).need - 60);
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
      (x) => isRestartKind(x.kind) && (x.event !== undefined || x.shot !== undefined),
    ).length,
    orphanSetPieces: b.filter(
      (x) => x.event !== undefined && x.kind === 'pass' && x.setPiece !== 'none',
    ).length,
    orphanFreeKickShots: b.filter(
      (x) =>
        x.shot !== undefined && x.kind === 'shot' && x.shotKind === 'freeKick' && x.source! < 0,
    ).length,
    movedCarries: moved.events.filter((m, i) => m !== dealt.events[i]).length,
    maxOverrun: Math.round(Math.max(0, maxOverrun) * 10) / 10,
  };
}
