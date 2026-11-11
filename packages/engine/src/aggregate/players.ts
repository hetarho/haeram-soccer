/**
 * Named player lines from one aggregate match (→MATCH-11, MATCH-13, MATCH-26, MATCH-27): every
 * group of the ledger is split among the players who were on the pitch for it, by their slot's
 * line, role and play traits and the attribute the action reads. Shots are credited first, at
 * their minute, to a shooter present then and — for a chance a pass made — a key passer who holds
 * one of that pass group's completions, so goals, assists, shots, key passes, xG and xA are the
 * same chances. Every split is of an exact count, so player lines add up to the team row under
 * each definition; nothing is drawn independently of the team facts.
 *
 * From revision 11 (`AggregatePlan.placed`, T824, →MATCH-16) a pass, carry, take-on, ball won,
 * foul or offside also weighs how near the player's role stands to where it happens (`placeTerm`),
 * and the open-play splits are scaled back so each player's expected totals by action class stay
 * the unplaced weights' (`fitPlaced`); shots, key passers, saves, cards and set-piece takers are
 * credited as before, and an offside is drawn among the passer's teammates, never himself.
 */
import { PD, PLAYER_DETAIL_SIZE } from '../../../contracts/src/detail';
import type { Line } from '../../../contracts/src/player';
import { cellBand, cellLane } from '../grid/pitch';
import { RESTART_CONFIG } from '../grid/restarts';
import { COUNTER_ZONES, isCutBack, M, mirrorBand } from '../grid/record';
import type { MatchAction } from '../match';
import { zeroMetrics } from '../primitives';
import { exp } from '../portable-math';
import { cellCentre, placeFor, type ShapeSide } from '../staging/shape';
import { dist } from '../staging/vec';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC, AGGREGATE_CONFIG } from './config';
import { inBoxCell, isPassKind, looseBalls, moveKindIndex, xtGain } from './ledger';
import {
  binomialDraw,
  exposures,
  multinomialDraw,
  multinomialInto,
  playedMinutes,
  recordLines,
  sideDraw,
  weightedIndex,
  type AggregateExposure,
} from './participation';
import { AGGREGATE_MOVE_KINDS } from './types';
import type {
  AggregateMoveKind,
  AggregateAttribute,
  AggregateAttributionTrace,
  AggregateInput,
  AggregateLine,
  AggregateMove,
  AggregateParticipation,
  AggregatePeriod,
  AggregatePlan,
  AggregatePlayerFacts,
  AggregateShot,
  AggregateShotCredit,
  AggregateSide,
  AggregateStreams,
  AggregateTeamFacts,
  AggregateTraceFouls,
  AggregateTraceMove,
} from './types';

type Rng = () => number;
type Table = Readonly<Record<Line, number>>;

/** MATCH-13's definitions as the ledger reads them (ledger.ts `sideCounters`). */
const FINAL_THIRD_BAND = COUNTER_ZONES.finalThird;
const BIG_CHANCE = 30;
const LAST_BAND = 7;

/** What makes a line do an action: his slot's line, a flank bonus, the attribute and the action. */
interface Role {
  /** Its index among the roles built here: weights are cached by it (T612). */
  id: number;
  table: Table;
  /** `table`'s values by `LINE_INDEX`, read by index instead of by the line's name (T612). */
  byLine: readonly number[];
  attribute: AggregateAttribute;
  /** Weighs by the grid's offside call on the participant's own attribute (`offsideCall`). */
  call: true | undefined;
  action: MatchAction | undefined;
  wide: number | undefined;
}
/** A role as written below; `makeRole` gives every role the same fields in one order (T612). */
interface RoleSpec {
  table: Table;
  attribute: AggregateAttribute;
  call?: true;
  action?: MatchAction;
  wide?: number;
}
const byBand = (rows: Readonly<Record<Line, readonly number[]>>, band: number): Table => ({
  GK: rows.GK[band]!,
  DF: rows.DF[band]!,
  MF: rows.MF[band]!,
  FW: rows.FW[band]!,
});
/**
 * Offsides go where the grid's call falls (→MATCH-18 r21, T384): a receiver weighs
 * e^(−(own 판단력 − pivot) / spread) with the candidate call's pivot and spread (restarts.ts).
 */
const OFFSIDE_CALL = RESTART_CONFIG.offside.candidate;
const BANDS = Array.from({ length: LAST_BAND + 1 }, (_, band) => band);
let roleCount = 0;
/** A line's index in a role's `byLine`. */
const LINE_INDEX: Readonly<Record<Line, number>> = { GK: 0, DF: 1, MF: 2, FW: 3 };
const makeRole = (r: RoleSpec): Role => ({
  id: roleCount++,
  table: r.table,
  byLine: [r.table.GK, r.table.DF, r.table.MF, r.table.FW],
  attribute: r.attribute,
  call: r.call,
  action: r.action,
  wide: r.wide,
});
/** Every role, built once: weights are cached by role. */
const PASS_ROLES = BANDS.map((band) =>
  [false, true].map((long) =>
    makeRole({
      table: byBand(AC.pass, band),
      attribute: 'passing',
      ...(long
        ? { action: 'long' as const }
        : band >= FINAL_THIRD_BAND
          ? { action: 'key' as const }
          : {}),
    }),
  ),
);
const CROSS_ROLES = BANDS.map((band) =>
  makeRole({ table: byBand(AC.pass, band), attribute: 'crossing', action: 'cross', wide: AC.wide }),
);
const CARRY_ROLES = BANDS.map((band) =>
  makeRole({ table: byBand(AC.pass, band), attribute: 'dribbling', action: 'run' }),
);
const TAKE_ON_ROLES = BANDS.map((band) =>
  makeRole({
    table: {
      GK: 0,
      DF: AC.takeOn.DF * AC.pass.DF[band]!,
      MF: AC.takeOn.MF * AC.pass.MF[band]!,
      FW: AC.takeOn.FW * AC.pass.FW[band]!,
    },
    attribute: 'dribbling',
    action: 'dribble',
  }),
);
const DEFEND_ROLES = BANDS.map((band) =>
  (['tackling', 'positioning'] as const).map((attribute) =>
    makeRole({ table: byBand(AC.defend, band), attribute, action: 'press' }),
  ),
);
const ROLES = {
  pass: (band: number, long: boolean) => PASS_ROLES[band]![long ? 1 : 0]!,
  cross: (band: number) => CROSS_ROLES[band]!,
  through: makeRole({ table: AC.through, attribute: 'vision', action: 'key' }),
  carry: (band: number) => CARRY_ROLES[band]!,
  takeOn: (band: number) => TAKE_ON_ROLES[band]!,
  shot: makeRole({ table: AC.shot, attribute: 'finishing', action: 'box' }),
  outsideShot: makeRole({ table: AC.outsideShot, attribute: 'finishing', action: 'long' }),
  header: makeRole({ table: AC.header, attribute: 'heading', action: 'aerial' }),
  offside: makeRole({ table: AC.offside, attribute: 'decisions', call: true, action: 'run' }),
  defend: (band: number, attribute: 'tackling' | 'positioning') =>
    DEFEND_ROLES[band]![attribute === 'tackling' ? 0 : 1]!,
};

