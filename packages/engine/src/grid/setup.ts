/** Everything a grid match needs before kick-off: era rules, rosters, bench, takers and bends (→MATCH-2, MATCH-18, MATCH-20, CLUB-6). */
import type { Club, Fixture, Player, Score, Tactic, World } from '../../../contracts/src/types';
import { activeMatchModel, type MatchModelRevision } from '../../../contracts/src/match-model';
import { FORMATIONS, lineOf } from '../player';
import { activePlayers, isInjured, ownMultiplier, slotOvr, squad } from '../world';
import { prepareMatch } from '../match';
import { isUnavailable } from '../discipline';
import { subPolicyFor } from './changes';

export interface EraRules {
  /** Substitutes a side may name. */
  named: number;
  maxSubs: number;
  injuryOnly: boolean;
  /** Substitution windows per side in extra-free play; undefined means unlimited. */
  windows: number | undefined;
  /** Whether the era's wording says "cards" (affects text only). */
  cards: boolean;
}

/** Substitution rules by season (MATCH-20, MATCH-19). */
export function eraRules(year: number): EraRules {
  const cards = year >= 1970;
  if (year >= 2022) return { named: 9, maxSubs: 5, injuryOnly: false, windows: 3, cards };
  if (year >= 2008) return { named: 7, maxSubs: 3, injuryOnly: false, windows: undefined, cards };
  if (year >= 1996) return { named: 5, maxSubs: 3, injuryOnly: false, windows: undefined, cards };
  if (year >= 1995) return { named: 3, maxSubs: 3, injuryOnly: false, windows: undefined, cards };
  if (year >= 1987) return { named: 2, maxSubs: 2, injuryOnly: false, windows: undefined, cards };
  if (year >= 1967) return { named: 1, maxSubs: 1, injuryOnly: false, windows: undefined, cards };
  if (year >= 1965) return { named: 1, maxSubs: 1, injuryOnly: true, windows: undefined, cards };
  return { named: 0, maxSubs: 0, injuryOnly: false, windows: undefined, cards };
}

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

/** Percentage-point style and synergy bends of a side's play (→STAFF-14); all zero for another club. */
export interface StyleBend {
  pass: number;
  possession: number;
  shot: number;
  defense: number;
  lineHigh: number;
  lineLow: number;
}

/** How a manager reads the match for substitutions (→STAFF-22). */
export interface SubPolicy {
  fatigueFrom: number;
  laterFrom: number;
  earlyPress: boolean;
  protectLead: boolean;
  chaseWhenBehind: boolean;
  youth: boolean;
  data: boolean;
  delay: number;
}

export const DEFAULT_SUB_POLICY: SubPolicy = {
  fatigueFrom: 60,
  laterFrom: 70,
  earlyPress: false,
  protectLead: false,
  chaseWhenBehind: false,
  youth: false,
  data: false,
  delay: 0,
};

/** A knockout tie's earlier leg and whether away goals count (→MATCH-6). */
export interface DecideRule {
  first?: Score;
  awayGoals: boolean;
}
/**
 * Whether a knockout tie is still level after this fixture's goals: on aggregate with the first
 * leg (oriented to this fixture) and, under the away-goals rule, on away goals (design §8.4).
 */
export function isLevel(decide: DecideRule, home: number, away: number) {
  const first = decide.first ?? { home: 0, away: 0 };
  if (first.home + home !== first.away + away) return false;
  // This fixture's home side scored its away goals in the first leg.
  return !decide.awayGoals || !decide.first || first.home === away;
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
  const prepared = prepareMatch(w, f);
  const { teams, squads, ownSide, style, synergy } = prepared;
  const tactics = opts.tactics ?? prepared.tactics;
  const era = eraRules(f.year);
  // Nobody injured or banned for this fixture sits on the bench (→MATCH-19, →LEAGUE-15).
  const benches = teams.map((club, side) =>
    benchFor(w, club, squads[side], era, (p) => isUnavailable(w, p, club.id, f)),
  ) as [Player[], Player[]];
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
    rosters: [
      [...squads[0], ...benches[0]],
      [...squads[1], ...benches[1]],
    ],
    bench: [benches[0].length, benches[1].length],
    takers: [takersFor(squads[0]), takersFor(squads[1])],
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
  };
}
