/**
 * The aggregate path's legal participation (→MATCH-19, MATCH-20, MATCH-21, MATCH-27, CLUB-23): one
 * timeline of starters, injuries, cards, dismissals and the manager's substitutions under the
 * era's limits, planned before the team facts so that availability and strength follow it. It
 * also holds the timeline helpers the player attribution and the result adapter share, so league
 * and cup fixtures take one code path.
 */
import type { Incident } from '../../../contracts/src/types';
import type { Line } from '../../../contracts/src/player';
import { CHANGES_CONFIG, inMatchFatigue } from '../grid/changes';
import { INTERVAL_STAMPS } from '../match-model';
import type { EraRules } from '../grid/setup';
import { AGGREGATE_CONFIG, AGGREGATE_PARTICIPATION_CONFIG as PC } from './config';
import { participationIssues } from './input';
import type {
  AggregateInput,
  AggregateLength,
  AggregateParticipation,
  AggregatePeriod,
  AggregatePlan,
  AggregateRebalance,
  AggregateRebalanceDecisions,
  AggregateSide,
  AggregateSidePlan,
  AggregateStint,
  AggregateStreamFamily,
  AggregateStreams,
  AggregateTeamFacts,
} from './types';

type Rng = () => number;

/**
 * One side's own sequence of a stream family, so the two sides never copy each other's draws and
 * neither moves when the other draws more (→ARCH-5). The side sits right after the family
 * (`…:aggregate:<family>:side<n>[:<period>]:<fixture>`): the seed hash leaves names that differ
 * only in their last characters correlated, so the period and fixture still follow it.
 */
export function sideDraw(
  streams: AggregateStreams,
  family: AggregateStreamFamily,
  side: AggregateSide,
  period?: AggregatePeriod,
): Rng {
  // `names` only interpolates the family, so the side rides on it into the middle of the name.
  return streams.draw(`${family}:side${side}` as AggregateStreamFamily, period);
}

// Grouped draws, as the kernel draws them: each costs about its result.
export function normalDraw(r: Rng) {
  const u = Math.max(1e-12, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function poissonDraw(r: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normalDraw(r)));
  const u = r();
  let k = 0,
    p = Math.exp(-mean),
    cdf = p;
  while (u > cdf && k < 200) {
    k++;
    p *= mean / k;
    cdf += p;
  }
  return k;
}
export function binomialDraw(r: Rng, n: number, p: number): number {
  if (n <= 0 || !(p > 0)) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomialDraw(r, n, 1 - p);
  const mean = n * p;
  if (mean > 15) {
    const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * normalDraw(r));
    return Math.min(n, Math.max(0, k));
  }
  const ratio = p / (1 - p),
    u = r();
  let k = 0,
    pk = (1 - p) ** n,
    cdf = pk;
  while (u > cdf && k < n) {
    pk *= ((n - k) / (k + 1)) * ratio;
    k++;
    cdf += pk;
  }
  return k;
}
/**
 * Splits `n` over `weights` exactly, all of it when any weight is positive: unit by unit when
 * there are fewer units than weights, otherwise by sequential binomials.
 */
export function multinomialDraw(r: Rng, n: number, weights: ArrayLike<number>): number[] {
  return multinomialInto(r, n, weights, Array<number>(weights.length).fill(0));
}
/**
 * `multinomialDraw` into a caller's buffer of the weights' length, zeroed first: the same draws,
 * without a new array for each split (T326).
 */
export function multinomialInto(
  r: Rng,
  n: number,
  weights: ArrayLike<number>,
  out: number[],
): number[] {
  let rest = 0,
    positive = 0,
    last = -1;
  for (let i = 0; i < weights.length; i++) {
    out[i] = 0;
    if (weights[i]! > 0) {
      rest += weights[i]!;
      positive++;
      last = i;
    }
  }
  if (n <= 0 || last < 0) return out;
  if (n <= positive) {
    for (let k = 0; k < n; k++) {
      let u = r() * rest,
        chosen = last;
      for (let i = 0; i < last; i++) {
        const w = weights[i]!;
        if (w > 0 && (u -= w) < 0) {
          chosen = i;
          break;
        }
      }
      out[chosen]!++;
    }
    return out;
  }
  let left = n;
  for (let i = 0; i <= last && left > 0; i++) {
    const w = weights[i]!;
    if (!(w > 0)) continue;
    const k = i === last || w >= rest ? left : binomialDraw(r, left, w / rest);
    out[i] = k;
    left -= k;
    rest -= w;
  }
  return out;
}
/** An index drawn by weight, or -1 when no weight is positive. */
export function weightedIndex(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (!(total > 0)) return -1;
  let u = r() * total,
    chosen = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (!(w > 0)) continue;
    chosen = i;
    if ((u -= w) < 0) break;
  }
  return chosen;
}

