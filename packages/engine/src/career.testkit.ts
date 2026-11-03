/**
 * A career as the game starts one (→WEB-2, ECON-38, CLUB-1): a world nobody owns a club in, made
 * fresh on a season's first day, and one of its clubs taken over. Tests that need a career build
 * it here, so the founding can leave the engine (T671).
 */
import type { OwnerTrait, WealthTier } from '../../contracts/src/owner';
import type { CountryCode, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { historyWorld } from './history';
import { MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model';
import { footballQuote } from './quotes';
import { takeOver } from './takeover';

/** The season a test career starts in: the old founding year, five seasons before the European Cup. */
export const CAREER_YEAR = 1950;
/** Years of fixed costs a test career holds in cash, as the old 쉬움 founding gave. */
export const CAREER_FUNDS = 2;

export interface CareerInput {
  seed?: string;
  country?: CountryCode;
  /** The club taken over; the first club of the country's lowest professional division by default. */
  club?: string;
  tier?: WealthTier;
  traits?: OwnerTrait[];
  /** The direction chosen at the takeover (→WEB-15); absent is 기본 방향. */
  preset?: string;
  year?: number;
  /** The club's cash after the takeover, minor units; `CAREER_FUNDS` years of fixed costs by default. */
  cash?: string;
}

/** The club a test career takes over by default: the lowest professional division's first club. */
export function careerClub(code: CountryCode = 'ENG') {
  return `${code}:${country(code).groups.length - 1}:0:0`;
}

/**
 * A fresh world (`historyWorld` on `input.year`, nothing lived before it) whose `input.club` an
 * `input.tier` owner takes over with `input.traits` and `input.preset`, its cash then set to
 * `input.cash` or `CAREER_FUNDS` years of its fixed costs with no ledger entry. ← a fresh world's
 * books open at cash 0 and an unfunded club goes bankrupt at round 8. `release` is the internal
 * switch, as for `takeOver`.
 */
export function careerWorld(
  input: CareerInput = {},
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): World {
  const code = input.country ?? 'ENG';
  const w = historyWorld(input.seed ?? 'career', release, input.year ?? CAREER_YEAR);
  takeOver(
    w,
    input.club ?? careerClub(code),
    { tier: input.tier ?? 'oil', traits: input.traits ?? [] },
    input.preset,
    release,
  );
  w.cash = input.cash ?? careerFunds(w).toString();
  return w;
}

/**
 * `CAREER_FUNDS` years of a career's fixed costs: the squad's and the manager's yearly wages, the
 * stadium's upkeep and the operating expenses, as a founding's cash counted them.
 */
export function careerFunds(w: World) {
  const code = w.clubs.find((c) => c.id === w.playerClub)!.country;
  const year =
    w.players.reduce((sum, p) => sum + BigInt(p.wage), 0n) +
    BigInt(w.manager.wage) +
    BigInt(footballQuote(code, w.year, 180)) +
    BigInt(w.operatingExpenses ?? '0');
  return year * BigInt(CAREER_FUNDS);
}
