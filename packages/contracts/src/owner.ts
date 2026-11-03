/**
 * The owner as a person apart from the club he buys (→OWNER): his wealth tier and traits, his
 * fortune, stake, dividend and standing with the fans, the takeover's facts and loan, the season
 * books every club keeps (→ECON-36) and what the start chooses and lists (→WEB-2, ECON-37).
 * Money is decimal-string minor units (→ECON-1).
 */
import type { CareerDate, CountryCode, CupRun, World } from './types';
import type { CrestDesign } from './identity';
import type { Position } from './player';

/** The six wealth tiers, richest first (→OWNER-3). */
export const WEALTH_TIER_IDS = [
  'oil',
  'chaebol',
  'industrial',
  'midsize',
  'local',
  'selfmade',
] as const;
export type WealthTier = (typeof WEALTH_TIER_IDS)[number];
/**
 * The eight traits (→OWNER-5): 성공한 사업가, 승리의 부적, 협상의 달인, 팬들의 친구, 마당발, 원석
 * 감별사, 마케팅 귀재 and 정치력.
 */
export const OWNER_TRAIT_IDS = [
  'businessman',
  'talisman',
  'negotiator',
  'fansFriend',
  'networker',
  'talentSpotter',
  'marketer',
  'politician',
] as const;
export type OwnerTrait = (typeof OWNER_TRAIT_IDS)[number];
/** The most traits an owner takes; none is the hardest start (→OWNER-2, OWNER-5). */
export const OWNER_TRAIT_LIMIT = 5;
/** The 배당 dial's shares of the season's profit, in percent (→OWNER-11). */
export const DIVIDEND_SHARES = [0, 25, 50, 75, 100] as const;
export type DividendShare = (typeof DIVIDEND_SHARES)[number];
/** The decades a takeover starts in; the 1940s take over at the 1946 restart (→WEB-2, WORLD-14). */
export const TAKEOVER_DECADES = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000] as const;
export type TakeoverDecade = (typeof TAKEOVER_DECADES)[number];
/** What ended a career (→OWNER-16): the club's bankruptcy, the owner's, or 구단주 퇴진. */
export type EndCause = 'club' | 'owner' | 'fans';
/**
 * Whether the career is over (→OWNER-16, ECON-24): the club's bankruptcy, the owner's or 구단주
 * 퇴진. Nothing advances after it and only the inbox can be read; the engine, the worker and the
 * UI all read this one predicate.
 */
export function careerEnded(w: Pick<World, 'bankrupt' | 'ended'>) {
  return w.bankrupt !== undefined || w.ended !== undefined;
}

/** One owner season at its close (→OWNER-17), in the money of that season. */
export interface OwnerSeasonRecord {
  year: number;
  /** The club's currency code when the season closed. */
  currency: string;
  /** 구단주 자금 after the close; below zero is the owner's debt. */
  fortune: string;
  /** The season's business result, every settlement summed: positive won, negative lost. */
  business: string;
  /** Living costs paid over the season (→OWNER-8). */
  living: string;
  /** Owner money put into the club over the season (→OWNER-9). */
  injected: string;
  /** The dividend taken at the close (→OWNER-11). */
  dividend: string;
  /** 팬 민심 at the close (→OWNER-12). */
  fanMood: number;
}
/**
 * One season the bought club played before the takeover (→HIST-21), read from the world's season
 * archive (→HIST-2): its league finish, its country's title and the cup runs the archive keeps —
 * the domestic cup's final, and each continental competition's final, bracket round or group stage.
 */