/**
 * Whether a line plays in match minute `minute` (the stretch `(minute − 1, minute]`), and in which
 * slot: an incident stamped `m` ends the leaving player's stint at `m − 1` and starts the
 * incoming one's there, so both are present when that minute's incidents happen.
 */
export function slotAt(
  participation: AggregateParticipation,
  side: AggregateSide,
  line: number,
  minute: number,
): number | undefined {
  let slot: number | undefined;
  for (const s of participation.stints[side])
    if (s.line === line && s.from < minute && s.to >= minute) slot = s.slot;
  return slot;
}
export const onPitchAt = (
  participation: AggregateParticipation,
  side: AggregateSide,
  line: number,
  minute: number,
) => slotAt(participation, side, line, minute) !== undefined;

/** One stint's overlap with a stretch of the match: whom, where, how long and its middle. */
export interface AggregateExposure {
  line: number;
  slot: number;
  minutes: number;
  mid: number;
}
export function exposures(
  participation: AggregateParticipation,
  side: AggregateSide,
  from: number,
  to: number,
): AggregateExposure[] {
  const out: AggregateExposure[] = [];
  for (const s of participation.stints[side]) {
    const a = Math.max(from, s.from),
      b = Math.min(to, s.to);
    if (b > a) out.push({ line: s.line, slot: s.slot, minutes: b - a, mid: (a + b) / 2 });
  }
  return out;
}
/** Whole minutes each line played, by line index; lines that never played are absent. */
export function playedMinutes(
  participation: AggregateParticipation,
  side: AggregateSide,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of participation.stints[side])
    out.set(s.line, (out.get(s.line) ?? 0) + s.to - s.from);
  return out;
}

/**
 * Every way a planned timeline breaks MATCH-19/20/27 beyond the kernel's own checks, empty when it
 * holds: incidents out of the match or out of order, a line in two slots at once, a starter not on
 * from kick-off, a stint that ends without the incident or slot change that ends it or begins
 * without the substitution that brings him on, anyone playing after leaving, a second yellow
 * without a first, more substitutes or windows than the era allows, an injury-only era's
 * substitution without an injury and a side below the minimum on the pitch.
 */