/** The shot a chance of this kind is taken with, by place and foot or head. */
const shooterRole = (shot: AggregateShot) =>
  shot.header ? ROLES.header : inBoxCell(shot.cell) ? ROLES.shot : ROLES.outsideShot;
/** The role that plays a move group (corners and free kicks are their taker's). */
function moveRole(move: AggregateMove): Role {
  const band = cellBand(move.from);
  switch (move.kind) {
    case 'cross':
    case 'cutBack':
      return ROLES.cross(band);
    case 'through':
      return ROLES.through;
    case 'carry':
      return ROLES.carry(band);
    case 'takeOn':
      return ROLES.takeOn(band);
    default:
      return ROLES.pass(band, move.kind === 'long');
  }
}

/** Set-piece takers' keys (grid/setup.ts `takersFor`), read from effective skills at the minute. */
type TakerKey = 'penalty' | 'freeKick' | 'corner';
const TAKER: Record<TakerKey, readonly (readonly [AggregateAttribute, number])[]> = {
  penalty: [
    ['finishing', 0.6],
    ['composure', 0.4],
  ],
  freeKick: [
    ['finishing', 0.5],
    ['crossing', 0.5],
  ],
  corner: [['crossing', 1]],
};

interface Row {
  metrics: number[];
  detail: number[];
}

/** Revision 11's place rule (→MATCH-16, T824). */
const PLACE = AC.place;
/** The 40 grid cells (`band * 5 + lane`) and the most slots a formation has, as the place cache sizes them. */
const CELL_COUNT = 40;
const SLOT_LIMIT = 16;
/** The same cell seen from the other side's attack frame: band and lane both mirrored. */
export const mirrorCell = (cell: number) => mirrorBand(cellBand(cell)) * 5 + (4 - cellLane(cell));
/** Place terms per pair of shapes (tactics and roles by slot), filled as they are read. */
const PLACE_TERMS = new Map<string, Float64Array>();
const shapeKey = (shape: readonly [ShapeSide, ShapeSide]) =>
  shape.map((s) => `${s.tactic}:${s.roles.join(',')}`).join('|');
/**
 * A slot's place term for an action in `cell` (his side's attack frame), in or out of possession:
 * max(`floor`, e^(−(d / `reach`)² / 2)), `d` the metres from the cell's centre to his role's place
 * for a ball there. Plain arithmetic, the square root and the portable `exp` (→ARCH-9).
 */
function placeTerm(
  shape: readonly [ShapeSide, ShapeSide],
  terms: Float64Array,
  side: AggregateSide,
  slot: number,
  cell: number,
  inPossession: boolean,
) {
  const at = ((side * 2 + (inPossession ? 1 : 0)) * SLOT_LIMIT + slot) * CELL_COUNT + cell;
  let term = terms[at]!;
  if (Number.isNaN(term)) {
    const x = dist(cellCentre(cell), placeFor(shape, side, slot, cell, inPossession)) / PLACE.reach;
    term = Math.max(PLACE.floor, exp(-(x * x) / 2));
    terms[at] = term;
  }
  return term;
}

/** The action classes whose expected totals the fitting keeps, by move kind; tackles and interceptions apart. */
const MOVE_CLASS: Readonly<Record<AggregateMoveKind, number>> = {
  short: 0,
  long: 0,
  cross: 1,
  cutBack: 1,
  through: 2,
  carry: 3,
  takeOn: 4,
};
const MOVE_CLASSES = 5;
const INTERCEPTION = 0,
  TACKLE = 1,
  WON_CLASSES = 2;
/** One group's split in the placed path: its class, the count split and its weights by line. */
export interface PlacedGroup {
  c: number;
  n: number;
  /** The unplaced weights (`SideLines.weights`). */
  w: readonly number[];
  /** The place-weighted weights; after `fitPlaced`, the scaled weights the split draws on. */
  u: number[];
}
/**
 * Proportional fitting (→MATCH-16, T824): with `E[p][c] = Σ_g n[g]·w[p][g] / Σ_q w[q][g]` each
 * line's expected count of class `c` under the unplaced weights, it finds scales `s[p][c]` by
 * `iterations` rounds so the placed weights `u[p][g]·s[p][c]` give each line the same expectation
 * again, and leaves them in each group's `u`. A line expected to do none keeps weight 0.
 */
export function fitPlaced(groups: readonly PlacedGroup[], lines: number, classes: number) {
  const expected = Array<number>(lines * classes).fill(0);
  for (const g of groups) {
    let total = 0;
    for (let p = 0; p < lines; p++) total += g.w[p]!;
    if (!(total > 0) || g.n <= 0) continue;
    for (let p = 0; p < lines; p++) expected[p * classes + g.c]! += (g.n * g.w[p]!) / total;
  }
  const scale = Array<number>(lines * classes).fill(1);
  const now = Array<number>(lines * classes).fill(0);
  for (let round = 0; round < PLACE.iterations; round++) {
    now.fill(0);
    for (const g of groups) {
      if (g.n <= 0) continue;
      let total = 0;
      for (let p = 0; p < lines; p++) total += g.u[p]! * scale[p * classes + g.c]!;
      if (!(total > 0)) continue;
      for (let p = 0; p < lines; p++)
        now[p * classes + g.c]! += (g.n * g.u[p]! * scale[p * classes + g.c]!) / total;
    }
    for (let i = 0; i < scale.length; i++)
      if (now[i]! > 0) scale[i] = (scale[i]! * expected[i]!) / now[i]!;
  }
  for (const g of groups)
    for (let p = 0; p < lines; p++) g.u[p] = g.u[p]! * scale[p * classes + g.c]!;
}

