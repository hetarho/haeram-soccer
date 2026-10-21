/**
 * Named player lines from one aggregate match (→MATCH-11, MATCH-13, MATCH-26, MATCH-27): every
 * group of the ledger is split among the players who were on the pitch for it, by their slot's
 * line, role and play traits and the attribute the action reads. Shots are credited first, at
 * their minute, to a shooter present then and — for a chance a pass made — a key passer who holds
 * one of that pass group's completions, so goals, assists, shots, key passes, xG and xA are the
 * same chances. Every split is of an exact count, so player lines add up to the team row under
 * each definition; nothing is drawn independently of the team facts.
 */
import { PD, PLAYER_DETAIL_SIZE } from '../../../contracts/src/detail';
import type { Line } from '../../../contracts/src/player';
import { cellBand } from '../grid/pitch';
import { M } from '../grid/record';
import type { MatchAction } from '../match';
import { zeroMetrics } from '../primitives';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC, AGGREGATE_CONFIG } from './config';
import { inBoxCell, isPassKind, xtGain } from './ledger';
import {
  binomialDraw,
  exposures,
  multinomialDraw,
  playedMinutes,
  recordLines,
  sideDraw,
  weightedIndex,
  type AggregateExposure,
} from './participation';
import type {
  AggregateAttribute,
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
} from './types';

type Rng = () => number;
type Table = Readonly<Record<Line, number>>;

/** MATCH-13's definitions as the ledger reads them (ledger.ts `sideCounters`). */
const FINAL_THIRD_BAND = 5;
const HIGH_TURNOVER_BAND = 2;
const BIG_CHANCE = 30;
const LAST_BAND = 7;

/** What makes a line do an action: his slot's line, a flank bonus, the attribute and the action. */
interface Role {
  table: Table;
  attribute: AggregateAttribute;
  action?: MatchAction;
  wide?: number;
}
const byBand = (rows: Readonly<Record<Line, readonly number[]>>, band: number): Table => ({
  GK: rows.GK[band]!,
  DF: rows.DF[band]!,
  MF: rows.MF[band]!,
  FW: rows.FW[band]!,
});
const BANDS = Array.from({ length: LAST_BAND + 1 }, (_, band) => band);
const makeRole = (r: Role): Role => r;
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
  offside: makeRole({ table: AC.offside, attribute: 'pace', action: 'run' }),
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

/** One side's lines, their exposures and cached weights while the match is attributed. */
class SideLines {
  readonly rows: Row[];
  private readonly cache = new Map<string, Map<Role | TakerKey, Float64Array>>();
  private readonly expo = new Map<AggregatePeriod, AggregateExposure[]>();
  private readonly terms = new Map<AggregatePeriod, Map<AggregateAttribute, Float64Array>>();

  constructor(
    readonly side: AggregateSide,
    private readonly input: AggregateInput,
    private readonly plan: AggregatePlan,
    private readonly participation: AggregateParticipation,
  ) {
    this.rows = input.sides[side].lines.map(() => ({
      metrics: zeroMetrics(),
      detail: Array<number>(PLAYER_DETAIL_SIZE).fill(0),
    }));
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
    terms?: Float64Array,
    at = 0,
  ) {
    const s = this.input.sides[this.side].slots[slot]!;
    let w = role.table[s.line] * minutes;
    if (!(w > 0)) return 0;
    if (role.wide && s.wide) w *= role.wide;
    if (role.action) w *= this.plan.sides[this.side].actionWeight(line, slot, role.action);
    let term = terms ? terms[at]! : NaN;
    if (Number.isNaN(term)) {
      const value = Math.max(1, this.input.access.skill(this.side, line, role.attribute, mid));
      term = (value / AC.attributeScale) ** AC.attributePower;
      if (terms) terms[at] = term;
    }
    return w * term;
  }

  /** Per period and attribute: each exposure's skill factor, filled as roles read it. */
  private termsOf(period: AggregatePeriod, attribute: AggregateAttribute, size: number) {
    let byAttribute = this.terms.get(period);
    if (!byAttribute) this.terms.set(period, (byAttribute = new Map()));
    let terms = byAttribute.get(attribute);
    if (!terms) byAttribute.set(attribute, (terms = new Float64Array(size).fill(NaN)));
    return terms;
  }

  private cacheOf(period: AggregatePeriod) {
    let cache = this.cache.get(period);
    if (!cache) this.cache.set(period, (cache = new Map()));
    return cache;
  }

  /** Each line's weight for a role over a period: its minutes there, by slot, role and skill. */
  weights(period: AggregatePeriod, role: Role): Float64Array {
    const cache = this.cacheOf(period);
    let out = cache.get(role);
    if (!out) {
      out = new Float64Array(this.rows.length);
      const list = this.exposuresOf(period);
      const terms = this.termsOf(period, role.attribute, list.length);
      for (let at = 0; at < list.length; at++) {
        const e = list[at]!;
        out[e.line]! += this.share(e.line, e.slot, e.minutes, e.mid, role, terms, at);
      }
      // Nobody of the role's lines played: whoever was on the pitch, by his minutes.
      if (!out.some((w) => w > 0)) for (const e of list) out[e.line]! += e.minutes;
      cache.set(role, out);
    }
    return out;
  }