export function participationTimelineIssues(
  input: AggregateInput,
  participation: AggregateParticipation,
  era?: EraRules,
): string[] {
  const out = participationIssues(input, participation);
  const { length, incidents } = participation;
  let last = 0;
  for (const x of incidents) {
    if (!(Number.isInteger(x.minute) && x.minute >= 1 && x.minute <= length))
      out.push(`${x.kind} at minute ${x.minute} outside 1–${length}`);
    if (x.minute < last) out.push(`incidents out of order at minute ${x.minute}`);
    last = x.minute;
  }
  for (const side of [0, 1] as const) {
    const lines = input.sides[side].lines;
    const index = new Map(lines.map((l, i) => [l.id, i]));
    const stints = participation.stints[side];
    const own = incidents.filter((x) => x.side === side);
    const who = `side ${side}`;
    const byLine = new Map<number, AggregateStint[]>();
    for (const s of stints) byLine.set(s.line, [...(byLine.get(s.line) ?? []), s]);
    for (const list of byLine.values()) list.sort((a, b) => a.from - b.from);
    // Where each line's time on the pitch begins and ends, and the boundaries that end it.
    const exits = new Map<number, number>(),
      entries = new Map<number, number>(),
      hurt = new Set<number>();
    for (const x of own) {
      const line = index.get(x.player);
      if (line === undefined) continue;
      // An injured player who left may still be replaced; he left at his injury.
      const replacingHurt = x.kind === 'sub' && hurt.has(line);
      if (x.kind !== 'yellow' && !replacingHurt) {
        if (exits.has(line)) out.push(`${who}: ${x.player} leaves twice`);
        exits.set(line, x.minute - 1);
      }
      if (x.kind === 'injury') hurt.add(line);
      if (replacingHurt) hurt.delete(line);
      if (x.kind === 'sub' && x.other !== undefined) {
        const incoming = index.get(x.other);
        if (incoming === undefined) out.push(`${who}: ${x.other} comes on from outside the roster`);
        else if (incoming < 11 || entries.has(incoming))
          out.push(`${who}: ${x.other} comes on as a starter or a second time`);
        else entries.set(incoming, x.minute - 1);
      }
    }
    for (const [line, list] of byLine) {
      const id = lines[line]?.id ?? `line ${line}`;
      for (let i = 1; i < list.length; i++)
        if (list[i]!.from !== list[i - 1]!.to)
          out.push(`${who}: ${id} returns at ${list[i]!.from} after leaving at ${list[i - 1]!.to}`);
      const begin = list[0]!.from,
        end = list.at(-1)!.to;
      const entry = line < 11 ? 0 : entries.get(line);
      if (entry === undefined) out.push(`${who}: ${id} plays without coming on`);
      else if (begin !== entry) out.push(`${who}: ${id} on at ${begin}, his entry is ${entry}`);
      if (line < 11 && list[0]!.slot !== line) out.push(`${who}: starter ${id} not in his slot`);
      const exit = exits.get(line) ?? length;
      if (end !== exit) out.push(`${who}: ${id} off at ${end}, his exit is ${exit}`);
    }
    for (let line = 0; line < Math.min(11, lines.length); line++)
      if (!byLine.has(line)) out.push(`${who}: starter ${lines[line]!.id} never plays`);
    for (const line of entries.keys())
      if (!byLine.has(line)) out.push(`${who}: ${lines[line]!.id} comes on but never plays`);
    // A line in two slots at once.
    for (const [line, list] of byLine)
      for (let i = 1; i < list.length; i++)
        if (list[i]!.from < list[i - 1]!.to) out.push(`${who}: line ${line} holds two slots`);
    // Incidents name players present at their minute; cautions need a first one before a second.
    const booked = new Set<string>();
    for (const x of own) {
      const line = index.get(x.player);
      if (line === undefined) continue;
      const list = byLine.get(line) ?? [];
      const present = list.some((s) => s.from <= x.minute - 1 && s.to >= x.minute - 1);
      const hurtBefore =
        x.kind === 'sub' &&
        own.some((y) => y.kind === 'injury' && y.player === x.player && y.minute <= x.minute);
      if (!present && !hurtBefore)
        out.push(`${who}: ${x.kind} at ${x.minute} names ${x.player} off the pitch`);
      if (x.kind === 'yellow') {
        if (booked.has(x.player)) out.push(`${who}: ${x.player} cautioned twice as a first yellow`);
        booked.add(x.player);
      }
      if (x.kind === 'secondYellow' && !booked.has(x.player))
        out.push(`${who}: ${x.player} second yellow without a first`);
    }
    // The era's substitutes, windows and the injury-only rule (→MATCH-20).
    const subs = own.filter((x) => x.kind === 'sub');
    if (era) {
      if (lines.length > 11 + era.named)
        out.push(`${who}: ${lines.length - 11} named substitutes > ${era.named}`);
      if (subs.length > era.maxSubs)
        out.push(`${who}: ${subs.length} substitutions > ${era.maxSubs}`);
      const windows = new Set(
        subs.map((x) => x.minute).filter((minute) => !INTERVAL_STAMPS.has(minute)),
      );
      if (era.windows !== undefined && windows.size > era.windows)
        out.push(`${who}: substitutions in ${windows.size} windows > ${era.windows}`);
      if (era.injuryOnly)
        for (const x of subs)
          if (
            !own.some((y) => y.kind === 'injury' && y.player === x.player && y.minute <= x.minute)
          )
            out.push(`${who}: ${x.player} replaced without an injury`);
    }
    // Never fewer than the minimum on the pitch.
    const bounds = new Set([0, ...stints.flatMap((s) => [s.from, s.to])]);
    for (const at of bounds) {
      if (at >= length) continue;
      const on = new Set(stints.filter((s) => s.from <= at && s.to > at).map((s) => s.line));
      if (on.size < PC.minimumPlayers) out.push(`${who}: ${on.size} on the pitch at ${at}`);
    }
  }
  return out;
}