/** One side's lines, their exposures and cached weights while the match is attributed. */
class SideLines {
  readonly rows: Row[];
  private readonly cache = new Map<string, Map<TakerKey, number[]>>();
  /** Per period (regulation, extra), each role's weights by its `id` (T612). */
  private readonly byRole: (number[] | undefined)[][] = [
    Array<number[] | undefined>(roleCount).fill(undefined),
    Array<number[] | undefined>(roleCount).fill(undefined),
  ];
  private readonly expo = new Map<AggregatePeriod, AggregateExposure[]>();
  /** Per period, by attribute (and `:call` for the offside call's weight). */
  private readonly terms = new Map<AggregatePeriod, Map<string, number[]>>();
  /** Each line-slot pair's action weight, read once per action (T326): `plan` is fixed here. */
  private readonly actions = new Map<MatchAction, number[]>();
  private readonly slotCount: number;
  /** Each slot's line as `LINE_INDEX` numbers it (T612). */
  private readonly slotLines: number[];
  /** Lines present in each minute asked for, in line order (T326): the stints are fixed here. */
  private readonly presence = new Map<number, readonly { line: number; slot: number }[]>();
  /** One split's buffers of the side's line count, reused by every move group (T326). */
  readonly attempts: number[];
  readonly completed: number[];
  readonly broke: number[];
  readonly split: number[];
  /** Both sides' shape when the plan places its splits (revision 11, T824), else undefined. */
  readonly shape: readonly [ShapeSide, ShapeSide] | undefined;
  private readonly placeTerms: Float64Array | undefined;
  /** Per period, each role's share of every exposure in `exposuresOf` order, by its `id`. */
  private readonly sharesByRole: (number[] | undefined)[][] = [[], []];

  constructor(
    readonly side: AggregateSide,
    private readonly input: AggregateInput,
    private readonly plan: AggregatePlan,
    private readonly participation: AggregateParticipation,
  ) {
    this.shape = plan.placed === true ? plan.shape : undefined;
    if (this.shape) {
      const key = shapeKey(this.shape);
      let terms = PLACE_TERMS.get(key);
      if (!terms)
        PLACE_TERMS.set(key, (terms = new Float64Array(2 * 2 * SLOT_LIMIT * CELL_COUNT).fill(NaN)));
      this.placeTerms = terms;
    }
    this.rows = input.sides[side].lines.map(() => ({
      metrics: zeroMetrics(),
      detail: Array<number>(PLAYER_DETAIL_SIZE).fill(0),
    }));
    this.slotCount = input.sides[side].slots.length;
    this.slotLines = input.sides[side].slots.map((s) => LINE_INDEX[s.line]);
    const n = this.rows.length;
    this.attempts = Array<number>(n).fill(0);
    this.completed = Array<number>(n).fill(0);
    this.broke = Array<number>(n).fill(0);
    this.split = Array<number>(n).fill(0);
  }

  /** The plan's action weight of a line at a slot, the same value read once (T326). */
  private actionWeight(line: number, slot: number, action: MatchAction) {
    let byPair = this.actions.get(action);
    if (!byPair)
      this.actions.set(
        action,
        (byPair = Array<number>(this.rows.length * this.slotCount).fill(NaN)),
      );
    const at = line * this.slotCount + slot;
    let w = byPair[at]!;
    if (Number.isNaN(w)) {
      w = this.plan.sides[this.side].actionWeight(line, slot, action);
      byPair[at] = w;
    }
    return w;
  }

  private exposuresOf(period: AggregatePeriod) {
    let list = this.expo.get(period);
    if (!list) {
      const { from, to } = AGGREGATE_CONFIG.periods[period];
      list = exposures(this.participation, this.side, from, to);
      this.expo.set(period, list);
    }
    return list;
  }

  /** The line an incident names by his stable ID. */
  lineOf(id: string): number {
    return this.input.sides[this.side].lines.findIndex((l) => l.id === id);
  }

  /**
   * A line's share of a role over one exposure of `minutes` around `mid`. `terms[at]`, when
   * given, keeps the exposure's skill factor for the role's attribute: roles that read the same
   * attribute over the same exposure reuse it instead of reading the skill again (T285).
   */
  private share(
    line: number,
    slot: number,
    minutes: number,
    mid: number,
    role: Role,
    terms?: number[],
    at = 0,
  ) {
    let w = role.byLine[this.slotLines[slot]!]! * minutes;
    if (!(w > 0)) return 0;
    if (role.wide && this.input.sides[this.side].slots[slot]!.wide) w *= role.wide;
    if (role.action) w *= this.actionWeight(line, slot, role.action);
    let term = terms ? terms[at]! : NaN;
    if (Number.isNaN(term)) {
      if (role.call && OFFSIDE_CALL.spread > 0) {
        const own =
          this.input.access.own?.(this.side, line, role.attribute) ??
          this.input.access.skill(this.side, line, role.attribute, mid);
        term = exp((-(own - OFFSIDE_CALL.pivot) / OFFSIDE_CALL.spread) * AC.offsideCall);
      } else {
        const value = Math.max(1, this.input.access.skill(this.side, line, role.attribute, mid));
        term = (value / AC.attributeScale) ** AC.attributePower;
      }
      if (terms) terms[at] = term;
    }
    return w * term;
  }

  /** Per period and attribute: each exposure's skill factor, filled as roles read it. */
  private termsOf(period: AggregatePeriod, key: string, size: number) {
    let byAttribute = this.terms.get(period);
    if (!byAttribute) this.terms.set(period, (byAttribute = new Map()));
    let terms = byAttribute.get(key);
    if (!terms) byAttribute.set(key, (terms = Array<number>(size).fill(NaN)));
    return terms;
  }

