/** The touch-by-touch trace playback is built from (design §10.1). Only kept when the match is observed. */
import { MOTION_STATES, PLAYBACK_CONFIG } from './playback';
import { attackFrame, cellOf, clamp, PITCH, toEngine } from './pitch';
import type { Outcome, ShotOutcome } from './resolve';
import type { EndedIntention, Intention, IntentionKind } from './intentions';
import type { MotionKnot } from './movement';
import type { Restart } from './restarts';
import { pressers, targetOf, type ShapeCache } from './shape';
import { onPitch, other, type GridPlayer, type GridState } from './state';
import type { Tags } from './tags';

type Ref = [0 | 1, number];

/** The tags commentary reads (→MATCH-15). */
export type TraceTags = Pick<
  Tags,
  'phase' | 'orientation' | 'betweenLines' | 'pocket' | 'inBehind' | 'channel' | 'overload'
>;

export interface TraceEntry {
  /** Match seconds since kick-off across periods. */
  elapsed: number;
  period: 1 | 2 | 3 | 4;
  /** Seconds within the period. */
  t: number;
  /** The side and roster index of the player acting; -1 for a whistle. */
  side: 0 | 1;
  idx: number;
  /**
   * What he did, e.g. `pass`, `shot`, or a restart kind, and how it ended; an incident (`yellow`,
   * `secondYellow`, `red`, `sub`, `injury`, `whistle`) ends as `incident`.
   */
  action: string;
  outcome: string;
  /** Where the actor stood when he acted (engine frame); absent for restarts and incidents. */
  from?: [number, number];
  /** Ball position in the engine frame after the action. */
  ball: [number, number];
  /** A teammate who got the ball: the receiver, the header's or cut-back's shooter, a loose ball's winner. */
  receiver?: number;
  /** The other player in the duel: interceptor, tackler, keeper, blocker, loose ball's winner, or the fouler. */
  by?: Ref;
  /** The fouled player when he is not the actor (a 50/50). */
  on?: Ref;
  /** Where the ball ended (engine frame): at its new holder, on the line, at the foul or in the net. */
  to?: [number, number];
  /** A pass's kind (short, long, switch, through), or how a restart was played (also cross, shot, penalty). */
  kind?: string;
  lineBreaking?: boolean;
  /** A restart's spot (engine frame) and the dead seconds before it was taken. */
  spot?: [number, number];
  dead?: number;
  /** Where the receiver struck a shot he was set up for (engine frame). */
  shotAt?: [number, number];
  /** A shot's result, recorded xG and whether it was headed. */
  result?: ShotOutcome['result'];
  xg?: number;
  header?: boolean;
  /** An incident's other player (the substitute who came on) and a card's reason. */
  other?: number;
  reason?: string;
  /**
   * Candidate model only (→MATCH-12): the ball's semantic knots for this entry at absolute elapsed
   * seconds — retrieval and placement before a restart, the kick, touches on the way, the reception,
   * arrival, carry or tackle — in time order.
   */
  knots?: MotionKnot[];
  /**
   * Candidate model only: an explicit transition, never running play. `period` at a period's
   * start whistle (everyone stands at his kick-off spot); `entry` for a substitution (`other`
   * comes on at `to` on the touchline, `idx` leaves); `exit` for a player injured or sent off.
   */
  transition?: 'period' | 'entry' | 'exit';
  /**
   * Candidate model only: on an `exit` or `entry`, the intention the leaving player (`idx`) ended
   * with and its reason (substitution, injury, dismissal), since he is no longer in a slot.
   */
  left?: EndedIntention;
  /** The actor's cell (his attack frame) and tags when he acted. */
  cell?: number;
  tags?: TraceTags;
  /** Engine-frame metres of roster slots 0–10 of each side, x then y; NaN for an empty slot. */
  positions: Float32Array;
  /** The roster index in each slot, side 0 then side 1; -1 for an empty slot. */
  slots: Int8Array;
  /** Engine-frame target of each slot's player, laid out as `positions`. */
  targets: Float32Array;
  /** Each slot's motion state, an index into `MOTION_STATES`. */
  states: Uint8Array;
  /**
   * Candidate model only (→MATCH-17): each slot's intention as the engine holds it after the entry,
   * whose target is the slot's `targets`; else the one that ended since it was last traced, with
   * its ending and reason; null when neither. Laid out as `slots`; references are roster indexes.
   */
  intentions?: (Intention | EndedIntention | null)[];
  /** `Tally.running()` after the entry. */
  totals: Float64Array;
  /**
   * Candidate model only (T359, →MATCH-12/17): on a restart prepared on the clock, every slot at
   * its kick, the instant `restartTaken` runs — where the walk-in ended and the restart's
   * intentions (the places walked to) still held. The entry itself is after the delivery. Absent
   * on older traces, at a period's kick-off and on the pre-feature path.
   */
  kick?: TraceKick;
}

