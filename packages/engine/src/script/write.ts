// The fitted writer (T820, its order T822): a full-match script that performs every settled
// attempt, shot and foul exactly once. The record is the fact; the writer chooses only the order
// (greedy over the whole match: the cheapest touch by `touchCost`), the minutes of the rows the
// record gives none, the receivers, the points inside the cells, the clock and the connective
// tissue (link carries, miscontrols, restart deliveries no recorded pass makes). A pure function of
// the settled match and the seed (-> ARCH-5).
import { SCRIPT_CONFIG } from './config';
import { BAND_EDGES } from '../match/pitch';
import {
  PITCH,
  toAttack,
  dist,
  cellAt,
  cellCentre,
  cellDistance,
  goalAim,
  intoCell,
  keeperHold,
  pointAway,
  restartSpot,
} from './cells';
import { EV, EVENT_KINDS, EVENT_RESULTS, FO, IN, SET_PIECES, SH, SHOT_OUTCOMES } from './codes';
import type { MatchDetail as Settled } from './detail';
import { detailIssues } from './recount';
import { nominalSpot } from '../staging/shape';
import { random } from '../primitives';
import type { Beat, BeatKind, BeatOutcome, Phase, Script, TeamId, Vec } from './types';
import { isPassLike, isRestartKind as isRestart } from './types';
import { FLOATING, buildTouches, dealFixed, firstCell } from './touches';
import { present, periodOf } from './windows';
import { beatIncident, foulCards, incidentIndex, scriptPeriod } from './incidents';
import { validateScript } from './validate';
import { compareRecord, countScript } from './count';
import { planRestarts } from './restarts';
import { minuteTimes, travel, deadOf } from './clock';
import { TouchSearch } from './search';
const FIT = SCRIPT_CONFIG;
const GRAMMAR = SCRIPT_CONFIG;
const MIN_INDEXED_POOL = 32;
/**
 * Writer rules of the natural-football order, module constants rather than lab tunables (the lab
 * catalog lists only the config objects): a player's floating touches spread over his window
 * (`spread`: metres of pull per touch behind its share, at most `cap` touches); metres a recorded
 * carry that starts and ends in one cell takes the ball (`cellCarry`); metres a pass lands behind
 * its start for the writer to give it a reason (`backPass`, `passReason`); a shot from outside the
 * box is struck within `shotDepth` metres of its cell's goal-side edge. A touch whose release goes
 * back costs `reversal` per metre (between cell centres) its link would carry the ball forward first,
 * so the man who drives forward does not then turn round and pass backward, and `backDelay` per metre
 * back from the attacking half, so attacks go on before the ball is recycled (natural-football b).
 */
export const NATURAL = {
  spread: { weight: 4, cap: 10 },
  cellCarry: 5,
  backPass: 5,
  shotDepth: 10,
  reversal: 1,
  backDelay: 0,
};
const R = (name: (typeof EVENT_RESULTS)[number]) => EVENT_RESULTS.indexOf(name);
const KIND = (code: number) => EVENT_KINDS[code]!;
const other = (t: TeamId): TeamId => (t === 0 ? 1 : 0);

interface Owed {
  kind: BeatKind;
  side: TeamId;
  spot: Vec;
  /** A touch that must deliver it (a direct free-kick shot after its foul). */
  via?: number;
}
interface Pending {
  event: number;
  actor: number;
  side: TeamId;
  from: Vec;
  kind: BeatKind;
  outcome: BeatOutcome;
  minute: number;
}

const phaseOf = (side: TeamId, ball: Vec): Phase => {
  const x = toAttack(side, ball)[0];
  return x < GRAMMAR.phaseX.progression
    ? 'buildUp'
    : x < GRAMMAR.phaseX.finalThird
      ? 'progression'
      : 'finalThird';
};

const cellGap = (a: number, b: number) => cellDistance(Math.max(a, 0), Math.max(b, 0));

/** Public boundary: any failed placement/recount returns no script. */
export function writeScript(
  detail: Settled,
  seed: string,
): { script: Script } | { problems: string[] } {
  return writePeriods(detail, seed);
}

/** Pure placement core, also used directly by the placement regression cases. */
export function writePeriods(
  detail: Settled,
  seed: string,
): { script: Script } | { problems: string[] } {
  const issues = detailIssues(detail);
  if (issues.length) return { problems: issues };
  const script = writeFitted(detail, seed);
  const problems = validateScript(detail, script);
  if (!problems.length) problems.push(...compareRecord(detail, countScript(script, detail)));
  return problems.length ? { problems } : { script };
}

/**
 * A script performing every row of `settled`. Rows the record gives a minute (shots, their sources,
 * booked fouls) are played in it; every other row floats and is played in whichever minute the
 * order of play reaches it, each minute taking its even share of all touches (T822). The order is
 * greedy: the next touch is the one starting nearest the ball (`touchCost`), ties broken by row id.
 */
