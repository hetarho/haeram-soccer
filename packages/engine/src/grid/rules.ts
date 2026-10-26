import type { Score } from '../../../contracts/src/types';
import { matchModelNumber, type MatchModelRevision } from '../../../contracts/src/match-model';

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

/** Whether a match plays `revision` of the candidate model or a later one; T431–T433 gate on 2. */
export const modelAtLeast = (setup: { model?: MatchModelRevision }, revision: number) =>
  setup.model !== undefined && matchModelNumber(setup.model) >= revision;
