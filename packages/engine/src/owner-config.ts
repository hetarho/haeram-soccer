import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * Every number of the owner and the takeover (→OWNER, ECON-36–38, CLUB-1) as named settings, the
 * SSOT's values. Engine and UI code read them by name, never as literals; T668's measurement retunes
 * them here through an update-ssot. A leaf: it imports only contracts, so any layer may read it.
 */
import {
  DIVIDEND_SHARES,
  OWNER_TRAIT_LIMIT,
  type OwnerTrait,
  type WealthTier,
} from '../../contracts/src/owner';

export { OWNER_TRAIT_LIMIT };

/**
 * The six wealth tiers, richest first (→OWNER-3): each starts with `multiple` × its anchor, the
 * median pound price in the takeover season of the clubs in its reach. The tier never changes.
 * T686: 1.3 → 1.6, since a country's median club of a band costs up to 1.28 × the anchor (ESP's
 * 지역 유지 band), which left its owner 2–3% of his fortune and bankrupt in his third season.
 */
export const OWNER_TIERS: Record<
  WealthTier,
  { label: string; multiple: number; band: readonly [from: number, to: number] }
> = {
  oil: { label: sourceMessage('copy.owner_config.ca5be75a15'), multiple: 10, band: [0, 0.08] },
  chaebol: {
    label: sourceMessage('copy.owner_config.043b0936f2'),
    multiple: 1.6,
    band: [0.08, 0.2],
  },
  industrial: {
    label: sourceMessage('copy.owner_config.5726199b80'),
    multiple: 1.6,
    band: [0.2, 0.35],
  },
  midsize: {
    label: sourceMessage('copy.owner_config.10365bc4b0'),
    multiple: 1.6,
    band: [0.35, 0.55],
  },
  local: { label: sourceMessage('copy.owner_config.49e9b299ef'), multiple: 1.6, band: [0.55, 0.8] },
  selfmade: { label: sourceMessage('copy.owner_config.225d3ff947'), multiple: 1.6, band: [0.8, 1] },
};

/** The eight traits' effects (→OWNER-5), each read only while the owner holds the trait. */
export const OWNER_TRAITS = {
  /** 성공한 사업가: a business settlement succeeds with this chance instead of `OWNER_BUSINESS.chance`. */
  businessman: { label: sourceMessage('copy.owner_config.1616a30dd9'), success: 0.7 },
  /** 승리의 부적: the own club's match strength, on the OVR scale (→OWNER-6). */
  talisman: { label: sourceMessage('copy.owner_config.20ed096d80'), strength: 1 },
  /** 협상의 달인: factors on player wage demands and asked transfer fees for the own club. */
  negotiator: { label: sourceMessage('copy.owner_config.6155e88d8d'), wages: 0.9, fees: 0.9 },
  /** 팬들의 친구: the factor on every 팬 민심 drop; rises are not scaled (→OWNER-12). */
  fansFriend: { label: sourceMessage('copy.owner_config.5a6ef5eba3'), drop: 0.7 },
  /** 마당발: manager and coach candidate lists hold more candidates, each this much abler. */
  networker: { label: sourceMessage('copy.owner_config.26ee39d7d7'), candidates: 1, ability: 5 },
  /** 원석 감별사: academy intake potential, and the factor on other clubs' players' scouting ranges. */
  talentSpotter: {
    label: sourceMessage('copy.owner_config.d32282912e'),
    potential: 3,
    scoutRange: 0.5,
  },
  /** 마케팅 귀재: the factor on sponsor offers (→ECON-8). */
  marketer: { label: sourceMessage('copy.owner_config.c2061fc364'), sponsor: 1.15 },
  /** 정치력: the factor on operating expenses (→ECON-30). */
  politician: { label: sourceMessage('copy.owner_config.cd5c9a46c5'), operating: 0.9 },
} as const satisfies Record<OwnerTrait, { label: string; [effect: string]: string | number }>;

/**
 * The owner's business (→OWNER-7): settled on the 1st of every month from September to June and on
 * the season's close day (→LEAGUE-9); each succeeds with `chance`, drawn from the world's stream,
 * and wins or loses `swing` percent of the staked share of a fortune above zero. The stake is whole
 * percent from `stake.min` to `stake.max`, starting at `stake.start`.
 */
export const OWNER_BUSINESS = {
  dates: [
    { month: 9, date: 1 },
    { month: 10, date: 1 },
    { month: 11, date: 1 },
    { month: 12, date: 1 },
    { month: 1, date: 1 },
    { month: 2, date: 1 },
    { month: 3, date: 1 },
    { month: 4, date: 1 },
    { month: 5, date: 1 },
    { month: 6, date: 1 },
  ],
  close: true,
  chance: 0.6,
  swing: 5,
  stake: { min: 0, max: 100, start: 0 },
} as const;
/** A season's settlements: the dated ones and the close (→OWNER-7). */
export const OWNER_SETTLEMENTS = OWNER_BUSINESS.dates.length + (OWNER_BUSINESS.close ? 1 : 0);