function writeFitted(settled: Settled, seed: string): Script {
  const rng = random(`${seed}:script`);
  const cards = foulCards(settled);
  const booked = new Set(cards.values());
  const fixed = dealFixed(settled);
  const { demand, reserve } = planRestarts(settled, fixed);
  const touches = buildTouches(settled, fixed, reserve);
  const played = touches.map(() => false);
  const startCell = touches.map((t) => firstCell(settled, t));
  // Costs tie by row id, independent of host sort order and random draw counts.
  const rowId = (i: number): number => {
    const t = touches[i]!,
      r = t.release;
    if (t.carries.length) return t.carries[0]!;
    if (r && 'event' in r) return r.event;
    if (r && 'shot' in r) return settled.events.length + r.shot;
    return settled.events.length + settled.shots.length + (r && 'foul' in r ? r.foul : 0);
  };
  const order = touches.map((_, i) => i).sort((a, b) => rowId(a) - rowId(b));
  // Temporal eligibility is fixed by the record. Keep row-id order inside each minute/side;
  // playing a touch and waiting for an entrant remain dynamic checks below.
  const minuteOrder = Array.from({ length: settled.length }, (_, m) =>
    ([0, 1] as const).map((team) =>
      order.filter((i) => {
        const t = touches[i]!;
        return (
          t.side === team &&
          (t.minute === m || t.minute === FLOATING) &&
          t.period === periodOf(m) &&
          m >= t.from &&
          m < t.until
        );
      }),
    ),
  );
  const fixedRemaining = Array.from({ length: settled.length }, () => [0, 0]);
  const expiring = Array<number>(settled.length).fill(0);
  const turnsRemaining = minuteOrder.map((teams) =>
    teams.map((rows, team) => {
      const counts = settled.sides[team]!.lines.map(() => 0);
      for (const i of rows) counts[touches[i]!.actor]!++;
      return counts;
    }),
  );
  for (const t of touches) {
    if (t.minute >= 0) fixedRemaining[t.minute]![t.side]!++;
    const last = t.until - 1;
    if (last >= 0 && last < settled.length && t.period === periodOf(last)) expiring[last]!++;
  }
  const total = [0, 0];
  const done = [0, 0];
  const endsTotal = [0, 0];
  const endsDone = [0, 0];
  /** Whether touch `i` ends its side's possession when played (a failed release, a shot, a lost carry). */
  const ends = touches.map((t) => {
    const r = t.release;
    if (r === undefined) {
      const last = t.carries[t.carries.length - 1];
      return last !== undefined && settled.events[last]![EV.result] !== R('complete');
    }
    // A shot that wins a corner and a pass out for a corner keep the ball for the side.
    if ('shot' in r) return settled.shots[r.shot]![SH.corner] !== 1;
    if ('foul' in r) return false;
    const res = settled.events[r.event]![EV.result]!;
    return res !== R('complete') && res !== R('looseKept') && res !== R('cornerWon');
  });
  touches.forEach((t, i) => {
    total[t.side]!++;
    if (ends[i]) endsTotal[t.side]!++;
  });
  const actorLeft = settled.sides.map((s) => s.lines.map(() => 0));
  const winsLeft = settled.sides.map((s) => s.lines.map(() => 0));
  const winner = touches.map((t) => {
    const r = t.release;
    if (r && 'shot' in r) {
      const s = settled.shots[r.shot]!;
      return s[SH.outcome] === 1 && !s[SH.corner] ? s[SH.keeper]! : -1;
    }
    const id = r && 'event' in r ? r.event : r === undefined ? t.carries.at(-1) : undefined;
    if (id === undefined) return -1;
    const e = settled.events[id]!;
    return [R('intercepted'), R('tackled'), R('looseRecovered')].includes(e[EV.result]!)
      ? e[EV.other]!
      : -1;
  });
  touches.forEach((t, i) => {
    actorLeft[t.side]![t.actor]!++;
    if (winner[i]! >= 0) winsLeft[other(t.side)]![winner[i]!]!++;
  });
  // Attack-frame metres between cell centres: how far a link carries forward and a release goes back.
  const centreX = (cell: number) => cellCentre(0, Math.max(cell, 0))[0];
  /** Metres touch `i`'s release goes back (a pass or a lost ball played backward; else 0). */
  const releaseBack = touches.map((t) => {
    const r = t.release;
    if (r === undefined || !('event' in r)) return 0;
    const e = settled.events[r.event]!;
    return Math.max(0, centreX(e[EV.from]!) - centreX(e[EV.to]!));
  });
  /** Whether touch `i` releases a pass the record flags as a corner's or free kick's delivery. */
  const setPiece = touches.map(
    (t) =>
      t.release !== undefined &&
      'event' in t.release &&
      SET_PIECES[settled.events[t.release.event]![EV.setPiece]!] !== 'none',
  );
  // Each player's floating touches are spread over the minutes he and the men they name share:
  // a group of touches (same side, player and window) behind its even share is pulled forward,
  // one ahead of it waits. Without it the order spends a departing man's touches only when his
  // window closes, in a burst of long links (T840: 260 beats in one minute).
  const groupKey = new Map<string, number>();
  const spreadGroup = touches.map((t) => {
    if (t.minute !== FLOATING) return -1;
    const key = `${t.side}:${t.actor}:${t.period}:${t.from}:${t.until}`;
    let g = groupKey.get(key);
    if (g === undefined) groupKey.set(key, (g = groupKey.size));
    return g;
  });
  const spreadTotal = Array<number>(groupKey.size).fill(0);
  const spreadPlayed = Array<number>(groupKey.size).fill(0);
  const spreadSpan = Array<[number, number]>(groupKey.size);
  touches.forEach((t, i) => {
    const g = spreadGroup[i]!;
    if (g < 0) return;
    spreadTotal[g]!++;
    spreadSpan[g] = [t.from, t.until];
  });
  const spreadCap = Math.round(NATURAL.spread.weight * NATURAL.spread.cap * 100);
  /** How much cheaper touch `i` is for its group being behind its even share at `time`. */
  const spreadPull = (i: number, time: number): number => {
    const g = spreadGroup[i]!;
    if (g < 0 || spreadCap === 0) return 0;
    const [from, until] = spreadSpan[g]!;
    // The share is due by the start of the window's last minute, so a departing man has played
    // his touches before the dead ball his substitution waits for.
    const share = Math.min(1, Math.max(0, (time - from) / Math.max(1, until - 1 - from)));
    const behind = share * spreadTotal[g]! - spreadPlayed[g]!;
    return Math.round(
      Math.min(Math.max(behind, -NATURAL.spread.cap), NATURAL.spread.cap) *
        NATURAL.spread.weight *
        100,
    );
  };
  const search = new TouchSearch(
    touches.map((t, i) => ({
      side: t.side,
      cell: Math.max(0, startCell[i]!),
      group: (ends[i] ? 1 : 0) + (winner[i]! >= 0 ? 2 : 0),
    })),
    order,
  );
  // Bounds are exact only while these cost operations stay in safe-integer arithmetic. Other
  // tunings use the original full scan; this guard never changes the cost or a football rule.
  const precisionBudget = Number.MAX_SAFE_INTEGER / 16;
  const weights = [
    FIT.fixedPull,
    FIT.fixedPush,
    FIT.winnerPull,
    FIT.setPieceWait,
    FIT.restartPull,
  ].map((x) => x * 100);
  const indexedCosts =
    weights.every(Number.isSafeInteger) &&
    weights.reduce((sum, x) => sum + Math.abs(x), 0) < precisionBudget;
  const beats: Beat[] = [];
  const minuteOf: number[] = [];
  let possession = 0;
  let side: TeamId = 0;
  let ball: Vec = [PITCH.length / 2, PITCH.width / 2];
  let holder = -1;
  let owed: Owed | null = null;
  let pending: Pending | null = null;
  let nextOwed = -1;
  /** The touch a pass's receiver was chosen for (T822). */
  let intended = -1;
  let minute = 0;
  /** Touches played before the minute being written. */
  let minuteStart = 0;
  let waitingIncidents: NonNullable<Beat['incidents']> = [];
  let eligibilityVersion = 0;
  const available = [0, 1].map(() => ({
    minute: -1,
    version: -1,
    rows: [] as number[],
    remaining: [] as number[],
  }));
  const awaitingEntry = (team: TeamId, line: number) =>
    waitingIncidents.some((x) => x.side === team && x.kind === 'sub' && x.other === line);

  const roles = settled.sides.map((s) => ({
    tactic: s.tactic,
    roles: Array.from({ length: 11 }, (_, slot) => s.lines.find((l) => l.slot === slot)!.role),
  })) as unknown as Parameters<typeof nominalSpot>[0]['sides'];
  const spotOf = (index: number, at: Vec = ball, team: TeamId = side): Vec => {
    const line = settled.sides[team].lines[index]!;
    const slot =
      settled.stints.find(
        (s) => s[0] === team && s[1] === index && s[3]! <= minute && s[4]! > minute,
      )?.[2] ?? line.slot;
    return nominalSpot({ sides: roles, ball: at, team, phase: phaseOf(team, at) }, team, slot);
  };
  const nearestBy = (team: TeamId, at: Vec, exclude: number[] = [], keeper = false): number => {
    let best = -1;
    for (const [index, p] of settled.sides[team].lines.entries()) {
      if (
        !present(settled, team, index, minute) ||
        awaitingEntry(team, index) ||
        exclude.includes(index) ||
        (p.slot === 0 && !keeper)
      )
        continue;
      const rank = (line: number) =>
        (turnsRemaining[minute]![team]![line]! > 0 ? 0 : FIT.restartPull * 100) +
        Math.round(dist(spotOf(line, at, team), at) * 100);
      if (best < 0 || rank(index) < rank(best)) best = index;
    }
    return best;
  };
  const keeperOf = (team: TeamId) => {
    const departing = settled.stints.find(
      (s) =>
        s[0] === team &&
        s[2] === 0 &&
        s[4] === minute &&
        waitingIncidents.some(
          (x) => x.side === team && x.line === s[1] && ['sub', 'injury'].includes(x.kind),
        ),
    );
    return (
      departing?.[1] ??
      settled.stints.find(
        (s) =>
          s[0] === team &&
          s[2] === 0 &&
          s[3]! <= minute &&
          s[4]! > minute &&
          !awaitingEntry(team, s[1]!),
      )?.[1] ??
      nearestBy(team, ball, [], true)
    );
  };
  const push = (
    b: Pick<Beat, 'side' | 'move' | 'kind' | 'actor' | 'from' | 'to' | 'outcome'> & Partial<Beat>,
  ): Beat => {
    const prev = beats[beats.length - 1];
    if (prev !== undefined && (prev.side !== b.side || b.kind === 'kickOff' || isRestart(b.kind)))
      possession++;
    const beat: Beat = {
      loft: false,
      through: false,
      header: false,
      hold: 0,
      clock: 0,
      period: scriptPeriod(minute),
      ...b,
      index: beats.length,
      possession,
      phase: isRestart(b.kind) ? 'setPiece' : phaseOf(b.side, b.from),
    };
    beats.push(beat);
    minuteOf.push(minute);
    return beat;
  };
  const shotRng = random(`${seed}:script:shot`);
  /**
   * Where a shot from `cell` outside the box is struck, the ball at `at` in it: no further from
   * the cell's goal-side edge than a seeded share of `NATURAL.shotDepth`, so a shooter outside the box
   * strikes from where real shots come (MATCH-23's distance rows), not from the cell's far side.
   */
  const shootingSpot = (cell: number, at: Vec): Vec => {
    const a = toAttack(side, at);
    const edge = BAND_EDGES[Math.floor(cell / 5) + 1]! - FIT.cellMargin;
    const x = Math.max(a[0], edge - shotRng() * NATURAL.shotDepth);
    return intoCell(side, cell, toAttack(side, [x, a[1]]));
  };
  /** Whether a shot struck from `cell` is one outside the box with the foot. */
  const outsideShot = (shot: number, cell: number) =>
    settled.shots[shot]![SH.header] !== 1 && Math.floor(cell / 5) < 6;
  /** A link carry by the holder to a point in `cell` of his side, when the ball is not there. */
  const linkTo = (cell: number) => {
    if (cellAt(side, ball) === cell) return;
    const wanted = ball;
    const to = intoCell(side, cell, [
      wanted[0] + (rng() - 0.5) * FIT.cellJitter,
      wanted[1] + (rng() - 0.5) * FIT.cellJitter,
    ]);
    push({
      side: side,
      move: 'link',
      kind: 'carry',
      actor: holder,
      from: ball,
      to,
      outcome: 'complete',
    });
    ball = to;
  };
  /** The holder's heavy touch: the ball runs to `to` of the other side. */
  const miscontrol = (to: number) => {
    const at = spotOf(to, ball, other(side));
    push({
      side: side,
      move: 'miscontrol',
      kind: 'carry',
      actor: holder,
      opponent: to,
      from: ball,
      to: at,
      outcome: 'loose',
    });
    side = other(side);
    holder = to;
    ball = at;
    pending = null;
  };
  // A touch that must follow another (a shot after its source pass) waits until that one is played.
  const after = touches.map(() => -1);
  touches.forEach((t, i) => {
    if (t.next !== undefined) after[t.next] = i;
  });
  /** A fixed delivery cannot start until its receiver and the rest of its shot/foul chain
   * have entered. Otherwise a stop between the pass and shot loses the recorded key passer. */
  const awaitingTouchEntry = (i: number): boolean => {
    const t = touches[i]!,
      team = t.side,
      r = t.release;
    if (awaitingEntry(team, t.actor)) return true;
    if (
      t.carries.some((id) => {
        const e = settled.events[id]!;
        return e[EV.other]! >= 0 && awaitingEntry(other(team), e[EV.other]!);
      })
    )
      return true;
    if (r && 'event' in r) {
      const e = settled.events[r.event]!;
      if (
        e[EV.other]! >= 0 &&
        awaitingEntry(e[EV.result] === R('offside') ? team : other(team), e[EV.other]!)
      )
        return true;
    }
    if (r && 'shot' in r && awaitingEntry(other(team), settled.shots[r.shot]![SH.keeper]!))
      return true;
    if (r && 'foul' in r && awaitingEntry(other(team), settled.fouls[r.foul]![FO.fouler]!))
      return true;
    return t.next !== undefined && awaitingTouchEntry(t.next);
  };
  /** Touches `team` may play now, in row-id order: this minute's fixed ones and every floating one. */
  const unplayed = (team: TeamId): readonly number[] => {
    const cached = available[team]!;
    if (cached.minute === minute && cached.version === eligibilityVersion) return cached.rows;
    const hasEntry = waitingIncidents.some((x) => x.kind === 'sub');
    const source = cached.minute === minute ? cached.remaining : minuteOrder[minute]![team]!;
    const remaining: number[] = [],
      rows: number[] = [];
    for (const i of source) {
      if (played[i]) continue;
      remaining.push(i);
      if ((!hasEntry || !awaitingTouchEntry(i)) && (after[i]! < 0 || played[after[i]!]))
        rows.push(i);
    }
    cached.remaining = remaining;
    cached.minute = minute;
    cached.version = eligibilityVersion;
    cached.rows = rows;
    return rows;
  };
  const fixedLeft = (team?: TeamId) =>
    team === undefined
      ? fixedRemaining[minute]![0]! + fixedRemaining[minute]![1]! > 0
      : fixedRemaining[minute]![team]! > 0;
  /** The touches played by the end of minute `m`: an even share of all of them. */
  const periodCounts = [0, 0];
  for (const t of touches) periodCounts[t.period]!++;
  const quotas = Array.from({ length: settled.length }, (_, m) =>
    m < 90
      ? Math.round(((m + 1) * periodCounts[0]!) / 90)
      : periodCounts[0]! + Math.round(((m - 89) * periodCounts[1]!) / 30),
  );
  const quota = (m: number) => quotas[m]!;
  const quotaMet = () => done[0]! + done[1]! >= quota(minute);
  /** Quota and pace terms are constant during one cheapest-touch search. */
  const costTerms = (team: TeamId) => {
    const met = quotaMet();
    const fill = Math.min(
      1,
      (done[0]! + done[1]! - minuteStart) / Math.max(1, quota(minute) - minuteStart),
    );
    const share = done[team]! / Math.max(1, total[team]!);
    const lead = share - done[other(team)]! / Math.max(1, total[other(team)]!);
    const endsLead = endsDone[team]! / Math.max(1, endsTotal[team]!) - share;
    return {
      time: minute + fill,
      fixed: met ? FIT.fixedPush * 100 : Math.round((FIT.fixedPull + fill * FIT.fixedRamp) * 100),
      pace: Math.round(
        Math.min(Math.max((lead - endsLead) / FIT.paceSlack, -1), 1) * FIT.paceBias * 100,
      ),
      push: met && fixedLeft(other(team)),
    };
  };
  /**
   * The price of `team` playing touch `i` with the ball in `cell`: the cell distance in centimetres,
   * less `fit.fixedPull` for a touch fixed to this minute; a touch ending the possession is cheaper
   * by up to `fit.paceBias` the further `team` is ahead of the other side in its share of touches
   * played (dearer when behind), and by `fit.fixedPush` once the minute's share is met while the
   * other side still has a fixed touch in it.
   */
  const touchCost = (
    team: TeamId,
    i: number,
    cell: number,
    terms: ReturnType<typeof costTerms>,
  ): number => {
    let cost = cellGap(startCell[i]!, cell) - spreadPull(i, terms.time);
    const back = releaseBack[i]!;
    if (back > 0) {
      // Driving forward to a touch that then goes backward reads as a run that turns round.
      const ahead = centreX(startCell[i]!) - centreX(cell);
      if (ahead > 0) cost += Math.round(NATURAL.reversal * Math.min(ahead, back) * 100);
      // In the attacking half the attack goes on first; the ball is recycled when it is spent.
      if (centreX(startCell[i]!) > PITCH.length / 2)
        cost += Math.round(NATURAL.backDelay * back * 100);
    }
    const release = touches[i]!.release;
    // Prefer the minute's existing dead ball for its incidents over opening a keeper stoppage.
    if (
      waitingIncidents.length &&
      release &&
      ('foul' in release ||
        'shot' in release ||
        ['offside', 'outTouch', 'outByline', 'cornerWon'].includes(
          EVENT_RESULTS[settled.events[release.event]![EV.result]!]!,
        ))
    )
      cost -= FIT.fixedPull * 100;
    const actor = touches[i]!.actor;
    if (actorLeft[team]![actor]! <= winsLeft[team]![actor]!) cost += FIT.winnerPull * 100;
    const by = winner[i]!;
    if (by >= 0 && actorLeft[other(team)]![by]! <= winsLeft[other(team)]![by]!)
      cost -= FIT.winnerPull * 100;
    // The pull grows as the minute fills, so its fixed touches come before its share runs out.
    if (touches[i]!.minute === minute) cost -= terms.fixed;
    // A corner's or free kick's delivery waits for its restart rather than be played in open play.
    if (touches[i]!.until === minute + 1) cost -= FIT.fixedPush * 100;
    if (setPiece[i]) cost += FIT.setPieceWait * 100;
    // A reserved delivery waits for its restart, but not past its window's last minute: a minute
    // is held open until such a touch is played, so waiting there writes a burst of the minute's
    // other touches instead (T840: up to 328 beats in two minutes).
    if (
      release &&
      'event' in release &&
      reserve.has(release.event) &&
      demand[team]![startCell[i]!]! > 0 &&
      touches[i]!.until !== minute + 1
    )
      cost += FIT.restartPull * 100;
    if (ends[i]) {
      // Ahead of the other side, or behind in spending its own possession-ending touches, a side
      // ends its possession sooner; so neither side runs out of touches, nor of ways to lose the ball.
      cost -= terms.pace;
      if (terms.push) cost -= FIT.fixedPush * 100;
    }
    return cost;
  };
  /** A touch whose release is a goal the record credits to no passer. */
  const unassisted = (i: number): boolean => {
    const r = touches[i]!.release;
    if (r === undefined || !('shot' in r)) return false;
    const s = settled.shots[r.shot]!;
    return SHOT_OUTCOMES[s[SH.outcome]!] === 'goal' && s[SH.passer]! < 0;
  };
  /** The holder has the ball from a recorded completed pass, his own carries since (as count.ts reads an assist). */
  const fed = (): boolean => {
    for (let k = beats.length - 1; k >= 0; k--) {
      const b = beats[k]!;
      if (b.side !== side) return false;
      if (b.actor === holder && (b.kind === 'carry' || b.kind === 'takeOn')) continue;
      return (
        b.event !== undefined &&
        isPassLike(b.kind) &&
        b.outcome === 'complete' &&
        b.receiver === holder
      );
    }
    return false;
  };
  /**
   * The touch `team` plays next with the ball in `cell`, skipping `skip`'s while another is left.
   * For a pass landing at `at`, a touch also costs `fit.placeWeight` times the metres from its
   * player's place (`nominalSpot`) to `at`: the man the pass is played to stands near it (T822).
   */
  const choose = (team: TeamId, cell: number, skip = -1, at?: Vec): number => {
    const all = unplayed(team);
    if (nextOwed >= 0 && all.includes(nextOwed)) return nextOwed;
    const fresh = all.filter((i) => !(skip >= 0 && unassisted(i)));
    const left = fresh.length > 0 ? fresh : all;
    const open = left.filter((i) => touches[i]!.actor !== skip);
    const pool = open.length > 0 ? open : left;
    const place = new Map<number, number>();
    if (at !== undefined)
      for (const [index] of settled.sides[team].lines.entries())
        place.set(index, Math.round(FIT.placeWeight * dist(spotOf(index, at, team), at) * 100));
    return cheapest(team, pool, cell, place);
  };
  const cheapest = (
    team: TeamId,
    pool: readonly number[],
    cell: number,
    place?: ReadonlyMap<number, number>,
  ): number => {
    let best = -1;
    let bestCost = Infinity;
    const terms = costTerms(team);
    let minPlace = 0;
    let exact =
      indexedCosts &&
      Number.isSafeInteger(terms.fixed) &&
      Number.isSafeInteger(terms.pace) &&
      Math.abs(terms.fixed) < precisionBudget &&
      Math.abs(terms.pace) < precisionBudget;
    for (const value of place?.values() ?? []) {
      exact &&= Number.isSafeInteger(value) && Math.abs(value) < precisionBudget;
      minPlace = Math.min(minPlace, value);
    }
    // Small pools are cheaper to scan than to mark and traverse the cell index.
    if (exact && pool.length > MIN_INDEXED_POOL) {
      const common =
        minPlace +
        -spreadCap +
        Math.min(0, waitingIncidents.length ? -FIT.fixedPull * 100 : 0) +
        Math.min(0, FIT.winnerPull * 100) +
        Math.min(0, FIT.setPieceWait * 100) +
        Math.min(0, FIT.restartPull * 100);
      const bounds = [0, 1, 2, 3].map(
        (group) =>
          common +
          (group & 2 ? Math.min(0, -FIT.winnerPull * 100) : 0) +
          (group & 1
            ? Math.min(0, -terms.pace) + (terms.push ? Math.min(0, -FIT.fixedPush * 100) : 0)
            : 0),
      );
      return search.pick(
        team,
        pool,
        Math.max(0, cell),
        bounds,
        (i) => touchCost(team, i, cell, terms) + (place?.get(touches[i]!.actor) ?? 0),
        (i) => touches[i]!.minute !== FLOATING || touches[i]!.until === minute + 1,
      );
    }
    for (const i of pool) {
      const cost = touchCost(team, i, cell, terms) + (place?.get(touches[i]!.actor) ?? 0);
      if (cost < bestCost) [best, bestCost] = [i, cost];
    }
    return best;
  };

  /** Writes a pending pass to `receiver`, who then has the ball in its `to` cell. */
  const resolve = (receiver: number, next = -1) => {
    const p = pending!;
    pending = null;
    const e = settled.events[p.event]!;
    // Played to the touch he was chosen for, the ball meets him on the side of the recorded cell
    // nearest where that touch starts, so the carry linking them is as short as the cells allow.
    const spot = spotOf(receiver, p.from, p.side);
    // A first-time shot off the pass from outside the box is struck where the pass finds him: on
    // the goal side of its cell.
    const shot = next >= 0 ? touches[next]!.release : undefined;
    const toward =
      shot !== undefined &&
      'shot' in shot &&
      !touches[next]!.carries.length &&
      outsideShot(shot.shot, e[EV.to]!)
        ? shootingSpot(e[EV.to]!, intoCell(p.side, e[EV.to]!, spot))
        : next >= 0 && startCell[next]! >= 0
          ? intoCell(p.side, startCell[next]!, spot)
          : spot;
    const to = pointAway(p.side, e[EV.to]!, toward, p.from, GRAMMAR.minPass);
    push({
      side: p.side,
      move: KIND(e[EV.kind]!),
      kind: p.kind,
      actor: p.actor,
      receiver,
      from: p.from,
      to,
      outcome: p.outcome,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      reason: passReason(p.side, e[EV.kind]!, p.kind, p.actor, p.from, to),
      event: p.event,
      lineBreaking: e[EV.lineBreaking] === 1,
      creditedOpponent: e[EV.other]! >= 0,
      setPiece: SET_PIECES[e[EV.setPiece]!]!,
      outKind:
        e[EV.result] === R('outTouch')
          ? ('outTouch' as const)
          : e[EV.result] === R('outByline')
            ? ('outByline' as const)
            : e[EV.result] === R('cornerWon')
              ? ('cornerWon' as const)
              : undefined,
    });
    side = p.side;
    holder = receiver;
    ball = to;
  };
  const isLofted = (k: number) => KIND(k) === 'long' || KIND(k) === 'cross';
  /**
   * Why an open-play pass goes back, a staging cue (→MATCH-39): the record's cut-back; a ball
   * returned first time to the man whose forward pass reached him is a lay-off; otherwise, in the
   * other half a man who kept it is closed down (`pressed`: the staging brings the presser to him
   * before the kick) and in his own half he resets the attack.
   */
  const passReason = (
    team: TeamId,
    move: number,
    kind: BeatKind,
    actor: number,
    from: Vec,
    to: Vec,
  ): Beat['reason'] => {
    if (KIND(move) === 'cutBack') return 'cutBack';
    const fx = toAttack(team, from)[0];
    if (kind !== 'pass' || toAttack(team, to)[0] > fx - NATURAL.backPass) return undefined;
    const last = beats.at(-1);
    if (
      last !== undefined &&
      last.side === team &&
      isPassLike(last.kind) &&
      last.outcome === 'complete' &&
      last.receiver === actor &&
      toAttack(team, last.to)[0] > toAttack(team, last.from)[0]
    )
      return 'layoff';
    return fx >= PITCH.length / 2 ? 'pressed' : 'reset';
  };

  /** Plays a pass event from the ball's point, `kind` the restart it delivers or `pass`. */
  const playPass = (id: number, kind: BeatKind) => {
    const e = settled.events[id]!;
    const actor = e[EV.actor]!;
    const res = e[EV.result]!;
    const toCell = e[EV.to]!;
    const base = {
      side: side,
      move: KIND(e[EV.kind]!),
      kind,
      actor,
      from: ball,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      reason: KIND(e[EV.kind]!) === 'cutBack' ? ('cutBack' as const) : undefined,
      event: id,
      lineBreaking: e[EV.lineBreaking] === 1,
      creditedOpponent: e[EV.other]! >= 0,
      setPiece: SET_PIECES[e[EV.setPiece]!]!,
      outKind:
        e[EV.result] === R('outTouch')
          ? ('outTouch' as const)
          : e[EV.result] === R('outByline')
            ? ('outByline' as const)
            : e[EV.result] === R('cornerWon')
              ? ('cornerWon' as const)
              : undefined,
    };
    if (res === R('complete') || res === R('looseKept')) {
      pending = {
        event: id,
        actor,
        side,
        from: ball,
        kind,
        outcome: res === R('complete') ? 'complete' : 'loose',
        minute,
      };
      ball = intoCell(side, toCell, cellCentre(side, toCell));
      holder = -1;
      return actor;
    }
    const to = intoCell(side, toCell, spotOf(actor));
    if (res === R('intercepted') || res === R('looseRecovered') || res === R('tackled')) {
      const at = res === R('tackled') ? ball : to;
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), at);
      push({
        ...base,
        to,
        reason: passReason(side, e[EV.kind]!, kind, actor, ball, to),
        opponent: by,
        outcome:
          res === R('intercepted') ? 'intercepted' : res === R('tackled') ? 'tackled' : 'loose',
      });
      side = other(side);
      holder = by;
      ball = at;
      return actor;
    }
    if (res === R('offside')) {
      push({ ...base, to, receiver: e[EV.other]!, through: true, outcome: 'offside' });
      owed = {
        kind: 'freeKick',
        side: other(side),
        spot: restartSpot('freeKick', other(side), to),
      };
    } else {
      push({
        ...base,
        to,
        reason: passReason(side, e[EV.kind]!, kind, actor, ball, to),
        outcome: 'out',
      });
      owed =
        res === R('outTouch')
          ? { kind: 'throwIn', side: other(side), spot: restartSpot('throwIn', other(side), to) }
          : res === R('outByline')
            ? {
                kind: 'goalKick',
                side: other(side),
                spot: restartSpot('goalKick', other(side), to),
              }
            : { kind: 'corner', side: side, spot: restartSpot('corner', side, to) };
    }
    holder = -1;
    return actor;
  };

  const playShot = (id: number, kind: BeatKind) => {
    const s = settled.shots[id]!;
    const out = SHOT_OUTCOMES[s[SH.outcome]!]!;
    const keeper = s[SH.keeper]!;
    const shooter = s[SH.shooter]!;
    const from = ball;
    const to =
      out === 'save'
        ? keeperHold(other(side))
        : out === 'block'
          ? from
          : goalAim(
              side,
              out === 'miss' ? (toAttack(side, from)[1] < PITCH.width / 2 ? -5 : 5) : 0,
            );
    const opponent =
      out === 'save' ? keeper : out === 'block' ? nearestBy(other(side), from) : undefined;
    const outcome: BeatOutcome =
      out === 'goal' ? 'goal' : out === 'save' ? 'saved' : out === 'block' ? 'blocked' : 'wide';
    push({
      side: side,
      move: kind === 'freeKick' ? 'freeKick' : 'shot',
      kind,
      actor: shooter,
      opponent,
      from,
      to,
      outcome,
      header: s[SH.header] === 1,
      shot: id,
      xg: s[SH.xg]!,
      shotKind: ['open', 'corner', 'freeKick', 'penalty'][s[SH.kind]!] as Beat['shotKind'],
      source: s[SH.source]!,
      keyPass: s[SH.passer]! < 0 ? -1 : s[SH.source]!,
      keeper,
      corner: s[SH.corner] === 1,
    });
    const corner = s[SH.corner] === 1;
    if (out === 'goal')
      owed = {
        kind: 'kickOff',
        side: other(side),
        spot: restartSpot('kickOff', other(side), from),
      };
    else if (corner) owed = { kind: 'corner', side: side, spot: restartSpot('corner', side, from) };
    else if (out === 'miss')
      owed = {
        kind: 'goalKick',
        side: other(side),
        spot: restartSpot('goalKick', other(side), from),
      };
    else {
      side = other(side);
      holder = opponent!;
      ball = to;
      return;
    }
    holder = -1;
  };

  /** Plays touch `i` by its actor, who has the ball. */
  const playTouch = (i: number, delivering?: Owed) => {
    played[i] = true;
    if (spreadGroup[i]! >= 0) spreadPlayed[spreadGroup[i]!]!++;
    eligibilityVersion++;
    const t = touches[i]!;
    for (let m = Math.max(minute, t.from); m < Math.min(settled.length, t.until); m++)
      if (t.period === periodOf(m) && (t.minute === FLOATING || t.minute === m))
        turnsRemaining[m]![t.side]![t.actor]!--;
    if (t.minute >= 0) fixedRemaining[t.minute]![t.side]!--;
    const last = t.until - 1;
    if (last >= 0 && last < settled.length && t.period === periodOf(last)) expiring[last]!--;
    actorLeft[t.side]![t.actor]!--;
    if (winner[i]! >= 0) winsLeft[other(t.side)]![winner[i]!]!--;
    done[t.side]!++;
    if (ends[i]) endsDone[t.side]!++;
    nextOwed = t.next ?? -1;
    // Where the touch's next action starts: the next carry's cell, else its release's.
    const r0 = t.release;
    const releaseCell =
      r0 === undefined
        ? -1
        : 'event' in r0
          ? settled.events[r0.event]![EV.from]!
          : 'shot' in r0
            ? settled.shots[r0.shot]![SH.cell]!
            : settled.fouls[r0.foul]![FO.cell]!;
    let across = 0;
    for (const [k, c] of t.carries.entries()) {
      const e = settled.events[c]!;
      linkTo(e[EV.from]!);
      const next =
        k + 1 < t.carries.length ? settled.events[t.carries[k + 1]!]![EV.from]! : releaseCell;
      // Where the next action starts elsewhere, the carry ends as near it as its cell allows, so the
      // carry linking them is short and he does not carry the ball away only to bring it back.
      const ahead = next >= 0 && next !== e[EV.to] ? intoCell(side, next, ball) : undefined;
      let to = intoCell(side, e[EV.to]!, ahead ?? spotOf(holder));
      // A carry inside one cell still carries the ball, never on the spot it starts: toward that
      // next action, else (no next action elsewhere) on up the pitch, else across the cell, one
      // way for the whole touch. With the next action behind him and no room toward it he goes
      // across, never up the pitch only to come back.
      if (e[EV.from] === e[EV.to]) {
        const a = toAttack(side, ball);
        const step = NATURAL.cellCarry;
        const within = (p: Vec) => intoCell(side, e[EV.to]!, p);
        const moved = (p: Vec) => dist(p, ball) >= step / 2;
        to = ball;
        if (ahead && dist(ahead, ball) > 0) {
          const k = step / dist(ahead, ball);
          to = within([ball[0] + (ahead[0] - ball[0]) * k, ball[1] + (ahead[1] - ball[1]) * k]);
        } else to = within(toAttack(side, [a[0] + step, a[1]]));
        if (!moved(to)) {
          if (across === 0) {
            const centre = toAttack(side, cellCentre(side, e[EV.to]!))[1];
            across = a[1] <= centre ? 1 : -1;
          }
          const lead = ahead ? 0 : step / 2;
          const aside = () => within(toAttack(side, [a[0] + lead, a[1] + across * step]));
          to = aside();
          if (!moved(to)) {
            across = -across;
            to = aside();
          }
        }
      }
      const takeOn = KIND(e[EV.kind]!) === 'takeOn';
      if (e[EV.result] === R('complete')) {
        push({
          side: side,
          move: KIND(e[EV.kind]!),
          kind: takeOn ? 'takeOn' : 'carry',
          actor: holder,
          opponent: takeOn ? nearestBy(other(side), ball) : undefined,
          from: ball,
          to,
          outcome: 'complete',
          event: c,
          creditedOpponent: e[EV.other]! >= 0,
          setPiece: SET_PIECES[e[EV.setPiece]!]!,
        });
        ball = to;
        continue;
      }
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), ball);
      push({
        side: side,
        move: KIND(e[EV.kind]!),
        kind: takeOn ? 'takeOn' : 'carry',
        actor: holder,
        opponent: by,
        from: ball,
        to,
        outcome: 'tackled',
        event: c,
        creditedOpponent: e[EV.other]! >= 0,
        setPiece: SET_PIECES[e[EV.setPiece]!]!,
      });
      side = other(side);
      holder = by;
      return;
    }
    const r = t.release;
    if (r === undefined) return;
    if ('event' in r) {
      if (delivering === undefined) linkTo(settled.events[r.event]![EV.from]!);
      playPass(r.event, delivering?.kind ?? 'pass');
    } else if ('shot' in r) {
      if (delivering === undefined) {
        const cell = settled.shots[r.shot]![SH.cell]!;
        linkTo(cell);
        // From outside the box he steps into his shot: struck from the cell's goal side.
        if (outsideShot(r.shot, cell)) {
          const at = shootingSpot(cell, ball);
          if (dist(at, ball) > 0.5) {
            push({
              side,
              move: 'link',
              kind: 'carry',
              actor: holder,
              from: ball,
              to: at,
              outcome: 'complete',
            });
            ball = at;
          }
        }
      }
      playShot(r.shot, delivering?.kind ?? 'shot');
    } else {
      const f = settled.fouls[r.foul]!;
      linkTo(f[FO.cell]!);
      push({
        side: side,
        move: 'foul',
        kind: 'carry',
        actor: holder,
        opponent: f[FO.fouler]!,
        from: ball,
        to: ball,
        outcome: 'foul',
        foul: r.foul,
        ...(cards.has(r.foul) && {
          incidents: [beatIncident(settled.incidents[cards.get(r.foul)!]!)],
        }),
      });
      owed = {
        kind: f[FO.penalty] ? 'penalty' : 'freeKick',
        side: side,
        spot: restartSpot(f[FO.penalty] ? 'penalty' : 'freeKick', side, ball),
        via: t.next,
      };
      nextOwed = -1;
      holder = -1;
    }
  };

  /** A minute's standalone incidents wait for a dead ball; keeper possession supplies one
   * when the minute contains none. The owed restart survives this non-playing beat. */
  const stopFor = (incidents: NonNullable<Beat['incidents']>) => {
    if (!owed && holder !== keeperOf(side)) miscontrol(keeperOf(other(side)));
    const team = owed?.side ?? side;
    const at = owed?.spot ?? ball;
    const actor = owed ? nearestBy(team, at, [], true) : holder;
    push({
      side: team,
      move: 'incident',
      kind: 'stoppage',
      actor,
      from: at,
      to: at,
      outcome: 'complete',
      incidents,
    });
  };
  const finishIncidents = () => {
    // A booked departing fouler must finish his fixed foul before his side's substitutions.
    // Other sides can still enter at this stop, including a man that foul needs as its victim.
    const waitingSides = new Set<TeamId>();
    for (const x of waitingIncidents) {
      if (x.kind !== 'sub' && x.kind !== 'injury') continue;
      if (
        touches.some((t, i) => {
          const r = t.release;
          if (played[i] || t.minute !== minute || !r || !('foul' in r) || !cards.has(r.foul))
            return false;
          const f = settled.fouls[r.foul]!;
          return 1 - f[FO.fouledSide]! === x.side && f[FO.fouler] === x.line;
        })
      )
        waitingSides.add(x.side);
    }
    const incidents = waitingIncidents.filter((x) => !waitingSides.has(x.side));
    if (!incidents.length) return;
    if (pending) resolve(nearestBy(pending.side, ball, [pending.actor]));
    const last = beats.at(-1);
    if (owed && minuteOf.at(-1) === minute && last) {
      last.incidents = [...(last.incidents ?? []), ...incidents].sort(
        (a, b) => incidentIndex(settled, minute + 1, a) - incidentIndex(settled, minute + 1, b),
      );
    } else stopFor(incidents);
    waitingIncidents = waitingIncidents.filter((x) => waitingSides.has(x.side));
    eligibilityVersion++;
    if (!owed && holder >= 0 && !present(settled, side, holder, minute)) {
      // A dead ball in the departing keeper's hands belongs to his recorded successor.
      holder = keeperOf(side);
      beats.at(-1)!.receiver = holder;
    }
  };

  /** Delivers the owed restart: by a recorded pass from its spot when one is left, else connectively. */
  const deliver = () => {
    const o = owed!;
    owed = null;
    side = o.side;
    ball = o.spot;
    if (o.kind === 'corner')
      for (const c of [35, 39]) demand[side]![c] = Math.max(0, demand[side]![c]! - 1);
    else {
      const bucket = cellAt(side, ball);
      demand[side]![bucket] = Math.max(0, demand[side]![bucket]! - 1);
    }
    if (o.via !== undefined && !played[o.via] && touches[o.via]!.minute === minute) {
      holder = touches[o.via]!.actor;
      playTouch(o.via, o);
      return;
    }
    if (o.kind === 'corner') {
      const deliveries = unplayed(side).filter((i) => {
        const t = touches[i]!,
          r = t.release;
        return (
          !t.carries.length &&
          r &&
          'event' in r &&
          [35, 39].includes(settled.events[r.event]![EV.from]!)
        );
      });
      const i =
        deliveries.find(
          (i) =>
            SET_PIECES[
              settled.events[(touches[i]!.release as { event: number }).event]![EV.setPiece]!
            ] === 'corner',
        ) ?? deliveries[0];
      if (i !== undefined) {
        const cell = settled.events[(touches[i]!.release as { event: number }).event]![EV.from]!;
        ball = restartSpot('corner', side, cellCentre(side, cell));
      }
    }
    const spotCell = cellAt(side, ball);
    const want = o.kind === 'corner' ? 'corner' : o.kind === 'freeKick' ? 'freeKick' : 'none';
    let best = -1;
    let bestScore = Infinity;
    for (const i of unplayed(side)) {
      const t = touches[i]!;
      if (t.carries.length > 0 || t.release === undefined || !('event' in t.release)) continue;
      const e = settled.events[t.release.event]!;
      if (e[EV.from] !== spotCell) continue;
      const score =
        (SET_PIECES[e[EV.setPiece]!] === want ? 0 : 100000) + cellDistance(e[EV.from]!, spotCell);
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    if (best >= 0) {
      holder = touches[best]!.actor;
      playTouch(best, o);
      return;
    }
    // A goal kick is the keeper's, so the touch it is delivered to is another man's (T822: s09's
    // keeper kicked to himself when his own touch started nearest).
    const nextTouch = choose(side, spotCell, o.kind === 'goalKick' ? keeperOf(side) : -1);
    const taker =
      o.kind === 'goalKick'
        ? keeperOf(side)
        : nearestBy(side, ball, nextTouch >= 0 ? [touches[nextTouch]!.actor] : []);
    const receiver =
      nextTouch >= 0 && touches[nextTouch]!.actor !== taker
        ? touches[nextTouch]!.actor
        : nearestBy(side, ball, [taker]);
    const cell =
      nextTouch >= 0 ? firstCell(settled, touches[nextTouch]!) : cellAt(side, spotOf(receiver));
    const to = pointAway(side, cell, spotOf(receiver), ball, GRAMMAR.minPass);
    push({
      side: side,
      move: 'restart',
      kind: o.kind,
      actor: taker,
      receiver,
      from: ball,
      to,
      outcome: 'complete',
    });
    holder = receiver;
    ball = to;
  };

  const settledMinute = () => {
    // Corrupt/incompatible chains cannot make a partial writer spin forever.
    for (let steps = 0; steps < (touches.length + 1) * FIT.maxStepsPerTouch; steps++) {
      if (waitingIncidents.length && (owed || (pending === null && holder === keeperOf(side)))) {
        finishIncidents();
      }
      // The minute ends with its share of touches played and nothing fixed to it left.
      if (
        quotaMet() &&
        done[0]! + done[1]! > minuteStart &&
        !fixedLeft() &&
        expiring[minute] === 0
      ) {
        if (waitingIncidents.length) finishIncidents();
        break;
      }
      const mine = unplayed(side);
      const theirs = unplayed(other(side));
      if (owed !== null) {
        // With nothing left in the minute the restart waits for the next one.
        if (mine.length + theirs.length === 0) break;
        deliver();
        continue;
      }
      if (pending !== null) {
        const p: Pending = pending;
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
        if (i >= 0 && touches[i]!.actor !== p.actor) {
          resolve(touches[i]!.actor, i);
          // He was chosen for that touch: it is the one he plays.
          intended = i;
          continue;
        }
        if (i < 0 && theirs.length === 0) {
          // What is left may wait for an entrant: the ball comes in and play stops for him.
          const waiting = waitingIncidents.length;
          if (waiting) finishIncidents();
          if (waitingIncidents.length < waiting) continue;
          break;
        }
        // Nobody else of his side is left: a nominal receiver loses it.
        resolve(nearestBy(p.side, ball, [p.actor]));
        continue;
      }
      if (mine.length + theirs.length === 0) {
        if (waitingIncidents.length) {
          finishIncidents();
          continue;
        }
        break;
      }
      if (mine.length === 0) {
        miscontrol(touches[choose(other(side), cellAt(other(side), ball))]!.actor);
        continue;
      }
      // Yield to the other side's fixed touch only after this side has played its own. Otherwise
      // two sides with possession-preserving fixed touches can yield forever without playing one.
      if (quotaMet() && !fixedLeft(side) && fixedLeft(other(side))) {
        const waiting = theirs.filter((i) => touches[i]!.minute === minute);
        const lone = waiting.find((i) => unassisted(i));
        if (waiting.length > 0 && (lone !== undefined || !mine.some((i) => ends[i]))) {
          miscontrol(
            touches[lone ?? cheapest(other(side), waiting, cellAt(other(side), ball))]!.actor,
          );
          continue;
        }
      }
      // The holder plays on with a touch of his own; another man's touch needs the ball first.
      const here = cellAt(side, ball);
      const own = mine.filter((i) => touches[i]!.actor === holder);
      const pickOwn =
        nextOwed >= 0 && mine.includes(nextOwed)
          ? nextOwed
          : own.includes(intended)
            ? intended
            : own.length > 0
              ? cheapest(side, own, here)
              : choose(side, here);
      intended = -1;
      // Possessions alternate, so a side that has fewer possession-ending rows than the other must
      // lose the ball connectively that many times: it does so where it is spending its ending
      // rows faster than the other side spends its own, never on a touch fixed to the minute (T822).
      const endsShare = (t: TeamId) => endsDone[t]! / Math.max(1, endsTotal[t]!);
      const spread =
        ends[pickOwn] &&
        touches[pickOwn]!.minute === FLOATING &&
        touches[pickOwn]!.actor === holder &&
        endsShare(side) - endsShare(other(side)) > FIT.endsSlack &&
        theirs.length > 0;
      // A goal the record credits to nobody's pass is not scored straight off a pass to the scorer.
      if (spread || touches[pickOwn]!.actor !== holder || (unassisted(pickOwn) && fed())) {
        const them =
          theirs.length > 0
            ? touches[choose(other(side), cellAt(other(side), ball))]!.actor
            : nearestBy(other(side), ball);
        miscontrol(them);
        continue;
      }
      playTouch(pickOwn);
    }
  };

  for (minute = 0; minute < settled.length; minute++) {
    minuteStart = done[0]! + done[1]!;
    waitingIncidents = settled.incidents.flatMap((row, i) =>
      row[IN.minute] === minute + 1 && !booked.has(i) ? [beatIncident(row)] : [],
    );
    if (minute === 0 || minute === 45 || minute === 90 || minute === 105) {
      const incidents = waitingIncidents;
      waitingIncidents = [];
      pending = null;
      owed = {
        kind: 'kickOff',
        side: minute === 0 || minute === 90 ? 0 : 1,
        spot: restartSpot('kickOff', 0, ball),
      };
      // A half starts on its minute, whether or not the minute holds a touch.
      deliver();
      // Even an empty opening minute contains its kick-off, including a recorded delivery.
      if (pending !== null) {
        const p: Pending = pending;
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
        const receiver =
          i >= 0 && touches[i]!.actor !== p.actor
            ? touches[i]!.actor
            : nearestBy(p.side, ball, [p.actor]);
        resolve(receiver);
        if (i >= 0 && receiver === touches[i]!.actor) intended = i;
      }
      // A recorded completed delivery creates its beat only once the receiver is known.
      if (incidents.length) beats[minuteOf.indexOf(minute)]!.incidents = incidents;
    }
    settledMinute();
    // A recorded delivery is received in the minute it was played; a departing holder leaves
    // the ball to a still-present opponent before his stint ends, never after it.
    if (pending !== null) {
      const p: Pending = pending;
      resolve(nearestBy(p.side, ball, [p.actor]));
    }
    // A minute left with a pass in flight still stops for its incidents once the pass is in;
    // the next minute's incidents replace whatever waits, so none may be carried over (T840).
    if (waitingIncidents.length) finishIncidents();
    if (
      minute + 1 < settled.length &&
      ![44, 89, 104, 119].includes(minute) &&
      holder >= 0 &&
      !present(settled, side, holder, minute + 1)
    ) {
      const team = other(side);
      const leaving = settled.sides[team].lines.flatMap((_, i) =>
        present(settled, team, i, minute + 1) ? [] : [i],
      );
      const receiver = nearestBy(team, ball, leaving, true);
      if (receiver >= 0) miscontrol(receiver);
    }
    if (minute === 44 || minute === 89 || minute === 104 || minute === 119) {
      // A restart owed at the whistle is still taken, and a pass in flight, its delivery's
      // included, is received before the half ends.
      while (owed !== null && (owed as Owed).kind !== 'kickOff') deliver();
      if (pending !== null)
        resolve(nearestBy((pending as Pending).side, ball, [(pending as Pending).actor]));
      owed = null;
      nextOwed = -1;
    }
  }

  // A minute whose beats need more than its sixty seconds is pressed into them, every part alike,
  // so each beat keeps its record minute; `minuteTimes` gives what each minute needed.
  for (let m = 0; m < settled.length; m++) {
    const list = beats.filter((_, i) => minuteOf[i] === m);
    if (list.length === 0) continue;
    const { holds, need } = minuteTimes(list, m);
    const press = need > 60 ? 60 / need : 1;
    let t = m * 60;
    for (const [k, b] of list.entries()) {
      t += deadOf(b, k, m) * press;
      b.hold = Math.floor(holds[k]! * press * 100) / 100;
      b.clock = Math.floor(t * 100) / 100;
      t += (holds[k]! + travel(b)) * press;
    }
  }
  const shootoutRng = random(`${seed}:script:shootout`);
  for (const [i, kick] of settled.shootout.entries()) {
    const team = kick[0] as TeamId;
    const from = restartSpot('penalty', team, ball);
    const scored = kick[2] === 1;
    const saved = !scored && shootoutRng() < FIT.shootout.saved;
    const keeper = settled.stints.find(
      (s) => s[0] === other(team) && s[2] === 0 && s[4] === settled.length,
    )?.[1];
    beats.push({
      index: beats.length,
      possession: ++possession,
      side: team,
      phase: 'setPiece',
      move: 'shootout',
      kind: 'shootoutKick',
      actor: kick[1]!,
      opponent: saved ? keeper : undefined,
      from,
      to: saved ? keeperHold(other(team)) : goalAim(team, scored ? 0 : 5),
      loft: false,
      through: false,
      header: false,
      hold: FIT.hold[1],
      outcome: scored ? 'goal' : saved ? 'saved' : 'wide',
      period: 5,
      clock: settled.length * 60 + i * FIT.shootout.seconds,
    });
  }
  return { version: 1, seed, beats, bound: true };
}
