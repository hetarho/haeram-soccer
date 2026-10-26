import {
  eraRules,
  modelAtLeast,
  DEFAULT_SUB_POLICY,
  type EraRules,
  type SubPolicy,
  type DecideRule,
} from './rules';
export {
  eraRules,
  modelAtLeast,
  DEFAULT_SUB_POLICY,
  isLevel,
  type EraRules,
  type SubPolicy,
  type DecideRule,
} from './rules';
/** Everything a grid match needs before kick-off: era rules, rosters, bench, takers and bends (→MATCH-2, MATCH-18, MATCH-20, CLUB-6). */
import type { Club, Fixture, Player, Tactic, World } from '../../../contracts/src/types';
import { activeMatchModel, type MatchModelRevision } from '../../../contracts/src/match-model';
import { bestRoleAt, FORMATIONS, lineOf } from '../player';
import { clubManager } from '../managerMarket';
import { activePlayers, ownMultiplier, slotOvr } from '../player-state';
import { isInjured, squad } from '../world';
import { prepareMatch, type Prepared } from '../match';
import { HOST_MATH, PORTABLE_MATH } from '../portable-math';
import { isUnavailable } from '../discipline';
import { subPolicyFor } from './changes';
import { playerTendencies, type PlayerTendencies } from './tendencies';

/** Roster indexes of the set-piece takers. */
export interface Takers {
  penalty: number;
  directFreeKick: number;
  corner: number;
}

/** Picks each taker from the XI by his key; the goalkeeper (index 0) takes none unless alone; ties go to the lower index. */
export function takersFor(xi: readonly Player[]): Takers {
  const best = (key: (p: Player) => number) => {
    let index = xi.length > 1 ? 1 : 0;
    for (let i = index + 1; i < xi.length; i++) if (key(xi[i]!) > key(xi[index]!)) index = i;
    return index;
  };
  return {
    penalty: best((p) => 0.6 * p.attrs.finishing + 0.4 * p.attrs.composure),
    directFreeKick: best((p) => 0.5 * p.attrs.finishing + 0.5 * p.attrs.crossing),
    corner: best((p) => p.attrs.crossing),
  };
}

/**
 * The named substitutes. The own club picks among its active, fit, available players; another
 * club names squad places behind its XI in order (→CLUB-6).
 */
export function benchFor(
  w: World,
  club: Club,
  xi: readonly Player[],
  era: EraRules,
  unavailable: (p: Player) => boolean = () => false,
): Player[] {
  if (era.named === 0) return [];
  const taken = new Set(xi);
  if (club.id !== w.playerClub)
    return squad(w, club)
      .filter((p) => !taken.has(p) && !unavailable(p))
      .slice(0, era.named);
  const slots = FORMATIONS[w.tactic].slots;
  const pool = activePlayers(w).filter((p) => !taken.has(p) && !isInjured(w, p) && !unavailable(p));
  // His best effective OVR over the slots of a line in the applied formation (no line: the goalkeeper's).
  const level = (p: Player, line?: string) =>
    slots.reduce(
      (best, slot, i) =>
        (line === undefined ? i === 0 : lineOf(slot.position) === line)
          ? Math.max(best, slotOvr(p, slot, ownMultiplier(p)))
          : best,
      -Infinity,
    );
  const bench: Player[] = [];
  const pick = (line?: string) => {
    let chosen: Player | undefined,
      value = -Infinity;
    for (const p of pool) {
      const v = level(p, line);
      if (v > value) [chosen, value] = [p, v];
    }
    if (!chosen) return false;
    pool.splice(pool.indexOf(chosen), 1);
    bench.push(chosen);
    return true;
  };
  if (era.named >= 3) pick();
  for (let line = 0; bench.length < era.named && pool.length; line++) {
    if (!pick(['DF', 'MF', 'FW'][line % 3])) break;
  }
  return bench;
}

/**
 * Each side's matchday roster (→MATCH-19, MATCH-20, LEAGUE-15): the prepared XI in slot order, then
 * the era's named substitutes, nobody injured or banned for this fixture among them. The XI already
 * leaves out whoever it can; with `replace`, the one rule of both candidate paths, a starter it had
 * to keep while unavailable is replaced by the best available substitute for his slot. The
 * pre-feature grid keeps him (`replace` false), as its settled matches always have.
 */
export function fixtureRosters(
  w: World,
  f: Fixture,
  prepared: Pick<Prepared, 'teams' | 'squads' | 'tactics'>,
  era: EraRules,
  replace = true,
): [Player[], Player[]] {
  return ([0, 1] as const).map((side) => {
    const club = prepared.teams[side];
    const out = (p: Player) => isUnavailable(w, p, club.id, f);
    const xi = [...prepared.squads[side]];
    const bench = benchFor(w, club, xi, era, out);
    if (replace) {
      const slots = FORMATIONS[prepared.tactics[side]].slots;
      xi.forEach((p, slot) => {
        if (!out(p) || bench.length === 0) return;
        let best = 0;
        for (let i = 1; i < bench.length; i++)
          if (slotOvr(bench[i]!, slots[slot]!) > slotOvr(bench[best]!, slots[slot]!)) best = i;
        xi[slot] = bench.splice(best, 1)[0]!;
      });
    }
    return [...xi, ...bench];
  }) as [Player[], Player[]];
}