  private cacheOf(period: AggregatePeriod) {
    let cache = this.cache.get(period);
    if (!cache) this.cache.set(period, (cache = new Map()));
    return cache;
  }

  /** Each line's weight for a role over a period: its minutes there, by slot, role and skill. */
  weights(period: AggregatePeriod, role: Role): number[] {
    const cache = this.byRole[period === 'regulation' ? 0 : 1]!;
    let out = cache[role.id];
    if (!out) {
      // Plain doubles: the same sums as a Float64Array, without its costly creation (T326).
      out = Array<number>(this.rows.length).fill(0);
      const list = this.exposuresOf(period);
      const terms = this.termsOf(
        period,
        role.call ? `${role.attribute}:call` : role.attribute,
        list.length,
      );
      for (let at = 0; at < list.length; at++) {
        const e = list[at]!;
        out[e.line]! += this.share(e.line, e.slot, e.minutes, e.mid, role, terms, at);
      }
      // Nobody of the role's lines played: whoever was on the pitch, by his minutes.
      if (!out.some((w) => w > 0)) for (const e of list) out[e.line]! += e.minutes;
      cache[role.id] = out;
    }
    return out;
  }

  /** Lines present in a minute, with their slot. */
  present(minute: number): readonly { line: number; slot: number }[] {
    let out = this.presence.get(minute);
    if (!out) {
      const list: { line: number; slot: number }[] = [];
      for (const s of this.participation.stints[this.side])
        if (s.from < minute && s.to >= minute) list.push({ line: s.line, slot: s.slot });
      out = list.sort((a, b) => a.line - b.line);
      this.presence.set(minute, out);
    }
    return out;
  }

  /** A line present in `minute` drawn by a role, never one of `except`. */
  pickAt(r: Rng, minute: number, role: Role, except: readonly number[] = []): number {
    const here = this.present(minute).filter((p) => !except.includes(p.line));
    const weights = here.map((p) => this.share(p.line, p.slot, 1, minute - 0.5, role));
    let i = weightedIndex(r, weights);
    if (i < 0) i = Math.floor(r() * here.length);
    return here[i]!.line;
  }

  /** The best taker present in `minute`: outfielders first, the keeper only when alone. */
  takerAt(minute: number, key: TakerKey): number {
    const here = this.present(minute);
    const outfield = here.filter((p) => p.slot !== 0);
    const pool = outfield.length ? outfield : here;
    let best = pool[0]!.line,
      value = -Infinity;
    for (const p of pool) {
      let v = 0;
      for (const [attribute, w] of TAKER[key])
        v += w * this.input.access.skill(this.side, p.line, attribute, minute - 0.5);
      if (v > value || (v === value && p.line < best)) [best, value] = [p.line, v];
    }
    return best;
  }

  /** Each line's minutes as the period's taker: the set-piece groups' weights. */
  takerWeights(period: AggregatePeriod, key: TakerKey): number[] {
    const cache = this.cacheOf(period);
    let out = cache.get(key);
    if (!out) {
      out = Array<number>(this.rows.length).fill(0);
      const { from, to } = AGGREGATE_CONFIG.periods[period];
      const bounds = [
        ...new Set([
          from,
          to,
          ...this.participation.stints[this.side].flatMap((s) => [s.from, s.to]),
        ]),
      ]
        .filter((b) => b >= from && b <= to)
        .sort((a, b) => a - b);
      for (let i = 1; i < bounds.length; i++) {
        const a = bounds[i - 1]!,
          b = bounds[i]!;
        if (b > a) out[this.takerAt(a + 1, key)]! += b - a;
      }
      cache.set(key, out);
    }
    return out;
  }

  /** The keeper in goal in a minute; anyone present if nobody keeps it. */
  keeperAt(minute: number): number {
    const here = this.present(minute);
    return (here.find((p) => p.slot === 0) ?? here[0]!).line;
  }

  /** A slot's place term for an action in `cell` (this side's attack frame; placed plans only). */
  private term(slot: number, cell: number, inPossession: boolean) {
    return placeTerm(this.shape!, this.placeTerms!, this.side, slot, cell, inPossession);
  }

  /** A role's share of each exposure of a period, `weights` before it sums them by line. */
  private exposureShares(period: AggregatePeriod, role: Role): number[] {
    const cache = this.sharesByRole[period === 'regulation' ? 0 : 1]!;
    let out = cache[role.id];
    if (!out) {
      const list = this.exposuresOf(period);
      const terms = this.termsOf(
        period,
        role.call ? `${role.attribute}:call` : role.attribute,
        list.length,
      );
      out = list.map((e, at) => this.share(e.line, e.slot, e.minutes, e.mid, role, terms, at));
      // Nobody of the role's lines played: whoever was on the pitch, by his minutes, as `weights`.
      if (!out.some((w) => w > 0)) out = list.map((e) => e.minutes);
      cache[role.id] = out;
    }
    return out;
  }

  /**
   * `weights` with each exposure's place term for an action in `cell` (this side's attack frame),
   * in or out of possession (→MATCH-16, T824): a new array, by line.
   */
  placedWeights(
    period: AggregatePeriod,
    role: Role,
    cell: number,
    inPossession: boolean,
  ): number[] {
    const list = this.exposuresOf(period);
    const shares = this.exposureShares(period, role);
    const out = Array<number>(this.rows.length).fill(0);
    for (let at = 0; at < list.length; at++) {
      const share = shares[at]!;
      if (share > 0) out[list[at]!.line]! += share * this.term(list[at]!.slot, cell, inPossession);
    }
    return out;
  }

  /** `pickAt` with each present slot's place term for an action in `cell` (this side's frame). */
  pickPlacedAt(r: Rng, minute: number, role: Role, cell: number, inPossession: boolean): number {
    const here = this.present(minute);
    const weights = here.map(
      (p) =>
        this.share(p.line, p.slot, 1, minute - 0.5, role) * this.term(p.slot, cell, inPossession),
    );
    let i = weightedIndex(r, weights);
    if (i < 0) i = Math.floor(r() * here.length);
    return here[i]!.line;
  }

