/**
 * The record counted back from a script (→MATCH-38, MATCH-13, T826). `countScript` rebuilds the
 * detail's rows from the beats that play them — who played each row, where it started and ended,
 * how it ended and who won it, a shot's passer as the completed pass its shooter received, and as
 * many rows as the beats play — and counts them with `recordOf` (build.ts, T825), so every team and
 * player value of the record (`M`, `TD`, `PD`) is compared under the one definition each counter
 * has. What no beat states (a row's group, kind, set piece, line-breaking flag and period, a shot's
 * kind, xG and source, a foul's card; stints and incidents) is the detail's.
 */
import { PD, TD } from '../../../contracts/src/detail';
import type { MatchScript, ScriptBeat } from '../../../contracts/src/match-script';
import { M } from '../grid/record';
import { recordOf } from './build';
import { cellAt, metres } from './cells';
import {
  CARD_REASONS,
  EV,
  FO,
  IN,
  INCIDENT_KINDS,
  R,
  SET_PIECES,
  SH,
  SHOT_KINDS,
  type MatchDetail,
} from './detail';
import { buildTouches, dealFixed } from './touches';
import { isPassLike, isRestart, minuteTimes } from './write';

export type Counted = ReturnType<typeof recordOf>;

/** An event row's result as its beat and the beat after it state it. */
function resultOf(b: ScriptBeat, next: ScriptBeat | undefined, recorded: number): number {
  switch (b.outcome) {
    case 'complete':
      return R.complete;
    case 'offside':
      return R.offside;
    case 'intercepted':
      return R.intercepted;
    case 'tackled':
      return R.tackled;
    case 'loose':
      return b.opponent === undefined ? R.looseKept : R.looseRecovered;
    case 'out':
      return next?.kind === 'throwIn'
        ? R.outTouch
        : next?.kind === 'goalKick'
          ? R.outByline
          : next?.kind === 'corner'
            ? R.cornerWon
            : recorded;
    default:
      return -1;
  }
}

/** The line a shot's passer is read as: the completed recorded pass its shooter received, his own carries between. */
function passerOf(beats: readonly ScriptBeat[], i: number): number {
  const b = beats[i]!;
  // A penalty has no assist (→MATCH-11), nor a free kick struck after its foul.
  if (b.kind === 'penalty') return -1;
  for (let k = i - 1; k >= 0; k--) {
    const a = beats[k]!;
    if (a.kind === 'stoppage') continue;
    if (a.outcome === 'foul') return -1;
    if (a.side !== b.side) return -1;
    if (a.actor === b.actor && (a.kind === 'carry' || a.kind === 'takeOn')) continue;
    return a.event !== undefined &&
      isPassLike(a.kind) &&
      a.outcome === 'complete' &&
      a.receiver === b.actor
      ? a.actor
      : -1;
  }
  return -1;
}

const PENALTY = SHOT_KINDS.indexOf('penalty');
const OPEN = SHOT_KINDS.indexOf('open');

/**
 * The record's team and player values counted from a script, in `recordOf`'s layout: cards,
 * substitutions and injuries from the beats' incidents (each in its beat's minute), penalties from
 * the `penalty` beats and the shoot-out from its kicks (T827).
 */