/** A restart's kick (`TraceEntry.kick`): the clock and every slot, laid out as an entry's. */
export type TraceKick = Pick<
  TraceEntry,
  'elapsed' | 'positions' | 'slots' | 'targets' | 'states' | 'intentions'
>;

/** What the engine resolved for an action, read by `Tracer.act`. */
export interface TraceAction {
  outcome: Outcome | 'offside';
  kind?: string;
  target?: number;
  lineBreaking?: boolean;
  tags?: Tags;
  restart?: Restart;
  knots?: MotionKnot[];
}

type Snapshot = Pick<
  TraceEntry,
  'ball' | 'positions' | 'slots' | 'targets' | 'states' | 'totals' | 'intentions'
>;
type Detail = Omit<Partial<TraceEntry>, keyof Snapshot>;

const STATE_INDEX = Object.fromEntries(MOTION_STATES.map((st, i) => [st, i])) as Record<
  (typeof MOTION_STATES)[number],
  number
>;

/** Where a shot ended: in the net, over the byline for a corner or a goal kick, else where the ball now is. */
export function shotEnd(
  s: GridState,
  side: 0 | 1,
  shooter: number,
  o: ShotOutcome,
): [number, number] {
  const y = attackFrame(side, s.players[side][shooter]!.pos)[1];
  const mid = PITCH.width / 2;
  if (o.result === 'goal') return toEngine(side, [PITCH.length, clamp(y, mid - 3, mid + 3)]);
  if (o.then === 'corner' || o.then === 'goalKick')
    return toEngine(side, [PITCH.length, y < mid ? Math.min(y, mid - 5) : Math.max(y, mid + 5)]);
  return [s.ball[0], s.ball[1]];
}

/** The players involved and where the ball went, read right after the action resolved. */
function detailOf(s: GridState, side: 0 | 1, idx: number, a: TraceAction): Detail {
  const d: Detail = {};
  const foe = other(side);
  if (a.kind) d.kind = a.kind;
  if (a.lineBreaking) d.lineBreaking = true;
  if (a.knots) d.knots = a.knots;
  if (a.restart) {
    d.spot = [a.restart.spot[0], a.restart.spot[1]];
    d.dead = a.restart.dead;
    d.cell = cellOf(attackFrame(side, a.restart.spot));
  }
  if (a.tags) {
    const { phase, orientation, betweenLines, pocket, inBehind, channel, overload } = a.tags;
    d.cell = a.tags.cell;
    d.tags = { phase, orientation, betweenLines, pocket, inBehind, channel, overload };
  }
  const o = a.outcome;
  if (o === 'offside') {
    if (a.target !== undefined) {
      const p = s.players[side][a.target]!.pos;
      d.receiver = a.target;
      d.to = [p[0], p[1]];
    }
    return d;
  }
  switch (o.kind) {
    case 'complete':
      if (o.receiver !== idx) d.receiver = o.receiver;
      d.to = [o.to[0], o.to[1]];
      break;
    case 'intercepted':
      d.by = [foe, o.by];
      d.to = [o.at[0], o.at[1]];
      break;
    case 'loose':
      if (o.winner[0] === side) d.receiver = o.winner[1];
      else d.by = [o.winner[0], o.winner[1]];
      d.to = [o.at[0], o.at[1]];
      break;
    case 'out':
      d.to = [o.at[0], o.at[1]];
      break;
    case 'foul': {
      const fouled = o.on ?? [side, idx];
      d.by = [other(fouled[0]), o.by];
      if (o.on) d.on = [o.on[0], o.on[1]];
      d.to = [o.at[0], o.at[1]];
      break;
    }
    case 'tackled':
    case 'held':
      if (o.by !== undefined) d.by = [foe, o.by];
      d.to = [s.ball[0], s.ball[1]];
      break;
    case 'shot': {
      const shooter = o.shooter ?? idx;
      if (shooter !== idx) {
        const p = s.players[side][shooter]!.pos;
        d.receiver = shooter;
        d.shotAt = [p[0], p[1]];
      }
      d.result = o.result;
      d.xg = o.recordedXg;
      if (o.header) d.header = true;
      if (o.by !== undefined) d.by = [foe, o.by];
      d.to = shotEnd(s, side, shooter, o);
    }
  }
  return d;
}