/**
 * Living costs a season: `season` of the tier's starting fortune, grown with prices and split evenly
 * over the season's settlements (→OWNER-8). T686 measured 0.2% at each of four settlements, with
 * the 1.6 multiples, so no reference owner who moves no money is bankrupt within 15 seasons (the
 * earliest at 18); T735 keeps that season total over eleven settlements.
 */
export const OWNER_LIVING = { season: 0.008 } as const;

/** The 배당 dial's shares in percent and its default (→OWNER-11). */
export const OWNER_DIVIDEND = { shares: DIVIDEND_SHARES, start: 0 } as const;

/**
 * UEFA financial fair play (→OWNER-10): from the `start` season, while the club plays its country's
 * top flight, owner money put in over `window` seasons (the current and the two before) may not
 * exceed the cap in force, in nominal euros at ECON-35's rates. Each cap holds from its `from`
 * season until the next one's.
 */
export const FFP = {
  start: 2011,
  window: 3,
  caps: [
    { from: 2011, euros: 45_000_000 },
    { from: 2015, euros: 30_000_000 },
  ],
} as const;

/**
 * 팬 민심 (→OWNER-12/13), on a 0–100 scale from `start` at the takeover. Each settled league round
 * it drifts `drift` of the gap toward `start`; below `floor` for `rounds` settled league rounds in a
 * row the owner is forced out. Drops are scaled by 팬들의 친구 (`friendly`), rises never.
 */
export const FAN_MOOD = {
  start: 60,
  min: 0,
  max: 100,
  floor: 15,
  rounds: 8,
  drift: 0.02,
  friendly: OWNER_TRAITS.fansFriend.drop,
  /** An own league result. */
  result: { win: 1, draw: 0, defeat: -1 },
  /** The season close: a league or cup title, promotion, relegation, last in the lowest division. */
  title: 15,
  promotion: 10,
  relegation: -15,
  lastInLowest: -10,
  /** An injection: per 1% of last season's turnover put in, at most `max` an injection. */
  injection: { perPercent: 1, max: 10 },
  /** A signing for a fee above the club's previous record. */
  recordSigning: 5,
  /** A dividend: per 1% of the season's turnover taken. */
  dividend: { perPercent: -0.5 },
  /** Selling one of the club's `top` highest-OVR players, at most once a transfer window. */
  starSale: { change: -4, top: 3 },
  /** Adopting a designer draft (→KIT-9). */
  identity: -20,
  /** Each home league match, per preset step its price stands above the era's default (→ECON-17). */
  ticket: { perStep: -0.2 },
} as const;

/**
 * A club's value, its price (→ECON-37): its following at `following` 1901 price units per
 * supporter on the price index (the brand base the season archive's club value has always used),
 * its league place at `placeSeasons` seasons of its division's distribution, and never below
 * `floor` seasons of that distribution.
 */
export const CLUB_VALUE = { following: 0.05, placeSeasons: 3, floor: 1 } as const;

/** The club's debt at the takeover becomes a loan of equal installments (→ECON-38). */
export const TAKEOVER_DEBT = { seasons: 10, rate: 0.05 } as const;

/** Unowned books: opening cash, maximum cash and maximum debt in seasons of income (→ECON-36). */
export const CLUB_BOOKS = { opening: 0.5, cashSeasons: 1, debtSeasons: 1.5 } as const;

/**
 * The club as the owner takes it over (→CLUB-1): its squad filled to `squad` with players at its
 * level, `goalkeepers` of them keepers. Its facilities stand at the stage its division and stature
 * set: an ordinary club's stadium step and training-ground and academy levels by division from the
 * top flight down (the last entry for every division below), moved by its stature (→LEAGUE-10) —
 * giants (stature ≥ 9) and big clubs (≥ 4) up, small clubs (≤ −3) down — within each ladder.
 */
export const CLUB_TAKEOVER = {
  squad: 20,
  goalkeepers: 2,
  facilities: {
    division: [
      { stadium: 5, training: 3, academy: 3 },
      { stadium: 4, training: 2, academy: 2 },
      { stadium: 3, training: 1, academy: 1 },
      { stadium: 2, training: 0, academy: 0 },
      { stadium: 1, training: 0, academy: 0 },
    ],
    stature: {
      giant: { from: 9, stadium: 2, levels: 1 },
      big: { from: 4, stadium: 1, levels: 0 },
      small: { to: -3, stadium: -1, levels: -1 },
    },
  },
} as const;