/** Throws the timeline's issues instead of conditioning a match on an illegal plan. */
export function assertParticipation(
  input: AggregateInput,
  participation: AggregateParticipation,
  era?: EraRules,
): void {
  const issues = participationTimelineIssues(input, participation, era);
  if (issues.length) throw new Error(`집계 출전 계획 불일치: ${issues.slice(0, 5).join('; ')}`);
}

const PERIODS: readonly { period: AggregatePeriod; intervals: readonly number[] }[] = [
  { period: 'regulation', intervals: [45] },
  { period: 'extra', intervals: [90, 105] },
];

interface Planned {
  out: number;
  in: number;
  slot: number;
  youth: boolean;
}
type Reason = NonNullable<Incident['reason']>;

/** One side's timeline while it is planned: who holds which slot since when, and what is left. */
class SidePlanner {
  readonly stints: AggregateStint[] = [];
  readonly incidents: Incident[] = [];
  readonly rebalances: AggregateRebalance[] = [];
  private readonly slotOf: (number | undefined)[];
  private readonly holder: (number | undefined)[];
  private readonly start: number[];
  /** When each line came on: a move to another slot does not restart his fatigue (grid `onMin`). */
  private readonly onSince: number[];
  private readonly bench: number[];
  private readonly booked = new Set<number>();
  private injured: { line: number; slot: number }[] = [];
  private used = 0;
  private windows = 0;
  private reds = 0;
  private rebalanced = 0;
  private youthGiven = false;
  private checkpoints = 0;
  /** In-period injury times of the lines on the pitch. */
  private hurtAt = new Map<number, number>();
  private hurtDraws: number[] = [];
  private period = { from: 0, to: 90 };

  constructor(
    private readonly side: AggregateSide,
    private readonly input: AggregateInput,
    private readonly plan: AggregateSidePlan,
    private readonly era: EraRules,
    private readonly year: number,
    private readonly decisions: AggregateRebalanceDecisions,
  ) {
    const n = input.sides[side].lines.length;
    const slots = input.sides[side].slots.length;
    this.slotOf = Array.from({ length: n }, (_, line) => (line < slots ? line : undefined));
    this.holder = Array.from({ length: slots }, (_, slot) => (slot < n ? slot : undefined));
    this.start = Array<number>(n).fill(0);
    this.onSince = Array<number>(n).fill(0);
    this.bench = Array.from({ length: Math.max(0, n - slots) }, (_, i) => slots + i);
  }

  private id = (line: number) => this.input.sides[this.side].lines[line]!.id;
  private slotLine = (slot: number) => this.input.sides[this.side].slots[slot]!.line;
  private onPitch() {
    const out: number[] = [];
    this.slotOf.forEach((slot, line) => {
      if (slot !== undefined) out.push(line);
    });
    return out;
  }

  private leave(line: number, at: number) {
    const slot = this.slotOf[line]!;
    this.stints.push({ line, slot, from: this.start[line]!, to: at });
    this.slotOf[line] = undefined;
    if (this.holder[slot] === line) this.holder[slot] = undefined;
    this.hurtAt.delete(line);
  }
  private enter(line: number, slot: number, at: number) {
    this.slotOf[line] = slot;
    this.holder[slot] = line;
    this.start[line] = at;
    this.onSince[line] = at;
    this.scheduleInjury(line, at);
  }
  /** Moves an on-pitch line to another slot at `at`, without leaving the pitch. */
  private move(line: number, slot: number, at: number) {
    const old = this.slotOf[line]!;
    if (this.start[line]! < at) {
      this.stints.push({ line, slot: old, from: this.start[line]!, to: at });
      this.start[line] = at;
    }
    if (this.holder[old] === line) this.holder[old] = undefined;
    this.slotOf[line] = slot;
    this.holder[slot] = line;
  }

