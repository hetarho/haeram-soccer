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
import type { Fixture, Player, Tactic, World } from '../../../contracts/src/types';
import { activeMatchModel, type MatchModelRevision } from '../../../contracts/src/match-model';
import { bestRoleAt, FORMATIONS } from '../player';
import { clubManager } from '../managerMarket';
import { prepareMatch } from '../match';
import { PORTABLE_MATH } from '../portable-math';
import { takersFor, type Takers } from '../match/bench';
import { fixtureRosters } from '../match/roster';
import { subPolicyFor } from './changes';
import { playerTendencies, type PlayerTendencies } from '../match/tendencies';
export { ownBench, takersFor, type Takers } from '../match/bench';
export { benchFor, fixtureRosters } from '../match/roster';

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
    /**
     * The match lab only (→LAB-2): these matchday rosters (XI in slot order, then the bench) and
     * tactics instead of the clubs' own, with neutral context (`LabFixture`); both sides take the
     * home club's manager for their tendencies.
     */
    lab?: { rosters: [Player[], Player[]]; tactics: [Tactic, Tactic] };
  },
): GridSetup {
  const model = opts.model ?? activeMatchModel(w);
  const lab = opts.lab && {
    xis: ([0, 1] as const).map((side) =>
      opts.lab!.rosters[side].slice(0, FORMATIONS[opts.lab!.tactics[side]].slots.length),
    ) as [Player[], Player[]],
    tactics: opts.lab.tactics,
  };
  // Form and gap on the portable table, as `GridState.math` binds it (T358, T713).
  const prepared = prepareMatch(w, f, PORTABLE_MATH, model, lab);
  const { ownSide, style, synergy } = prepared;
  const tactics = opts.tactics ?? prepared.tactics;
  const era = eraRules(f.year);
  // Nobody injured or banned for this fixture sits on the bench (→MATCH-19, →LEAGUE-15).
  const rosters: [Player[], Player[]] = opts.lab
    ? [[...opts.lab.rosters[0]], [...opts.lab.rosters[1]]]
    : fixtureRosters(w, f, prepared, era, model !== undefined);
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
        sideTendencies(w, opts.lab ? f.home : f.away, tactics[1], rosters[1], xi[1]),
      ] as [PlayerTendencies[], PlayerTendencies[]],
    }),
  };
}