/** The motion state an intention shows as. */
const INTENTION_STATE: Record<IntentionKind, (typeof MOTION_STATES)[number]> = {
  support: 'support',
  receive: 'support',
  run: 'run',
  press: 'press',
  mark: 'mark',
  cover: 'mark',
  recover: 'recover',
  carry: 'carry',
  restart: 'shape',
  exit: 'recover',
};

/** The motion state the engine gives a player now (design §10.2); an intention shows as its own. */
function stateOf(
  s: GridState,
  gp: GridPlayer,
  target: readonly [number, number],
  press: readonly number[],
): number {
  const c = PLAYBACK_CONFIG.states;
  const attacking = s.possession === gp.side;
  const near = (p: readonly [number, number], d: number) =>
    Math.hypot(p[0] - gp.pos[0], p[1] - gp.pos[1]) <= d;
  if (s.owner && s.owner[0] === gp.side && s.owner[1] === gp.idx) return STATE_INDEX.carry;
  if (gp.slot === 0) return STATE_INDEX.keeper;
  if (gp.intention) return STATE_INDEX[INTENTION_STATE[gp.intention.kind]];
  if (!attacking && press.includes(gp.idx)) return STATE_INDEX.press;
  if (gp.run && gp.run.until > s.elapsed) return STATE_INDEX.run;
  if (!near(target, c.recover)) return STATE_INDEX.recover;
  if (attacking && near(s.ball, c.support)) return STATE_INDEX.support;
  if (
    !attacking &&
    s.players[other(gp.side)].some((o) => onPitch(o) && o.slot > 0 && near(o.pos, c.mark))
  )
    return STATE_INDEX.mark;
  return STATE_INDEX.shape;
}

/**
 * The positions, targets, states and (candidate model) intentions of every slot now; `fresh` says
 * whether an ended intention has not been traced yet (an entry's also marks it traced).
 */
function slotsNow(
  s: GridState,
  fresh: (ended: EndedIntention) => boolean,
): Omit<TraceKick, 'elapsed'> {
  const positions = new Float32Array(44).fill(NaN);
  const targets = new Float32Array(44).fill(NaN);
  const slots = new Int8Array(22).fill(-1);
  const states = new Uint8Array(22);
  const candidate = s.setup.model !== undefined;
  const intentions: (Intention | EndedIntention | null)[] | undefined = candidate
    ? new Array<null>(22).fill(null)
    : undefined;
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  for (const sd of [0, 1] as const) {
    // On the candidate model only a press intention presses (`targetOf`).
    const press = sd === s.possession || candidate ? [] : pressers(s, sd);
    s.players[sd].forEach((gp: GridPlayer) => {
      if (!onPitch(gp) || gp.slot < 0 || gp.slot >= 11) return;
      const k = sd * 11 + gp.slot;
      const owner = s.owner !== undefined && s.owner[0] === sd && s.owner[1] === gp.idx;
      // An intention's target is the one his last movement used (a tracked one is refreshed before it).
      const target = owner ? gp.pos : (gp.intention?.target ?? targetOf(s, sd, gp.idx, cache));
      positions[k * 2] = gp.pos[0];
      positions[k * 2 + 1] = gp.pos[1];
      targets[k * 2] = target[0];
      targets[k * 2 + 1] = target[1];
      slots[k] = gp.idx;
      states[k] = stateOf(s, gp, target, press);
      if (!intentions) return;
      const i = gp.intention ?? (gp.ended && fresh(gp.ended) ? gp.ended : undefined);
      if (i) intentions[k] = { ...i, target: [i.target[0], i.target[1]] };
    });
  }
  return { positions, slots, targets, states, ...(intentions ? { intentions } : {}) };
}