export interface PreOwnerSeason {
  year: number;
  /** Its division (0 the top flight), group and place; absent when the archive holds no row for it. */
  finish?: { tier: number; group: number; place: number };
  /** It won its country's top flight. */
  title?: true;
  runs: CupRun[];
}
/** The takeover's facts (→ECON-38, OWNER-3): historical amounts, in the money they were paid in. */
export interface TakeoverFacts {
  /** The season the owner took over, on its first day. */
  year: number;
  clubId: string;
  /** The club's price, paid from the fortune (→ECON-37). */
  price: string;
  /** The club's debt that became the takeover loan (→ECON-38). */
  debt: string;
  /** The tier's starting fortune before the price left it; living costs are a share of it (→OWNER-8). */
  fortune: string;
  /** The club's currency code at the takeover. */
  currency: string;
  /**
   * The club's income in its last season before the takeover (→ECON-36), carried into the
   * takeover season's money: the turnover 팬 민심 measures an injection by until the owner's
   * first season closes (→OWNER-12). Absent for a club that kept no books.
   */
  lastIncome?: string;
}
/** The owner (→OWNER): who he is, his money and his standing with the supporters. */
export interface OwnerState {
  tier: WealthTier;
  /** The traits taken at the start, fixed for the career (→OWNER-5). */
  traits: OwnerTrait[];
  /**
   * 구단주 자금 (→OWNER-1), in the club's money; a currency change converts it with the cash
   * (→ECON-6). Below zero is the owner's debt (→OWNER-8, OWNER-14).
   */
  fortune: string;
  /** The business stake in whole percent of the fortune, applied at the next settlement (→OWNER-7). */
  stake: number;
  /** The 배당 dial (→OWNER-11). */
  dividendShare: DividendShare;
  /** 팬 민심, 0–100 (→OWNER-12). */
  fanMood: number;
  /** 구단주 파산 위기: the settlement that left the fortune below zero (→OWNER-14). */
  ownerCrisis?: { since: CareerDate };
  /** 퇴진 압박: settled league rounds in a row with 팬 민심 below the floor (→OWNER-13). */
  fanCrisis?: { rounds: number };
  /**
   * Injections of the FFP window by season, in the club's money; a currency change converts them
   * with the fortune (→OWNER-10, ECON-6).
   */
  ffpInjections: { season: number; amount: string }[];
  takeover: TakeoverFacts;
  /** One record per closed owner season, oldest first (→OWNER-17). */
  seasonRecords: OwnerSeasonRecord[];
}
/**
 * The club's debt at the takeover as a loan (→ECON-38), in the club's money; a currency change
 * converts it (→ECON-6).
 */
export interface TakeoverLoan {
  /** What is still owed. */
  balance: string;
  /** Each season's equal installment, paid as a fixed cost over its league rounds. */
  installment: string;
  seasonsLeft: number;
}
/** One club's settled season (→ECON-36), in the money of that season. */
export interface ClubSeasonBook {
  year: number;
  /** League distribution, gate and commercial income (→ECON-28, ECON-9, ECON-8). */
  income: string;
  /** The wage bill (→CLUB-25). */
  wages: string;
  /** Operating expenses (→ECON-30). */
  costs: string;
  /** Income less wages and costs. */
  result: string;
}
/**
 * A club's books while nobody owns it (→ECON-36): the current and the last closed season, newest
 * first and at most two, and its balance in the club's money of the season in play (a currency
 * change converts them, →ECON-6). Cash below zero is kept as debt.
 */
export interface ClubBooks {
  seasons: ClubSeasonBook[];
  cash: string;
  debt: string;
}
/** The start's choices (→WEB-2, OWNER-2): who the owner is, when he buys and the world's seed. */
export interface StartChoice {
  tier: WealthTier;
  traits: OwnerTrait[];
  decade: TakeoverDecade;
  seed: string;
}
/** One club on the takeover list (→WEB-15, ECON-37), its amounts in its own money. */
export interface ClubListing {
  clubId: string;
  name: string;
  country: CountryCode;
  /** Its division, 0 the top flight. */
  division: number;
  /** The club's currency code. */
  currency: string;
  /** Its value, the price paid for it (→ECON-37). */
  price: string;
  /** The price in pounds, the money the tiers' fortunes are sized in (→OWNER-3, ECON-35). */
  pricePounds: string;
  cash: string;
  debt: string;
  /** Last season's income and wage bill (→ECON-36). */
  lastIncome: string;
  lastWages: string;
  strength: number;
  /** Whether the chosen tier's fortune pays its price. */
  affordable: boolean;
}
/**
 * What a club's sheet opens before buying (→WEB-15): its squad, manager, stadium and history.
 * The worker reads it from the generated world (runtime `clubSheetFacts`); the list's own numbers
 * stay on the listing.
 */
export interface ClubSheetFacts {
  crest?: CrestDesign;
  squad: { id: string; name: string; position: Position; age: number; ovr: number }[];
  manager?: { name: string; age: number; rating: number; note?: string };
  stadium: { name?: string; seats: number };
  history: {
    /** Honours won before the takeover. */
    league: number;
    cup: number;
    europe: number;
    /** The last seasons' finishes, newest first. */
    seasons: { year: number; division: number; place: number }[];
  };
}