  /**
   * A line drawn by `weights` other than `except`; when no other line weighs anything, by the
   * others' minutes in the period. An offside's receiver is never its passer (T824).
   */
  drawExcept(r: Rng, period: AggregatePeriod, weights: readonly number[], except: number): number {
    const others = weights.map((w, line) => (line === except ? 0 : w));
    let i = weightedIndex(r, others);
    if (i < 0) {
      const minutes = Array<number>(this.rows.length).fill(0);
      for (const e of this.exposuresOf(period))
        if (e.line !== except) minutes[e.line]! += e.minutes;
      i = weightedIndex(r, minutes);
    }
    return i < 0 ? except : i;
  }
}

/**
 * Splits `k` over `counts` so that no part exceeds its count: a hypergeometric draw, unit by unit
 * when there are few units, otherwise by clamped sequential binomials.
 */
function within(r: Rng, k: number, counts: readonly number[], out: number[]): number[] {
  // Into a buffer built like multinomialDraw's result, so both arrays this splits share one
  // element kind; zeroed first, the same draws as a fresh array (T326).
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    out[i] = 0;
    total += counts[i]!;
  }
  if (k <= 0) return out;
  if (k <= 4) {
    for (let unit = 0; unit < k; unit++) {
      let u = Math.floor(r() * total);
      for (let i = 0; i < counts.length; i++) {
        const free = counts[i]! - out[i]!;
        if (u < free) {
          out[i]!++;
          break;
        }
        u -= free;
      }
      total--;
    }
    return out;
  }
  for (let i = 0; i < counts.length && k > 0; i++) {
    const c = counts[i]!;
    if (c === 0) continue;
    const low = Math.max(0, k - (total - c)),
      high = Math.min(c, k);
    const x = Math.min(high, Math.max(low, binomialDraw(r, c, k / total)));
    out[i] = x;
    k -= x;
    total -= c;
  }
  return out;
}

/** A move group without pinned completions. */
const NO_PINS: readonly number[] = [];

/** What MATCH-13 reads of a move group's kind and cells, worked out once per group. */
interface MoveTraits {
  kind: AggregateMove['kind'];
  pass: boolean;
  fromBand: number;
  toBand: number;
  boxEntry: boolean;
  /** MATCH-13's cut-back by its cells (grid/record.ts `isCutBack`), whatever the move's kind. */
  cutBack: boolean;
  xt: number;
}
/** The 40 grid cells a move runs between (`band * 5 + lane`). */
const CELLS = 40;
/**
 * Traits by kind and cells, worked out once a process (T326): they read nothing else. A flat
 * array indexed by the numeric key instead of a map (T612).
 */
const TRAITS: (MoveTraits | undefined)[] = Array<MoveTraits | undefined>(
  AGGREGATE_MOVE_KINDS.length * CELLS * CELLS,
).fill(undefined);
function moveTraits(move: AggregateMove): MoveTraits {
  const key = (moveKindIndex(move.kind) * CELLS + move.from) * CELLS + move.to;
  let traits = TRAITS[key];
  if (!traits) TRAITS[key] = traits = traitsOf(move);
  return traits;
}
function traitsOf(move: AggregateMove): MoveTraits {
  return {
    kind: move.kind,
    pass: isPassKind(move.kind),
    fromBand: cellBand(move.from),
    toBand: cellBand(move.to),
    boxEntry: inBoxCell(move.to) && !inBoxCell(move.from),
    cutBack: isPassKind(move.kind) && isCutBack(move.from, move.to),
    xt: xtGain(move.from, move.to),
  };
}

/** Counters a line's attempts and completions of one move group earn (→MATCH-13). */
function creditMove(row: Row, move: MoveTraits, attempts: number, done: number, broke: number) {
  const m = row.metrics,
    d = row.detail;
  const { fromBand, toBand } = move;
  if (move.pass) {
    m[M.passes]! += attempts;
    m[M.completed]! += done;
    if (fromBand >= FINAL_THIRD_BAND) {
      d[PD.finalThirdPasses]! += attempts;
      d[PD.finalThirdCompleted]! += done;
    }
    if (toBand > fromBand) d[PD.progressivePasses]! += done;
    d[PD.lineBreakingPasses]! += broke;
    if (move.kind === 'cross') {
      d[PD.crosses]! += attempts;
      d[PD.crossesCompleted]! += done;
    }
    if (move.kind === 'through') {
      d[PD.throughBalls]! += attempts;
      d[PD.throughBallsCompleted]! += done;
    }
    if (move.cutBack) d[PD.cutBacks]! += done;
  } else {
    if (toBand > fromBand) d[PD.progressiveCarries]! += done;
    if (move.kind === 'takeOn') {
      d[PD.takeOns]! += attempts;
      m[M.dribbles]! += done;
    }
  }
  if (move.boxEntry) d[PD.boxEntries]! += done;
  if (toBand === FINAL_THIRD_BAND && fromBand < FINAL_THIRD_BAND) d[PD.frontOfBoxEntries]! += done;
  d[PD.xtAdded]! += done * move.xt;
}

/**
 * Player lines of one match from its team facts and participation (→MATCH-26/27): shots and their
 * key passes at their minutes, every move group, the ball won from the opponent, saves, fouls
 * committed and won, cards and minutes — each counted for players present, adding up exactly to
 * the side's row. Returns each side's lines in record order and the shot credits. A `trace`, when
 * given, receives a copy of every split drawn (T819); it changes no draw and no fact.
 */