export function countScript(script: MatchScript, detail: MatchDetail): Counted {
  const beats = script.beats;
  const events: [number, number[]][] = [];
  const shots: [number, number[]][] = [];
  const fouls: [number, number[]][] = [];
  const incidents: [number, number[]][] = [];
  const shootout: number[][] = [];
  /** The next beat after `i` that is not a stoppage. */
  const after = (i: number) => beats.slice(i + 1).find((x) => x.kind !== 'stoppage');
  beats.forEach((b, i) => {
    for (const x of b.incidents ?? []) {
      const row = [...(detail.incidents[x.incident] ?? [0, 0, 0, 0, -1, -1, -1])];
      row[IN.minute] = Math.floor(b.clock / 60) + 1;
      row[IN.side] = x.side;
      row[IN.kind] = INCIDENT_KINDS.indexOf(x.kind);
      row[IN.line] = x.line;
      row[IN.other] = x.other ?? -1;
      row[IN.reason] = x.reason === undefined ? -1 : CARD_REASONS.indexOf(x.reason);
      incidents.push([x.incident, row]);
    }
    if (b.kind === 'shootoutKick') shootout.push([b.side, b.actor, b.outcome === 'goal' ? 1 : 0]);
    if (b.event !== undefined && detail.events[b.event]) {
      const e = [...detail.events[b.event]!];
      e[EV.side] = b.side;
      e[EV.actor] = b.actor;
      // A restart's delivery is taken from its restart spot, beside its recorded cell.
      if (!isRestart(b.kind)) e[EV.from] = cellAt(b.side, b.from);
      e[EV.to] = cellAt(b.side, b.to);
      e[EV.result] = resultOf(b, beats[i + 1], e[EV.result]!);
      const named = e[EV.other]! >= 0;
      e[EV.other] = !named
        ? -1
        : e[EV.result] === R.offside
          ? (b.receiver ?? -1)
          : (b.opponent ?? -1);
      events.push([b.event, e]);
    }
    if (b.shot !== undefined && detail.shots[b.shot]) {
      const s = [...detail.shots[b.shot]!];
      s[SH.side] = b.side;
      s[SH.shooter] = b.actor;
      if (b.kind !== 'freeKick' && b.kind !== 'penalty') s[SH.cell] = cellAt(b.side, b.from);
      if (b.kind === 'penalty') s[SH.kind] = PENALTY;
      else if (s[SH.kind] === PENALTY) s[SH.kind] = OPEN;
      s[SH.outcome] = { goal: 0, saved: 1, blocked: 2, wide: 3 }[b.outcome as 'goal'] ?? -1;
      s[SH.header] = b.header ? 1 : 0;
      if (b.outcome === 'saved') s[SH.keeper] = b.opponent ?? -1;
      s[SH.passer] = passerOf(beats, i);
      shots.push([b.shot, s]);
    }
    if (b.foul !== undefined && detail.fouls[b.foul]) {
      const f = [...detail.fouls[b.foul]!];
      f[FO.fouledSide] = b.side;
      f[FO.fouled] = b.actor;
      f[FO.fouler] = b.opponent ?? -1;
      f[FO.cell] = cellAt(b.side, b.from);
      f[FO.penalty] = after(i)?.kind === 'penalty' ? 1 : 0;
      fouls.push([b.foul, f]);
    }
  });
  // Rows in the detail's order, so the rebuilt ledger groups its moves as the detail's does.
  const byId = (rows: [number, number[]][]) => rows.sort((a, b) => a[0] - b[0]);
  byId(events);
  byId(shots);
  byId(fouls);
  byId(incidents);
  const position = new Map<number, number>();
  events.forEach(([id], k) => {
    if (!position.has(id)) position.set(id, k);
  });
  for (const [, s] of shots) {
    const source = s[SH.source]!;
    s[SH.source] = source < 0 ? -1 : (position.get(source) ?? -1);
  }
  return recordOf({
    ...detail,
    events: events.map(([, e]) => e),
    shots: shots.map(([, s]) => s),
    fouls: fouls.map(([, f]) => f),
    incidents: incidents.map(([, x]) => x),
    shootout,
  });
}

const KEYS = <T extends Record<string, number>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<number, string>;
const M_NAMES = KEYS(M);
const TD_NAMES = KEYS(TD);
const PD_NAMES = KEYS(PD);

/**
 * Every value the count gives otherwise than the detail's own record, as
 * `team:<side>:<M|TD>.<name>=<counted>/<recorded>`, `player:<side>:<line>:<M|PD>.<name>=…`,
 * `score:…` or `xg:<side>=…`; empty when the script gives the record back.
 */
