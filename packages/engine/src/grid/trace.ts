/** The touch-by-touch trace playback is built from (design §10.1). Only kept when the match is observed. */
import { MOTION_STATES, PLAYBACK_CONFIG } from './playback';
import { attackFrame, cellOf, clamp, PITCH, toEngine } from './pitch';
import type { Outcome, ShotOutcome } from './resolve';
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
  /** `Tally.running()` after the entry. */
  totals: Float64Array;
}

/** What the engine resolved for an action, read by `Tracer.act`. */
export interface TraceAction {
  outcome: Outcome | 'offside';
  kind?: string;
  target?: number;
  lineBreaking?: boolean;
  tags?: Tags;
  restart?: Restart;
}

type Snapshot = Pick<TraceEntry, 'ball' | 'positions' | 'slots' | 'targets' | 'states' | 'totals'>;
type Detail = Omit<Partial<TraceEntry>, keyof Snapshot>;

const STATE_INDEX = Object.fromEntries(MOTION_STATES.map((st, i) => [st, i])) as Record<
  (typeof MOTION_STATES)[number],
  number
>;

/** Where a shot ended: in the net, over the byline for a corner or a goal kick, else where the ball now is. */
function shotEnd(s: GridState, side: 0 | 1, shooter: number, o: ShotOutcome): [number, number] {
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

/** The motion state the engine gives a player now (design §10.2). */
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

function snapshot(s: GridState, totals: Float64Array): Snapshot {
  const positions = new Float32Array(44).fill(NaN);
  const targets = new Float32Array(44).fill(NaN);
  const slots = new Int8Array(22).fill(-1);
  const states = new Uint8Array(22);
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  for (const sd of [0, 1] as const) {
    const press = sd === s.possession ? [] : pressers(s, sd);
    s.players[sd].forEach((gp: GridPlayer) => {
      if (!onPitch(gp) || gp.slot < 0 || gp.slot >= 11) return;
      const k = sd * 11 + gp.slot;
      const owner = s.owner !== undefined && s.owner[0] === sd && s.owner[1] === gp.idx;
      const target = owner ? gp.pos : targetOf(s, sd, gp.idx, cache);
      positions[k * 2] = gp.pos[0];
      positions[k * 2 + 1] = gp.pos[1];
      targets[k * 2] = target[0];
      targets[k * 2 + 1] = target[1];
      slots[k] = gp.idx;
      states[k] = stateOf(s, gp, target, press);
    });
  }
  return { ball: [s.ball[0], s.ball[1]], positions, slots, targets, states, totals };
}

export class Tracer {
  readonly entries: TraceEntry[] = [];
  /** Incidents of the action under way; they follow its entry (a card follows its foul). */
  private held?: Detail[];
  private detail: Detail = {};

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

  push(
    s: GridState,
    side: 0 | 1,
    idx: number,
    action: string,
    outcome: string,
    from?: [number, number],
  ): void {
    if (!this.on) return;
    const shot = snapshot(s, this.totals());
    const at = { elapsed: s.elapsed, period: s.period, t: s.t };
    this.entries.push({
      ...at,
      side,
      idx,
      action,
      outcome,
      ...(from ? { from } : {}),
      ...this.detail,
      ...shot,
    });
    this.detail = {};
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
    extra: { other?: number; reason?: string } = {},
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
        ...snapshot(s, this.totals()),
      });
  }
}