export function attributePlayerFacts(
  input: AggregateInput,
  plan: AggregatePlan,
  participation: AggregateParticipation,
  facts: AggregateTeamFacts,
  streams: AggregateStreams,
  trace?: AggregateAttributionTrace,
): AggregatePlayerFacts {
  const sides = [
    new SideLines(0, input, plan, participation),
    new SideLines(1, input, plan, participation),
  ] as const;
  const credits: AggregateShotCredit[] = [];
  if (trace)
    for (const side of [0, 1] as const) {
      const ledger = facts.ledger.sides[side];
      if (trace.moves[side].length === 0)
        for (let i = 0; i < ledger.moves.length; i++) trace.moves[side].push(emptyTraceMove());
      if (trace.fouls[side].length === 0)
        for (let i = 0; i < ledger.fouled.length; i++)
          trace.fouls[side].push({ booked: [], fouled: [], fouler: [] });
    }
  for (const period of facts.ledger.periods)
    for (const side of [0, 1] as const)
      attributeSide(
        sideDraw(streams, 'attribution', side, period),
        period,
        side,
        sides,
        facts,
        participation,
        credits,
        trace,
      );
  for (const x of participation.incidents) {
    const d = sides[x.side].rows[sides[x.side].lineOf(x.player)]!.detail;
    if (x.kind === 'yellow' || x.kind === 'secondYellow') d[PD.yellowCards]!++;
    if (x.kind === 'red' || x.kind === 'secondYellow') d[PD.redCards]!++;
  }
  const out: [AggregateLine[], AggregateLine[]] = [[], []];
  for (const side of [0, 1] as const) {
    const minutes = playedMinutes(participation, side);
    for (const line of recordLines(input, participation, side)) {
      const row = sides[side].rows[line]!;
      row.metrics[M.minutes] = minutes.get(line) ?? 0;
      out[side].push({ line, metrics: row.metrics, detail: row.detail });
    }
  }
  return { sides: out, shots: credits.sort((a, b) => a.side - b.side || a.shot - b.shot) };
}

/**
 * A side's shots of a period, first: their minute fixes who could take them and who could have
 * made them. Returns, by move index, the lines whose completions the shots pinned.
 */
function creditShots(
  r: Rng,
  period: AggregatePeriod,
  side: AggregateSide,
  own: SideLines,
  opp: SideLines,
  facts: AggregateTeamFacts,
  credits: AggregateShotCredit[],
): Map<number, number[]> {
  const ledger = facts.ledger.sides[side];
  const pinned = new Map<number, number[]>();
  ledger.shots.forEach((shot, index) => {
    if (shot.period !== period) return;
    const move = shot.source >= 0 ? ledger.moves[shot.source]! : undefined;
    let shooter: number, passer: number | undefined;
    if (shot.kind === 'penalty') shooter = own.takerAt(shot.minute, 'penalty');
    else if (!move) shooter = own.takerAt(shot.minute, 'freeKick');
    else if (!isPassKind(move.kind)) shooter = own.pickAt(r, shot.minute, shooterRole(shot));
    else {
      passer = move.setPiece
        ? own.takerAt(shot.minute, move.setPiece === 'corner' ? 'corner' : 'freeKick')
        : own.pickAt(r, shot.minute, moveRole(move));
      shooter = own.pickAt(r, shot.minute, shooterRole(shot), [passer]);
    }
    if (move) {
      const actor = passer ?? shooter;
      pinned.set(shot.source, [...(pinned.get(shot.source) ?? []), actor]);
    }
    const goal = shot.outcome === 'goal';
    const m = own.rows[shooter]!.metrics;
    m[M.shots]!++;
    if (goal || shot.outcome === 'save') m[M.onTarget]!++;
    if (goal) m[M.goals]!++;
    own.rows[shooter]!.detail[PD.xg]! += shot.xg;
    if (passer !== undefined) {
      const p = own.rows[passer]!;
      p.detail[PD.keyPasses]!++;
      p.detail[PD.xa]! += shot.xg;
      if (shot.xg >= BIG_CHANCE) p.detail[PD.bigChancesCreated]!++;
      if (goal) p.metrics[M.assists]!++;
    }
    if (shot.outcome === 'save') opp.rows[opp.keeperAt(shot.minute)]!.metrics[M.saves]!++;
    credits.push({
      side,
      shot: index,
      minute: shot.minute,
      shooter,
      ...(passer !== undefined && { passer }),
    });
  });
  return pinned;
}