  /**
   * The minute in this period a line on the pitch since `from` gets hurt, from the period's draw
   * for him: CLUB-23's chance in proportion to his minutes, rising through the match as the
   * detailed engine's hazard does (grid/changes.ts).
   */
  private scheduleInjury(line: number, from: number) {
    const chance = this.plan.candidates[line]!.injury;
    const u = this.hurtDraws[line];
    if (u === undefined || !(chance > 0)) return;
    const a = Math.max(from, this.period.from);
    const h0 = CHANGES_CONFIG.hazardFrom,
      rise = CHANGES_CONFIG.hazardRise / 180;
    const k = h0 * a + rise * a * a + (90 * -Math.log(1 - u)) / chance;
    const t = (-h0 + Math.sqrt(h0 * h0 + 4 * rise * k)) / (2 * rise);
    if (t < this.period.to) this.hurtAt.set(line, t);
  }

  /** Plans one period: its cards, injuries and the manager's stoppages in time order. */
  playPeriod(period: AggregatePeriod, intervals: readonly number[], streams: AggregateStreams) {
    const { from, to } = AGGREGATE_CONFIG.periods[period];
    this.period = { from, to };
    const span = to - from;
    const cards = sideDraw(streams, 'discipline', this.side, period),
      hurts = sideDraw(streams, 'injuries', this.side, period),
      changes = sideDraw(streams, 'changes', this.side, period);
    const n = this.input.sides[this.side].lines.length;
    this.hurtDraws = Array.from({ length: n }, () => hurts());
    this.hurtAt.clear();
    for (const line of this.onPitch()) this.scheduleInjury(line, this.start[line]!);
    const D = PC.discipline,
      fouls = AGGREGATE_CONFIG.tactics[this.input.sides[this.side].tactic].fouls;
    type Card = { t: number; kind: 'yellow' | 'secondYellow' | 'red'; u: number; reason: Reason };
    const reason = (shares: Record<string, number>): Reason => {
      const keys = Object.keys(shares);
      return keys[Math.max(0, weightedIndex(cards, Object.values(shares)))] as Reason;
    };
    const queue: ({ t: number; card: Card } | { t: number; stop: 'interval' | 'play' })[] = [];
    for (const [kind, rate] of [
      ['yellow', D.yellows * fouls],
      ['secondYellow', D.secondYellows * fouls],
      ['red', D.reds],
    ] as const)
      for (let k = poissonDraw(cards, (rate * span) / 90); k > 0; k--) {
        const card: Card = {
          t: from + cards() * span,
          kind,
          u: cards(),
          reason: reason(kind === 'red' ? D.redReasons : D.yellowReasons),
        };
        queue.push({ t: card.t, card });
      }
    for (const t of intervals) queue.push({ t, stop: 'interval' });
    const C = PC.changes;
    const first = period === 'regulation' ? CHANGES_CONFIG.earlyPressFrom - C.every : from;
    for (let t = first + C.every; t < to - 0.5; t += C.every)
      queue.push({ t: Math.min(to - 0.5, t + changes() * C.jitter), stop: 'play' });
    queue.sort((a, b) => a.t - b.t);
    let i = 0;
    for (;;) {
      let next: { t: number; line: number } | undefined;
      for (const [line, t] of this.hurtAt) if (!next || t < next.t) next = { t, line };
      const event = queue[i];
      if (next && (!event || next.t < event.t)) {
        this.hurtAt.delete(next.line);
        if (this.injure(next.line, next.t)) this.decide(next.t, false);
        continue;
      }
      if (!event) break;
      i++;
      if ('card' in event) {
        if (this.card(event.card) && event.t < to - 1) {
          const t = Math.min(to - 0.5, event.t + 1 + changes() * (C.afterRed - 1));
          let at = i;
          while (at < queue.length && queue[at]!.t <= t) at++;
          queue.splice(at, 0, { t, stop: 'play' });
        }
      } else this.decide(event.t, event.stop === 'interval');
    }
  }