/** An entry's snapshot: the ball, every slot (`slotsNow`) and the running totals. */
function snapshot(
  s: GridState,
  totals: Float64Array,
  fresh: (ended: EndedIntention) => boolean,
): Snapshot {
  const { intentions, ...arrays } = slotsNow(s, fresh);
  return {
    ball: [s.ball[0], s.ball[1]],
    ...arrays,
    totals,
    ...(intentions ? { intentions } : {}),
  };
}

export class Tracer {
  readonly entries: TraceEntry[] = [];
  /** Incidents of the action under way; they follow its entry (a card follows its foul). */
  private held?: Detail[];
  private detail: Detail = {};
  /** Ended intentions already traced: each shows once, at the first entry after it ended. */
  private readonly traced = new WeakSet<EndedIntention>();
  private readonly fresh = (ended: EndedIntention) => {
    if (this.traced.has(ended)) return false;
    this.traced.add(ended);
    return true;
  };
  /** The kick of the restart under way, for its entry. */
  private kicked?: TraceKick;

  constructor(
    private readonly on: boolean,
    private readonly totals: () => Float64Array = () => new Float64Array(0),
  ) {}

  /** An action starts: incidents noted until its `push` follow its entry. */
  hold(): void {
    if (this.on) this.held = [];
  }

  /** Reads what the action did before anyone moves on. */
  act(s: GridState, side: 0 | 1, idx: number, a: TraceAction): void {
    if (this.on) this.detail = detailOf(s, side, idx, a);
  }

  /**
   * A restart prepared on the clock is taken (`prepareOnClock`, T359): every slot as
   * `restartTaken` is about to run, the walk-in done and the restart's places still held, goes
   * with the restart's entry. It only reads the state; an ended intention it shows still shows at
   * the entry, which is when it counts as traced.
   */
  readonly kick = (s: GridState): void => {
    if (!this.on) return;
    this.kicked = {
      elapsed: s.elapsed,
      ...slotsNow(s, (ended) => !this.traced.has(ended)),
    };
  };

  push(
    s: GridState,
    side: 0 | 1,
    idx: number,
    action: string,
    outcome: string,
    from?: [number, number],
  ): void {
    if (!this.on) return;
    const shot = snapshot(s, this.totals(), this.fresh);
    const at = { elapsed: s.elapsed, period: s.period, t: s.t };
    const kick = this.kicked;
    this.entries.push({
      ...at,
      side,
      idx,
      action,
      outcome,
      ...(from ? { from } : {}),
      ...this.detail,
      ...shot,
      ...(kick ? { kick } : {}),
    });
    this.detail = {};
    this.kicked = undefined;
    const held = this.held ?? [];
    this.held = undefined;
    for (const n of held)
      this.entries.push({
        ...at,
        side: 0,
        idx: -1,
        action: '',
        outcome: 'incident',
        ...n,
        ...shot,
      });
  }

  /** A card, substitution, injury or whistle (`idx` -1); during an action it waits for the action's entry. */
  note(
    s: GridState,
    side: 0 | 1,
    idx: number,
    kind: 'yellow' | 'secondYellow' | 'red' | 'sub' | 'injury' | 'whistle',
    extra: Pick<Detail, 'other' | 'reason' | 'transition' | 'to' | 'left'> = {},
  ): void {
    if (!this.on) return;
    const n: Detail = { side, idx, action: kind, outcome: 'incident', ...extra };
    if (this.held) this.held.push(n);
    else
      this.entries.push({
        elapsed: s.elapsed,
        period: s.period,
        t: s.t,
        side,
        idx,
        action: kind,
        outcome: 'incident',
        ...extra,
        ...snapshot(s, this.totals(), this.fresh),
      });
  }
}