function attributeSide(
  r: Rng,
  period: AggregatePeriod,
  side: AggregateSide,
  sides: readonly [SideLines, SideLines],
  facts: AggregateTeamFacts,
  participation: AggregateParticipation,
  credits: AggregateShotCredit[],
  trace: AggregateAttributionTrace | undefined,
) {
  const own = sides[side],
    opp = sides[side === 0 ? 1 : 0];
  const ledger = facts.ledger.sides[side];
  const pinned = creditShots(r, period, side, own, opp, facts, credits);
  if (own.shape) {
    attributePlaced(r, period, side, sides, facts, participation, pinned, trace);
    return;
  }
  // Every move group of the period: pinned completions, then the rest by weight.
  const n = own.rows.length;
  /** Loose balls the opponent recovered in its high-turnover zone: band played to, count. */
  const loose: number[] = [];
  /** With a trace, the move index of each pushed loose entry, beside `loose`. */
  const looseMoves: number[] | undefined = trace && [];
  const moveTrace = trace?.moves[side];
  // Plain loops and per-group constants (T285): the same draws in the same order as before.
  for (let index = 0; index < ledger.moves.length; index++) {
    const move = ledger.moves[index]!;
    if (move.period !== period) continue;
    const pins = pinned.get(index) ?? NO_PINS;
    const weights = move.setPiece
      ? own.takerWeights(period, move.setPiece === 'corner' ? 'corner' : 'freeKick')
      : own.weights(period, moveRole(move));
    const attempts = multinomialInto(r, move.attempts - pins.length, weights, own.attempts);
    const completed = within(r, move.completed - pins.length, attempts, own.completed);
    for (const line of pins) {
      attempts[line]!++;
      completed[line]!++;
    }
    const broke = within(r, move.lineBreaking, completed, own.broke);
    const traits = moveTraits(move);
    for (let line = 0; line < n; line++)
      if (attempts[line]! > 0)
        creditMove(own.rows[line]!, traits, attempts[line]!, completed[line]!, broke[line]!);
    const traced: AggregateTraceMove | undefined = moveTrace?.[index];
    if (traced) {
      traced.attempts = attempts.slice();
      traced.completed = completed.slice();
      traced.broke = broke.slice();
    }
    if (move.offside > 0) {
      const offside = multinomialInto(
        r,
        move.offside,
        own.weights(period, ROLES.offside),
        own.split,
      );
      for (let line = 0; line < offside.length; line++)
        own.rows[line]!.detail[PD.offsides]! += offside[line]!;
      if (traced) traced.offside = offside.slice();
    }
    // The ball won from this group: interceptions where the pass was played to, tackles on a
    // failed carry or take-on where it started; in the winner's high-turnover zone (MATCH-13) each
    // starts a high turnover, as does a loose ball recovered there (ledger.ts `looseBalls`).
    const pass = traits.pass;
    if (pass && mirrorBand(traits.toBand) >= COUNTER_ZONES.highTurnover) {
      const k = looseBalls(move);
      if (k > 0) {
        loose.push(traits.toBand, k);
        looseMoves?.push(index);
      }
    }
    const won = pass ? move.intercepted : move.attempts - move.completed;
    if (won > 0) {
      const at = pass ? traits.toBand : traits.fromBand;
      const role = ROLES.defend(LAST_BAND - at, pass ? 'positioning' : 'tackling');
      const split = multinomialInto(r, won, opp.weights(period, role), opp.split);
      if (traced) traced.won = split.slice();
      for (let line = 0; line < split.length; line++) {
        const k = split[line]!;
        if (k === 0) continue;
        opp.rows[line]!.metrics[pass ? M.interceptions : M.tackles]! += k;
        if (mirrorBand(at) >= COUNTER_ZONES.highTurnover)
          opp.rows[line]!.detail[PD.highTurnovers]! += k;
      }
    }
  }
  // Fouls the opponent committed on this side: a booked foul is his, then the rest by weight.
  const { from, to } = AGGREGATE_CONFIG.periods[period];
  const fouls = ledger.fouled.filter((f) => f.period === period);
  const left = fouls.map((f) => f.n);
  /** With a trace, each row's entry, found by its index in the ledger's `fouled`. */
  const foulTrace: AggregateTraceFouls[] | undefined =
    trace && fouls.map((f) => trace.fouls[side][ledger.fouled.indexOf(f)]!);
  const booked = participation.incidents.filter(
    (x) =>
      x.side !== side &&
      x.kind !== 'sub' &&
      x.kind !== 'injury' &&
      x.reason !== 'dissent' &&
      x.minute > from &&
      x.minute <= to,
  );
  for (const card of booked) {
    const i = weightedIndex(r, left);
    if (i < 0) break;
    left[i]!--;
    const f = fouls[i]!;
    opp.rows[opp.lineOf(card.player)]!.detail[PD.fouls]!++;
    const fouled = own.pickAt(r, card.minute, ROLES.carry(cellBand(f.cell)));
    own.rows[fouled]!.detail[PD.foulsWon]!++;
    foulTrace?.[i]!.booked.push({
      fouler: opp.lineOf(card.player),
      fouled,
      incident: participation.incidents.indexOf(card),
    });
  }
  fouls.forEach((f, i) => {
    const k = left[i]!;
    if (k === 0) return;
    const band = cellBand(f.cell);
    const fouledLines = multinomialDraw(r, k, own.weights(period, ROLES.carry(band)));
    fouledLines.forEach((x, line) => (own.rows[line]!.detail[PD.foulsWon]! += x));
    const role = ROLES.defend(LAST_BAND - band, 'tackling');
    const foulerLines = multinomialDraw(r, k, opp.weights(period, role));
    foulerLines.forEach((x, line) => (opp.rows[line]!.detail[PD.fouls]! += x));
    if (foulTrace) {
      foulTrace[i]!.fouled = fouledLines.slice();
      foulTrace[i]!.fouler = foulerLines.slice();
    }
  });
  // Who recovered the loose balls, drawn last so every split above keeps its draws (T327).
  for (let i = 0; i < loose.length; i += 2) {
    const role = ROLES.defend(LAST_BAND - loose[i]!, 'positioning');
    const recovered = multinomialDraw(r, loose[i + 1]!, opp.weights(period, role));
    recovered.forEach((x, line) => (opp.rows[line]!.detail[PD.highTurnovers]! += x));
    if (looseMoves) moveTrace![looseMoves[i / 2]!]!.recovered = recovered.slice();
  }
}

/**
 * `attributeSide` after the shots under the place rule (revision 11, →MATCH-16, T824): every
 * open-play move group and every ball won is split on weights that read the slot's place for it,
 * fitted per side and period so each line's expected count of each action class is the unplaced
 * one's; each offside pass names a receiver other than its passer; fouls weigh the fouled man's
 * place in possession and the fouler's out of it, without the fitting. Set-piece deliveries keep
 * their taker and loose balls are recovered as before. Its draws need not match the unplaced
 * path's: nothing compares the two fixture by fixture.
 */