  /** Whether the side could replace a player at an in-play stoppage now. */
  private canReplace() {
    const windowsLeft = this.era.windows === undefined ? 1 : this.era.windows - this.windows;
    return this.used < this.era.maxSubs && windowsLeft > 0 && this.bench.length > 0;
  }

  /** An injury at `t`: the player leaves at once unless the side would fall below the minimum. */
  private injure(line: number, t: number) {
    const at = Math.floor(t);
    if (this.start[line]! > at - 1) return false;
    if (this.onPitch().length - 1 < PC.minimumPlayers && !this.canReplace()) return false;
    const slot = this.slotOf[line]!;
    this.incidents.push({ minute: at + 1, side: this.side, kind: 'injury', player: this.id(line) });
    this.leave(line, at);
    this.injured.push({ line, slot });
    return true;
  }

  /** A card at its minute to a player present then, drawn by his slot's line; true for a red. */
  private card(card: {
    t: number;
    kind: 'yellow' | 'secondYellow' | 'red';
    u: number;
    reason: Reason;
  }) {
    const at = Math.floor(card.t);
    const removal = card.kind !== 'yellow';
    const pool = this.onPitch().filter(
      (line) =>
        this.start[line]! <= at - (removal ? 1 : 0) &&
        (card.kind === 'yellow'
          ? !this.booked.has(line)
          : card.kind === 'secondYellow'
            ? this.booked.has(line)
            : true),
    );
    if (removal && this.onPitch().length - 1 < PC.minimumPlayers) return false;
    const weights = pool.map((line) => PC.discipline.line[this.slotLine(this.slotOf[line]!)]);
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return false;
    let u = card.u * total,
      chosen = pool.at(-1)!;
    for (let k = 0; k < pool.length; k++)
      if ((u -= weights[k]!) < 0) {
        chosen = pool[k]!;
        break;
      }
    this.incidents.push({
      minute: at + 1,
      side: this.side,
      kind: card.kind,
      player: this.id(chosen),
      reason: card.reason,
    });
    if (!removal) {
      this.booked.add(chosen);
      return false;
    }
    const slot = this.slotOf[chosen]!;
    this.leave(chosen, at);
    this.reds++;
    if (slot === 0) this.coverGoal(at);
    return true;
  }

  /** Puts the outfielder with the best 선방 in goal when nobody keeps it (grid/changes.ts). */
  private coverGoal(at: number) {
    if (this.holder[0] !== undefined) return;
    const keeper = this.onPitch()
      .filter((line) => this.slotOf[line] !== 0)
      .sort(
        (a, b) => this.plan.candidates[b]!.reflexes - this.plan.candidates[a]!.reflexes || a - b,
      )[0];
    if (keeper !== undefined) this.move(keeper, 0, at);
  }

  /** His in-match fatigue at `t`: the detailed engine's rule over his minutes since he came on. */
  private fatigue(line: number, t: number) {
    const c = this.plan.candidates[line]!;
    return inMatchFatigue(
      c.fatigue,
      c.stamina,
      t - this.onSince[line]!,
      this.plan.pressing,
      this.plan.drain,
    );
  }