/** Percentage-point style and synergy bends of a side's play (→STAFF-14); all zero for another club. */
export interface StyleBend {
  pass: number;
  possession: number;
  shot: number;
  defense: number;
  lineHigh: number;
  lineLow: number;
}

export interface GridSetup {
  w: World;
  f: Fixture;
  /** The match stream. */
  r: () => number;
  tactics: [Tactic, Tactic];
  /** 11 starters in slot order, then the bench. */
  rosters: [Player[], Player[]];
  bench: [number, number];
  takers: [Takers, Takers];
  shift: [number, number];
  multiplier: [(p: Player) => number, (p: Player) => number];
  drain: [number, number];
  bends: [StyleBend, StyleBend];
  managers: [SubPolicy, SubPolicy];
  pressing: [boolean, boolean];
  era: EraRules;
  own?: 0 | 1;
  decide?: DecideRule;
  observe: boolean;
  recordPlayers: boolean;
  /** The match model this fixture plays; absent is the pre-feature model (→SAVE-23). */
  model?: MatchModelRevision;
  /**
   * From revision 2: each roster player's tendencies under his side's manager in his matchday
   * role, in roster order, computed once per match (→PLAYER-26, STAFF-46; T432 and T433 read them).
   */
  tendencies?: [PlayerTendencies[], PlayerTendencies[]];
  /**
   * Measurement only, never set in play (T384): each offside draw as side, receiver, chance,
   * whether it was called and his 판단력 on the duels' scale, kept outside the record.
   */
  offsideDraws?: [0 | 1, number, number, 0 | 1, number][];
}

/**
 * One side's tendencies (→PLAYER-26): what his club's manager gives him (ours, or the named
 * manager of a club nobody owns, →STAFF-46), a starter in his slot's role and a substitute in his
 * best role at his position. They draw only each player's own personality stream.
 */
function sideTendencies(
  w: World,
  club: string,
  tactic: Tactic,
  roster: readonly Player[],
  starters: number,
): PlayerTendencies[] {
  const manager =
    club === w.playerClub
      ? w.manager
      : clubManager(
          w,
          w.clubs.find((one) => one.id === club)!,
        );
  const slots = FORMATIONS[tactic].slots;
  return roster.map((p, i) =>
    playerTendencies(
      p,
      manager,
      i < starters && i < slots.length ? slots[i]!.role : bestRoleAt(p.attrs, p.position),
    ),
  );
}

const NO_BEND: StyleBend = { pass: 0, possession: 0, shot: 0, defense: 0, lineHigh: 0, lineLow: 0 };

export function buildGridSetup(
  w: World,
  f: Fixture,
  opts: {
    observe: boolean;
    recordPlayers: boolean;
    decide?: DecideRule;
    /** Test-only: play these tactics instead of the clubs' own. */
    tactics?: [Tactic, Tactic];
    /**
     * Tests and measurements only: play this candidate revision instead of the world's active
     * model. It draws nothing, so generation, recruitment and finance streams are untouched.
     */
    model?: MatchModelRevision;
  },
): GridSetup {
  const model = opts.model ?? activeMatchModel(w);
  // The candidate's form and gap on the portable table, as `GridState.math` binds it (T358).
  const prepared = prepareMatch(w, f, model === undefined ? HOST_MATH : PORTABLE_MATH, model);
  const { ownSide, style, synergy } = prepared;
  const tactics = opts.tactics ?? prepared.tactics;
  const era = eraRules(f.year);
  // Nobody injured or banned for this fixture sits on the bench (→MATCH-19, →LEAGUE-15).
  const rosters = fixtureRosters(w, f, prepared, era, model !== undefined);
  const xi = [prepared.squads[0].length, prepared.squads[1].length] as const;
  const bends = [0, 1].map((side) =>
    side === ownSide
      ? {
          pass: style!.pass + synergy!.pass,
          possession: style!.possession + synergy!.possession,
          shot: style!.shot,
          defense: style!.defense + synergy!.defense,
          lineHigh: style!.lineHigh + synergy!.lineHigh,
          lineLow: style!.lineLow,
        }
      : { ...NO_BEND },
  ) as [StyleBend, StyleBend];
  return {
    w,
    f,
    r: prepared.r,
    tactics,
    rosters,
    bench: [rosters[0].length - xi[0], rosters[1].length - xi[1]],
    takers: [takersFor(rosters[0].slice(0, xi[0])), takersFor(rosters[1].slice(0, xi[1]))],
    shift: [prepared.shift[0]!, prepared.shift[1]!],
    multiplier: [prepared.multiplier[0]!, prepared.multiplier[1]!],
    drain: [prepared.drain[0]!, prepared.drain[1]!],
    bends,
    managers: [0, 1].map((side) =>
      side === ownSide ? subPolicyFor(w.manager) : { ...DEFAULT_SUB_POLICY },
    ) as [SubPolicy, SubPolicy],
    pressing: [tactics[0] === 'press', tactics[1] === 'press'],
    era,
    ...(ownSide === undefined ? {} : { own: ownSide }),
    ...(opts.decide ? { decide: opts.decide } : {}),
    observe: opts.observe,
    recordPlayers: opts.recordPlayers,
    ...(model ? { model } : {}),
    ...(modelAtLeast({ model }, 2) && {
      tendencies: [
        sideTendencies(w, f.home, tactics[0], rosters[0], xi[0]),
        sideTendencies(w, f.away, tactics[1], rosters[1], xi[1]),
      ] as [PlayerTendencies[], PlayerTendencies[]],
    }),
  };
}