export function compareRecord(detail: MatchDetail, counted: Counted): string[] {
  const want = recordOf(detail);
  const out: string[] = [];
  const diff = (
    at: string,
    names: Record<number, string>,
    got: readonly number[] = [],
    expected: readonly number[] = [],
  ) =>
    expected.forEach((v, k) => {
      const g = got[k] ?? 0;
      if (g !== v) out.push(`${at}.${names[k] ?? k}=${g}/${v}`);
    });
  if (counted.score.home !== want.score.home || counted.score.away !== want.score.away)
    out.push(
      `score=${counted.score.home}-${counted.score.away}/${want.score.home}-${want.score.away}`,
    );
  ([0, 1] as const).forEach((side) => {
    diff(`team:${side}:M`, M_NAMES, counted.metrics[side], want.metrics[side]);
    diff(`team:${side}:TD`, TD_NAMES, counted.detail?.[side], want.detail?.[side]);
    if (counted.xg?.[side] !== want.xg?.[side])
      out.push(`xg:${side}=${counted.xg?.[side]}/${want.xg?.[side]}`);
  });
  // Cards, substitutions and injuries with their minutes, the regulation score and the shoot-out.
  const json = (v: unknown) => JSON.stringify(v ?? null);
  const got = counted.incidents ?? [];
  const recorded = want.incidents ?? [];
  for (let i = 0; i < Math.max(got.length, recorded.length); i++)
    if (json(got[i]) !== json(recorded[i]))
      out.push(`incident:${i}=${json(got[i])}/${json(recorded[i])}`);
  if (json(counted.regulation) !== json(want.regulation))
    out.push(`regulation=${json(counted.regulation)}/${json(want.regulation)}`);
  if (json(counted.shootout) !== json(want.shootout))
    out.push(`shootout=${json(counted.shootout)}/${json(want.shootout)}`);
  let k = 0;
  ([0, 1] as const).forEach((side) =>
    detail.sides[side].lines.forEach((_, line) => {
      const got = counted.players[k];
      const expected = want.players[k]!;
      k++;
      const at = `player:${side}:${line}`;
      diff(`${at}:M`, M_NAMES, got?.metrics, expected.metrics);
      diff(`${at}:PD`, PD_NAMES, got?.detail, expected.detail);
    }),
  );
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

/** What the joins cost: connective beats, orphaned set pieces, moved carries and the clock's largest overrun (the prototype's `fitCost`). */
export function scriptCost(script: MatchScript, detail: MatchDetail): ScriptCost {
  const b = script.beats.filter((x) => x.kind !== 'shootoutKick');
  const restart = (k: ScriptBeat['kind']) => k !== 'pass' && isPassLike(k);
  // A floating carry "moves" when it joins a release fixed to a minute.
  const dealt = dealFixed(detail);
  const moved = { events: [...dealt.events], fouls: [...dealt.fouls] };
  buildTouches(detail, moved);
  const FREE_KICK = SHOT_KINDS.indexOf('freeKick');
  let maxOverrun = 0;
  for (let m = 0; m < detail.length; m++) {
    const list = b.filter((x) => Math.floor(x.clock / 60) === m);
    if (list.length > 0) maxOverrun = Math.max(maxOverrun, minuteTimes(list, m).need - 60);
  }
  const links = b.filter((x) => x.move === 'link');
  return {
    beats: b.length,
    counted: b.filter((x) => x.event !== undefined || x.shot !== undefined || x.foul !== undefined)
      .length,
    links: links.length,
    linkMetres: Math.round(links.reduce((s, x) => s + metres(x.from, x.to), 0)),
    miscontrols: b.filter((x) => x.move === 'miscontrol').length,
    connectiveRestarts: b.filter((x) => x.move === 'restart').length,
    countedRestarts: b.filter(
      (x) => restart(x.kind) && (x.event !== undefined || x.shot !== undefined),
    ).length,
    orphanSetPieces: b.filter(
      (x) =>
        x.event !== undefined &&
        x.kind === 'pass' &&
        SET_PIECES[detail.events[x.event]![EV.setPiece]!] !== 'none',
    ).length,
    orphanFreeKickShots: b.filter(
      (x) =>
        x.shot !== undefined &&
        x.kind === 'shot' &&
        detail.shots[x.shot]![SH.kind] === FREE_KICK &&
        detail.shots[x.shot]![SH.source]! < 0,
    ).length,
    movedCarries: moved.events.filter((m, i) => m !== dealt.events[i]).length,
    maxOverrun: Math.round(Math.max(0, maxOverrun) * 10) / 10,
  };
}