  /**
   * The manager's changes at a stoppage, in the detailed engine's order (grid/changes.ts
   * `planChanges`): injured players replaced, a red card answered, then his policy, within the
   * era's substitutes and windows. The aggregate plan comes before the score exists, so the
   * score-led changes (protecting a lead, chasing a deficit) are not made, and the red-card
   * rebalance follows `decisions`, which the match settles against its score afterwards
   * (`rebalanceIssues`).
   */
  private decide(t: number, interval: boolean) {
    const C = CHANGES_CONFIG,
      era = this.era,
      policy = this.plan.policy;
    const at = Math.floor(t),
      minute = at + 1;
    const windowsLeft = era.windows === undefined ? Infinity : era.windows - this.windows;
    let left = interval || windowsLeft > 0 ? era.maxSubs - this.used : 0;
    const plan: Planned[] = [];
    const taken = new Set<number>(),
      leaving = new Set<number>();
    const slots = this.input.sides[this.side].slots;
    const pick = (slot: number, lines?: readonly Line[], young = false) => {
      let best: number | undefined,
        value = -Infinity;
      const options: [number, number][] = [];
      for (const line of this.bench) {
        if (taken.has(line)) continue;
        const c = this.plan.candidates[line]!;
        if (lines && !lines.includes(c.line)) continue;
        if (young && this.year - c.born > C.youthAge) continue;
        const v = c.slotLevel[slot]!;
        options.push([line, v]);
        if (v > value) [best, value] = [line, v];
      }
      if (
        best !== undefined &&
        policy.youth &&
        this.year - this.plan.candidates[best]!.born > C.youthAge
      )
        for (const [line, v] of options)
          if (
            this.year - this.plan.candidates[line]!.born <= C.youthAge &&
            v >= value - C.youthMargin
          )
            return line;
      return best;
    };
    const eligible = (line: number) =>
      this.injured.some((x) => x.line === line) ||
      (this.slotOf[line] !== undefined && this.start[line]! <= at - 1 && !leaving.has(line));
    const sub = (out: number, slot: number, lines?: readonly Line[], young = false) => {
      if (left <= 0 || !eligible(out)) return false;
      const inn = pick(slot, lines, young);
      if (inn === undefined) return false;
      plan.push({ out, in: inn, slot, youth: young });
      taken.add(inn);
      leaving.add(out);
      left--;
      return true;
    };
    const apply = () => {
      for (const ch of plan) {
        this.incidents.push({
          minute,
          side: this.side,
          kind: 'sub',
          player: this.id(ch.out),
          other: this.id(ch.in),
        });
        if (this.slotOf[ch.out] !== undefined) this.leave(ch.out, at);
        this.enter(ch.in, ch.slot, at);
        this.bench.splice(this.bench.indexOf(ch.in), 1);
        this.used++;
        if (ch.youth) this.youthGiven = true;
      }
      if (plan.length && !interval) this.windows++;
      this.injured = [];
      this.rebalanced = this.reds;
      if (policy.data) this.checkpoints = C.dataAt.filter((m) => t >= m + policy.delay).length;
      this.coverGoal(at);
    };

    for (const x of [...this.injured]) sub(x.line, x.slot);
    if (era.injuryOnly) return apply();
    const timeAt = (threshold: number) => t >= threshold + policy.delay;
    if (this.reds > this.rebalanced) {
      const filled = new Set(this.onPitch().map((line) => this.slotOf[line]!));
      for (const ch of plan) filled.add(ch.slot);
      const vacant = slots.findIndex((s, slot) => slot > 0 && !filled.has(slot) && s.line !== 'FW');
      const forward = this.onPitch().find(
        (line) => eligible(line) && slots[this.slotOf[line]!]!.line === 'FW',
      );
      const men = this.onPitch().length + plan.length;
      const lines: Line[] = ['DF', 'MF'];
      if (
        men < 11 &&
        vacant >= 0 &&
        forward !== undefined &&
        left > 0 &&
        pick(vacant, lines) !== undefined
      ) {
        // Only the first stoppage after a red answers it, as in the grid (`rebalanced` below).
        const key = `${this.side}:${this.reds}`;
        const made = this.decisions.get(key) ?? true;
        // The forward's slot empties; the newcomer takes the vacant one.
        if (made) sub(forward, vacant, lines);
        this.rebalances.push({ side: this.side, minute, key, made });
      }
    }
    if (left <= 0) return apply();
    let cap = era.windows === undefined ? 1 : Math.ceil(left / Math.max(1, windowsLeft));
    const starters = () =>
      this.onPitch().filter((line) => line < 11 && this.slotOf[line]! > 0 && eligible(line));
    const byFatigue = (list: number[]) =>
      list
        .map((line) => ({ line, f: this.fatigue(line, t) }))
        .sort((a, b) => b.f - a.f || a.line - b.line)
        .map((x) => x.line);
    const change = (line: number | undefined, young = false) =>
      line !== undefined && cap > 0 && sub(line, this.slotOf[line]!, undefined, young) && cap--;
    if (policy.youth && !this.youthGiven && timeAt(C.youthFrom))
      change(byFatigue(starters())[0], true);
    if (interval && !policy.earlyPress) return apply();
    const tired = () =>
      byFatigue(starters().filter((line) => this.fatigue(line, t) - C.fitness > C.tired));
    if (policy.data) {
      const due = C.dataAt.filter((m) => timeAt(m)).length;
      if (due <= this.checkpoints) return apply();
      const list = due === 1 ? tired() : byFatigue(starters());
      cap = due === 1 ? left : due === 2 ? Math.ceil(left / 2) : left;
      for (const line of list) if (!change(line)) break;
      return apply();
    }
    if (interval || timeAt(policy.fatigueFrom))
      for (const line of tired()) if (!change(line)) break;
    if (!interval && timeAt(policy.laterFrom))
      for (const line of byFatigue(starters())) if (!change(line)) break;
    return apply();
  }