  /** Lines present in a minute, with their slot. */
  present(minute: number): { line: number; slot: number }[] {
    const out: { line: number; slot: number }[] = [];
    for (const s of this.participation.stints[this.side])
      if (s.from < minute && s.to >= minute) out.push({ line: s.line, slot: s.slot });
    return out.sort((a, b) => a.line - b.line);
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
  takerWeights(period: AggregatePeriod, key: TakerKey): Float64Array {
    const cache = this.cacheOf(period);
    let out = cache.get(key);
    if (!out) {
      out = new Float64Array(this.rows.length);
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
}

/**
 * Splits `k` over `counts` so that no part exceeds its count: a hypergeometric draw, unit by unit
 * when there are few units, otherwise by clamped sequential binomials.
 */
function within(r: Rng, k: number, counts: readonly number[]): number[] {
  // Built like multinomialDraw's result, so both arrays this splits share one element kind.
  const out = Array<number>(counts.length).fill(0);
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i]!;
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
  xt: number;
}
function moveTraits(move: AggregateMove): MoveTraits {
  return {
    kind: move.kind,
    pass: isPassKind(move.kind),
    fromBand: cellBand(move.from),
    toBand: cellBand(move.to),
    boxEntry: inBoxCell(move.to) && !inBoxCell(move.from),
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
    if (move.kind === 'cutBack') d[PD.cutBacks]! += done;
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
 * the side's row. Returns each side's lines in record order and the shot credits.
 */
export function attributePlayerFacts(
  input: AggregateInput,
  plan: AggregatePlan,
  participation: AggregateParticipation,
  facts: AggregateTeamFacts,
  streams: AggregateStreams,
): AggregatePlayerFacts {
  const sides = [
    new SideLines(0, input, plan, participation),
    new SideLines(1, input, plan, participation),
  ] as const;
  const credits: AggregateShotCredit[] = [];
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

function attributeSide(
  r: Rng,
  period: AggregatePeriod,
  side: AggregateSide,
  sides: readonly [SideLines, SideLines],
  facts: AggregateTeamFacts,
  participation: AggregateParticipation,
  credits: AggregateShotCredit[],
) {
  const own = sides[side],
    opp = sides[side === 0 ? 1 : 0];
  const ledger = facts.ledger.sides[side];
  // Shots first: their minute fixes who could take them and who could have made them.
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
  // Every move group of the period: pinned completions, then the rest by weight.
  const n = own.rows.length;
  // Plain loops and per-group constants (T285): the same draws in the same order as before.
  for (let index = 0; index < ledger.moves.length; index++) {
    const move = ledger.moves[index]!;
    if (move.period !== period) continue;
    const pins = pinned.get(index) ?? NO_PINS;
    const weights = move.setPiece
      ? own.takerWeights(period, move.setPiece === 'corner' ? 'corner' : 'freeKick')
      : own.weights(period, moveRole(move));
    const attempts = multinomialDraw(r, move.attempts - pins.length, weights);
    const completed = within(r, move.completed - pins.length, attempts);
    for (const line of pins) {
      attempts[line]!++;
      completed[line]!++;
    }
    const broke = within(r, move.lineBreaking, completed);
    const traits = moveTraits(move);
    for (let line = 0; line < n; line++)
      if (attempts[line]! > 0)
        creditMove(own.rows[line]!, traits, attempts[line]!, completed[line]!, broke[line]!);
    if (move.offside > 0) {
      const offside = multinomialDraw(r, move.offside, own.weights(period, ROLES.offside));
      for (let line = 0; line < offside.length; line++)
        own.rows[line]!.detail[PD.offsides]! += offside[line]!;
    }
    // The ball won from this group: interceptions where the pass was played to, tackles on a
    // failed carry or take-on where it started; in the loser's defensive third a high turnover.
    const pass = traits.pass;
    const won = pass ? move.intercepted : move.attempts - move.completed;
    if (won > 0) {
      const at = pass ? traits.toBand : traits.fromBand;
      const role = ROLES.defend(LAST_BAND - at, pass ? 'positioning' : 'tackling');
      const split = multinomialDraw(r, won, opp.weights(period, role));
      for (let line = 0; line < split.length; line++) {
        const k = split[line]!;
        if (k === 0) continue;
        opp.rows[line]!.metrics[pass ? M.interceptions : M.tackles]! += k;
        if (at <= HIGH_TURNOVER_BAND) opp.rows[line]!.detail[PD.highTurnovers]! += k;
      }
    }
  }
  // Fouls the opponent committed on this side: a booked foul is his, then the rest by weight.
  const { from, to } = AGGREGATE_CONFIG.periods[period];
  const fouls = ledger.fouled.filter((f) => f.period === period);
  const left = fouls.map((f) => f.n);
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
  }
  fouls.forEach((f, i) => {
    const k = left[i]!;
    if (k === 0) return;
    const band = cellBand(f.cell);
    multinomialDraw(r, k, own.weights(period, ROLES.carry(band))).forEach(
      (x, line) => (own.rows[line]!.detail[PD.foulsWon]! += x),
    );
    const role = ROLES.defend(LAST_BAND - band, 'tackling');
    multinomialDraw(r, k, opp.weights(period, role)).forEach(
      (x, line) => (opp.rows[line]!.detail[PD.fouls]! += x),
    );
  });
}