function attributePlaced(
  r: Rng,
  period: AggregatePeriod,
  side: AggregateSide,
  sides: readonly [SideLines, SideLines],
  facts: AggregateTeamFacts,
  participation: AggregateParticipation,
  pinned: ReadonlyMap<number, readonly number[]>,
  trace: AggregateAttributionTrace | undefined,
) {
  const own = sides[side],
    opp = sides[side === 0 ? 1 : 0];
  const ledger = facts.ledger.sides[side];
  const n = own.rows.length;
  // Each group's fitted weights before any draw: the open-play attempts by this side's place where
  // they start, the ball won by the winner's place where the group ends, seen from his end.
  const attemptsOf: (PlacedGroup | undefined)[] = [];
  const wonOf: (PlacedGroup | undefined)[] = [];
  for (let index = 0; index < ledger.moves.length; index++) {
    const move = ledger.moves[index]!;
    if (move.period !== period) continue;
    const traits = moveTraits(move);
    if (!move.setPiece) {
      const role = moveRole(move);
      attemptsOf[index] = {
        c: MOVE_CLASS[move.kind],
        n: move.attempts - (pinned.get(index)?.length ?? 0),
        w: own.weights(period, role),
        u: own.placedWeights(period, role, move.from, true),
      };
    }
    const won = traits.pass ? move.intercepted : move.attempts - move.completed;
    if (won > 0) {
      const at = traits.pass ? traits.toBand : traits.fromBand;
      const role = ROLES.defend(LAST_BAND - at, traits.pass ? 'positioning' : 'tackling');
      wonOf[index] = {
        c: traits.pass ? INTERCEPTION : TACKLE,
        n: won,
        w: opp.weights(period, role),
        u: opp.placedWeights(period, role, mirrorCell(move.to), false),
      };
    }
  }
  const listed = (g: PlacedGroup | undefined): g is PlacedGroup => g !== undefined;
  fitPlaced(attemptsOf.filter(listed), n, MOVE_CLASSES);
  fitPlaced(wonOf.filter(listed), opp.rows.length, WON_CLASSES);
  const loose: number[] = [];
  const looseMoves: number[] | undefined = trace && [];
  const moveTrace = trace?.moves[side];
  for (let index = 0; index < ledger.moves.length; index++) {
    const move = ledger.moves[index]!;
    if (move.period !== period) continue;
    const pins = pinned.get(index) ?? NO_PINS;
    const weights = move.setPiece
      ? own.takerWeights(period, move.setPiece === 'corner' ? 'corner' : 'freeKick')
      : attemptsOf[index]!.u;
    const attempts = multinomialInto(r, move.attempts - pins.length, weights, own.attempts);
    const completed = within(r, move.completed - pins.length, attempts, own.completed);
    for (const line of pins) {
      attempts[line]!++;
      completed[line]!++;
    }
    const broke = within(r, move.lineBreaking, completed, own.broke);
    const traits = moveTraits(move);
    for (let line = 0; line < n; line++)
      if (attempts[line]! > 0)
        creditMove(own.rows[line]!, traits, attempts[line]!, completed[line]!, broke[line]!);
    const traced: AggregateTraceMove | undefined = moveTrace?.[index];
    if (traced) {
      traced.attempts = attempts.slice();
      traced.completed = completed.slice();
      traced.broke = broke.slice();
    }
    if (move.offside > 0) {
      // Who played each offside pass: among the group's failed attempts; who was caught: one of
      // his teammates near where it was played to (→MATCH-18), never the passer himself.
      const failed = attempts.map((k, line) => k - completed[line]!);
      const passers = within(r, move.offside, failed, own.split);
      const receivers = own.placedWeights(period, ROLES.offside, move.to, true);
      const caught = Array<number>(n).fill(0);
      const pairs: [number, number][] = [];
      for (let passer = 0; passer < n; passer++)
        for (let k = 0; k < passers[passer]!; k++) {
          const receiver = own.drawExcept(r, period, receivers, passer);
          caught[receiver]!++;
          pairs.push([passer, receiver]);
        }
      for (let line = 0; line < n; line++) own.rows[line]!.detail[PD.offsides]! += caught[line]!;
      if (traced) {
        traced.offside = caught;
        traced.offsidePairs = pairs;
      }
    }
    const pass = traits.pass;
    if (pass && mirrorBand(traits.toBand) >= COUNTER_ZONES.highTurnover) {
      const k = looseBalls(move);
      if (k > 0) {
        loose.push(traits.toBand, k);
        looseMoves?.push(index);
      }
    }
    const won = wonOf[index];
    if (won) {
      const at = pass ? traits.toBand : traits.fromBand;
      const split = multinomialInto(r, won.n, won.u, opp.split);
      if (traced) traced.won = split.slice();
      for (let line = 0; line < split.length; line++) {
        const k = split[line]!;
        if (k === 0) continue;
        opp.rows[line]!.metrics[pass ? M.interceptions : M.tackles]! += k;
        if (mirrorBand(at) >= COUNTER_ZONES.highTurnover)
          opp.rows[line]!.detail[PD.highTurnovers]! += k;
      }
    }
  }
  // Fouls the opponent committed on this side, at their cell: the fouled man in possession there,
  // the fouler out of it; a booked foul is the carded player's.
  const { from, to } = AGGREGATE_CONFIG.periods[period];
  const fouls = ledger.fouled.filter((f) => f.period === period);
  const left = fouls.map((f) => f.n);
  const foulTrace: AggregateTraceFouls[] | undefined =
    trace && fouls.map((f) => trace.fouls[side][ledger.fouled.indexOf(f)]!);
  const booked = participation.incidents.filter(
    (x) =>
      x.side !== side &&
      x.kind !== 'sub' &&
      x.kind !== 'injury' &&
      x.reason !== 'dissent' &&
      x.minute > from &&
      x.minute <= to,
  );
  for (const card of booked) {
    const i = weightedIndex(r, left);
    if (i < 0) break;
    left[i]!--;
    const f = fouls[i]!;
    opp.rows[opp.lineOf(card.player)]!.detail[PD.fouls]!++;
    const role = ROLES.carry(cellBand(f.cell));
    const fouled = own.pickPlacedAt(r, card.minute, role, f.cell, true);
    own.rows[fouled]!.detail[PD.foulsWon]!++;
    foulTrace?.[i]!.booked.push({
      fouler: opp.lineOf(card.player),
      fouled,
      incident: participation.incidents.indexOf(card),
    });
  }
  fouls.forEach((f, i) => {
    const k = left[i]!;
    if (k === 0) return;
    const band = cellBand(f.cell);
    const fouledWeights = own.placedWeights(period, ROLES.carry(band), f.cell, true);
    const fouledLines = multinomialDraw(r, k, fouledWeights);
    fouledLines.forEach((x, line) => (own.rows[line]!.detail[PD.foulsWon]! += x));
    const role = ROLES.defend(LAST_BAND - band, 'tackling');
    const foulerWeights = opp.placedWeights(period, role, mirrorCell(f.cell), false);
    const foulerLines = multinomialDraw(r, k, foulerWeights);
    foulerLines.forEach((x, line) => (opp.rows[line]!.detail[PD.fouls]! += x));
    if (foulTrace) {
      foulTrace[i]!.fouled = fouledLines.slice();
      foulTrace[i]!.fouler = foulerLines.slice();
    }
  });
  // Who recovered the loose balls, unplaced, as revisions up to 10 draw them.
  for (let i = 0; i < loose.length; i += 2) {
    const role = ROLES.defend(LAST_BAND - loose[i]!, 'positioning');
    const recovered = multinomialDraw(r, loose[i + 1]!, opp.weights(period, role));
    recovered.forEach((x, line) => (opp.rows[line]!.detail[PD.highTurnovers]! += x));
    if (looseMoves) moveTrace![looseMoves[i / 2]!]!.recovered = recovered.slice();
  }
}

function emptyTraceMove(): AggregateTraceMove {
  return { attempts: [], completed: [], broke: [], offside: [], won: [], recovered: [] };
}