  /** Closes every open stint at the end of the match. */
  finish(length: AggregateLength) {
    for (const line of this.onPitch()) this.leave(line, length);
    this.stints.sort((a, b) => a.from - b.from || a.slot - b.slot);
  }
}

/**
 * The match's participation timeline before its team facts (→MATCH-20/21/27): each side's XI in
 * its slots, injuries at CLUB-23's chance in proportion to minutes, cards at the configured rates
 * to players present at the moment, dismissals and unreplaced injuries leaving a side short, and
 * the manager's changes under the era's limits. Each side and period draws on streams of its own
 * (`sideDraw`), so the sides never mirror each other and planning 120 minutes keeps the first 90
 * exactly as planned for 90. `decisions` says which red
 * cards (`side:reds`) the side answers with its rebalance; unlisted ones are answered.
 */
export function planParticipation(
  input: AggregateInput,
  plan: AggregatePlan,
  streams: AggregateStreams,
  length: AggregateLength = 90,
  decisions: AggregateRebalanceDecisions = new Map(),
): AggregateParticipation {
  const sides = ([0, 1] as const).map(
    (side) => new SidePlanner(side, input, plan.sides[side], plan.era, input.year, decisions),
  );
  for (const { period, intervals } of PERIODS) {
    if (AGGREGATE_CONFIG.periods[period].from >= length) break;
    for (const s of sides) s.playPeriod(period, intervals, streams);
  }
  for (const s of sides) s.finish(length);
  const incidents = [...sides[0]!.incidents, ...sides[1]!.incidents]
    .map((x, order) => ({ x, order }))
    .sort((a, b) => a.x.minute - b.x.minute || a.order - b.order)
    .map(({ x }) => x);
  const participation: AggregateParticipation = {
    length,
    stints: [sides[0]!.stints, sides[1]!.stints],
    incidents,
    rebalances: [...sides[0]!.rebalances, ...sides[1]!.rebalances],
  };
  assertParticipation(input, participation, plan.era);
  return participation;
}

/** A side's goals minus its opponent's in the minutes before `minute` (a stoppage's stamp). */
export function scoreBefore(facts: AggregateTeamFacts, side: AggregateSide, minute: number) {
  const goals = (s: AggregateSide) =>
    facts.ledger.sides[s].shots.filter((x) => x.outcome === 'goal' && x.minute < minute).length;
  return goals(side) - goals(side === 0 ? 1 : 0);
}

/**
 * The red cards whose answer disagrees with the score at its stoppage (→STAFF-45: a side down to
 * ten rebalances there when level or ahead, and only then): a rebalance made while trailing or
 * one withheld while level or ahead. Empty when the plan holds. A goal stamped in the stoppage's
 * own minute counts as after it.
 */
export function rebalanceIssues(
  participation: AggregateParticipation,
  facts: AggregateTeamFacts,
): string[] {
  return (participation.rebalances ?? [])
    .filter((x) => scoreBefore(facts, x.side, x.minute) >= 0 !== x.made)
    .map((x) => x.key);
}

/** Lines of a side in record order: the XI, then substitutes in the order they came on. */
export function recordLines(
  input: AggregateInput,
  participation: AggregateParticipation,
  side: AggregateSide,
): number[] {
  const index = new Map(input.sides[side].lines.map((l, i) => [l.id, i]));
  const starters = input.sides[side].slots.map((_, slot) => slot);
  const entered = participation.incidents
    .filter((x) => x.side === side && x.kind === 'sub' && x.other !== undefined)
    .map((x) => index.get(x.other!)!);
  return [...starters, ...entered];
}
