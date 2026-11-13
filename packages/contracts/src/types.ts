import type { CareerReads } from './career-reads';
import type { NewsJournal } from './news';
import type { ClubBuild } from './build';
import type {
  ClubIdentity,
  DesignCommission,
  DesignStudio,
  FixtureKitChoice,
  IdentityColours,
  KitRole,
  MatchAppearance,
} from './identity';
import type { ManagerHistoryFacts } from './manager-history';
import type { ClubBooks, DividendShare, EndCause, OwnerState, TakeoverLoan } from './owner';
import type { RecentResults } from './recent-results';
import type { MatchScript, StagingSide } from './match-script';
import type {
  IntentionObservation,
  MatchModelRevision,
  MatchModelState,
  NpcSeasonStats,
} from './match-model';
import type {
  Attributes,
  Line,
  OffPitchQualities,
  Personality,
  PlayTrait,
  Position,
  Positions,
} from './player';
export type { ClubBuild, BuildSlot } from './build';
export type {
  Attribute,
  Attributes,
  Grade,
  Line,
  Personality,
  PlayTrait,
  Position,
  PositionLevel,
  Positions,
  RoleId,
} from './player';
export type {
  ClubBooks,
  ClubListing,
  ClubSeasonBook,
  DividendShare,
  EndCause,
  OwnerSeasonRecord,
  OwnerState,
  OwnerTrait,
  StartChoice,
  TakeoverDecade,
  TakeoverFacts,
  TakeoverLoan,
  WealthTier,
} from './owner';
export type CountryCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'POR' | 'NED' | 'BEL';
export type Tactic = 'balanced' | 'possession' | 'counter' | 'press';
/** The first team's training focus (→CLUB-11): 균형, 회복 or 하드 트레이닝. */
export type TrainingFocus = 'balanced' | 'recovery' | 'hard';
/** The facility parts the owner builds separately (→ECON-32). */
export type FacilityPart = 'stadium' | 'training' | 'academy';
/** The academy's training focus, set by the youth director (→CLUB-31). */
export type YouthFocus = 'balanced' | 'fundamentals' | 'firstTeam';
/** The coaches who set a training focus by their own rules (→CLUB-13, CLUB-31). */
export type TrainingCoach = 'assistant' | 'youth';
/**
 * The board's dials (→ECON-16): squad investment, recruitment, academy investment and, from rules
 * 1.19, the 지역 and 글로벌 rows (주변 투자, 해외 마케팅, 해외 스카우트망 and
 * 해외 투어, which has three levels) in place of the marketing dial.
 */
export type PolicyKey =
  | 'support'
  | 'recruitment'
  | 'academy'
  | 'localInvest'
  | 'globalMarketing'
  | 'globalScouting'
  | 'tour';
export type PolicyLevel = 1 | 2 | 3 | 4 | 5;
export type ClubPolicy = Record<PolicyKey, PolicyLevel>;
/** Saved policy: keys added later may be absent and resolve to their defaults. */
export type SavedPolicy = Pick<ClubPolicy, 'support' | 'recruitment'> &
  Partial<Omit<ClubPolicy, 'support' | 'recruitment'>>;
/**
 * Backroom roles: the 단장 (`director`, →STAFF-20) beside the manager and the coaching
 * departments below him, following a professional club's staff.
 */
export type StaffRole =
  'director' | 'assistant' | 'attack' | 'defense' | 'goalkeeping' | 'fitness' | 'youth' | 'scout';
export type StaffTrait =
  'developer' | 'specialist' | 'recovery' | 'spotter' | 'negotiator' | 'closer';
export type ManagerTrait = 'youth' | 'rotation' | 'stable';
/** A manager's school of football (→STAFF-14); absent means the founding all-rounder. */
export type ManagerStyle =
  | 'positional'
  | 'gegenpress'
  | 'counter'
  | 'organizer'
  | 'motivator'
  | 'developer'
  | 'firefighter'
  | 'headcoach';
/** Independent business authority; training always belongs to its coach. */
export type ResponsibilityKey =
  'manager' | 'staff' | 'contracts' | 'recruitment' | 'sales' | 'academy' | 'sponsors';
export type ResponsibilitySettings = Record<ResponsibilityKey, 'direct' | 'delegated'>;
export interface GameSettings {
  responsibilities: ResponsibilitySettings;
  mode: 'automatic' | 'manual';
  observations: { matchEve: boolean; windowOpen: boolean };
}
/** A wage cap names the going wage of a manager or coach of this OVR, in today's money. */
export type WageCapOvr = 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90;
/**
 * How the delegated staff appoint and renew managers (→STAFF-18). Empty lists mean any school or
 * selection trait (`none` matches a manager without one); an absent `maxWageOvr` is no wage cap.
 */
export interface ManagerCriteria {
  /** 0–99. */
  minOvr: number;
  schools: ManagerStyle[];
  /** 0–100 each. */
  minFlexibility: number;
  maxPride: number;
  minYouth: number;
  traits: ('none' | ManagerTrait)[];
  maxWageOvr?: WageCapOvr;
  /** `youth` orders by 육성 (youth work), 감독 기조 육성가's order (→STAFF-18). */
  priority: 'ovr' | 'potential' | 'wage' | 'youth';
  term: ContractTerm;
  /** Other clubs' managers too, paying their compensation (→STAFF-17). */
  poach: boolean;
  /** With no match: keep the interim (`wait`) or take the best affordable free agent. */
  whenNone: 'wait' | 'best';
}
/**
 * How the delegated staff hire and renew one coaching department (→STAFF-15). An absent `trait`
 * is any; an absent `maxWageOvr` is no wage cap.
 */
export interface CoachCriteria {
  /** An unpaid ability-50 volunteer holds the post. */
  volunteer: boolean;
  /** 0–99. */
  minAbility: number;
  /** One of the department's traits (→STAFF-11). */
  trait?: StaffTrait;
  maxWageOvr?: WageCapOvr;
  priority: 'ability' | 'wage';
  term: ContractTerm;
}
/** The talk rule's wage cap: the floor at most this multiple of the player's market wage. */
export type TalkPayCap = 0.9 | 1 | 1.1 | 1.25 | 1.4;
/** Which players the delegated staff keep in contract talks (→CLUB-26). */
export interface TalkRule {
  maxPay: TalkPayCap;
  /** Keep only players in the starting XI as home shows it (재계약 기조 핵심만 붙잡기 →CLUB-26). */
  startersOnly?: boolean;
  /** 0–99: players rated below are not kept. */
  minOvr: number;
  /** 28–40: players this old or older are not kept; absent is no limit. */
  maxAge?: number;
}
/**
 * The direction rows the staff follow (→ECON-25), each absent at its default (표준, or any school):
 * 재계약 기조 (→CLUB-26), 선호 학파 and 감독 기조 (→STAFF-18), 코치 기조 (→STAFF-15), 육성 목표 and
 * 데뷔 시점 (→CLUB-32). While a responsibility is delegated its person sets the rows it steers
 * (`delegation.ts`); otherwise the owner does.
 */
export interface Direction {
  /** Standing recruitment mediation support; absent means balanced (→STAFF-26). */
  recruitmentSupport?: 'director' | 'manager';
  renewal?: 'keepAll' | 'coreOnly' | 'frugal' | 'youngFirst';
  school?: ManagerStyle;
  manager?: 'developer' | 'proven' | 'young' | 'cheap';
  coaches?: 'volunteer' | 'cheap' | 'elite';
  /** 육성 목표 (→CLUB-32): what the academy is for. */
  youthGoal?: 'firstTeam' | 'sell' | 'minimal';
  /** 데뷔 시점 (→CLUB-32): how early prospects go up. */
  debut?: 'early' | 'ready' | 'late';
}
export type DirectionKey = keyof Direction;
/** The responsibilities that spend the club's money, each carrying the owner's spending request. */
export type BudgetResponsibility = Exclude<ResponsibilityKey, 'sponsors'>;
/**
 * The owner's request to the person a responsibility is delegated to: how much of the club's money
 * to put into it, 1 (최소한만) to 5 (아낌없이); for sales, how readily to sell (1) or hold (5). A
 * request is not an order: the person turns it into a plan by temperament and the club's money.
 */
export type SpendRequest = 1 | 2 | 3 | 4 | 5;
/** Seasons a contract is signed for (→CLUB-26, STAFF-14). */
export type ContractTerm = 1 | 2 | 3 | 4 | 5;
/**
 * The term of a player contract offered in a talk (→CLUB-26), one field for both windows: signed
 * in the summer, 1–5 seasons, this one included; signed in the winter, the rest of this season and
 * 0–4 more (½–4½ years). Either way the contract ends at a season's close (→CLUB-28).
 */
export type TalkTerm = 0 | ContractTerm;
/**
 * Sponsor slots in the order they open (→ECON-8): 지역 후원, 용품 후원, 메인 스폰서, 경기장 명명권,
 * 소매 스폰서. The catalog says when each opens per country.
 */
export type SponsorSlot = 'local' | 'kit' | 'shirt' | 'stadium' | 'sleeve';
/** Guaranteed, performance-linked, exclusive (no merchandise campaigns) or inflation-linked. */
export type SponsorKind = 'stable' | 'performance' | 'exclusive' | 'indexed';
/** How strongly a player's agent represents him (→CLUB-30), 1 to 5. */
export type AgentRating = 1 | 2 | 3 | 4 | 5;
/**
 * A player contract's own clauses (→CLUB-29), settled when it is signed, in whole percent of the
 * wage: `promotion` the rise from the first round after the club goes up, `relegation` the cut
 * (negative) from the first round after it goes down. An absent clause is none.
 */
export interface ContractClauses {
  promotion?: number;
  relegation?: number;
  /**
   * The Ballon d'Or bonus (→CLUB-29): paid once, in whole percent of the yearly wage, at the close
   * of a season whose award he wins while under this contract at our club.
   */
  ballonDor?: number;
}
/** Why a player turned unhappy (→CLUB-27): the club declined his renewal or improved contract. */
export type UnhappyReason = 'renewal-declined' | 'improve-declined' | 'ambition';
/** A player's standing on the market (→CLUB-22): listed to sell, open to offers, or untouchable. */
export type TransferStance = 'listed' | 'open' | 'untouchable';
export type InboxKind =
  | 'match'
  | 'window-open'
  | 'window-close'
  | 'bid-response'
  | 'incoming-bid'
  | 'youth-intake'
  | 'staff-report'
  | 'staff-renewal'
  | 'cup'
  | 'finance'
  | 'contract-talk'
  | 'unhappy'
  | 'transfer-request'
  | 'sponsor-ending';
export type Metrics = number[];
/**
 * A line the manager asks the club to sign for (→CLUB-33): short of the minimum, or an upgrade;
 * an upgrade may name the formation slot and its position.
 */
export interface SigningRequest {
  line: Line;
  kind: 'short' | 'upgrade';
  /** The formation slot (index) and its position an upgrade asks for. */
  slot?: number;
  position?: Position;
  /** The manager's pick among the shortlisted who fit the request, by player id. */
  pick?: string;
}
/**
 * The chief scout's shortlist (스카우트 명단, →CLUB-33), drawn on a window's opening day (the
 * season's first day among them) and after every 4th league round, with the manager's requests.
 */
export interface Shortlist {
  /** The season and season day of the draw. */
  year: number;
  day: number;
  /**
   * The players the chief scout found, his reach's count per line (→CLUB-51), best first; one no
   * longer on his list drops on reading.
   */
  entries: { playerId: string; line: Line }[];
  /** At most three: every short line, then the upgrade a candidate makes most (→CLUB-33). */
  requests: SigningRequest[];
  /**
   * The requests at the open window's opening, judged at its close: the manager who made them
   * and whether a player who fits one joined since (→CLUB-33).
   */
  window?: {
    year: number;
    opening: number;
    manager: string;
    requests: SigningRequest[];
    met?: true;
  };
}
/** Actual external arrival facts support request/promise judgement after bid history eviction. */
export interface RecruitmentArrival {
  player: string;
  name: string;
  position: Position;
  positions: Player['positions'];
  at: CareerDate;
}
export type MediationSupport = 'director' | 'balanced' | 'manager';
export interface RecruitmentMediation {
  id: string;
  key: string;
  created: CareerDate;
  window: 'summer' | 'winter';
  manager: { id: string; name: string };
  director: { id: string; name: string };
  target: SigningRequest;
  candidate: { id: string; name: string; fee: string; wage: string };
  managerReason: string;
  directorReason: string;
  support: MediationSupport;
  status: 'pending' | 'resolved';
  resolution?: { at: CareerDate; support: MediationSupport; result: string; promise?: string };
}
export interface ReinforcementPromise {
  id: string;
  mediation: string;
  manager: { id: string; name: string };
  director: { id: string; name: string };
  target: SigningRequest;
  created: CareerDate;
  deadline: CareerDate;
  status: 'pending' | 'fulfilled' | 'unfulfilled' | 'cancelled';
  resolved?: CareerDate;
  arrival?: { player: string; at: CareerDate };
  reason?: string;
  reaction?: string;
}
export interface Club {
  id: string;
  name: string;
  short: string;
  country: string;
  tier: number;
  group: number;
  strength: number;
  reputation: number;
  fans: number;
  color: string;
  representative?: boolean;
  /** Club Elo from every settled result (→HIST-12); absent in older saves, derived from strength. */
  elo?: number;
  /** How settled a club nobody owns is under its manager (조직력, →LEAGUE-12); absent is 0.80. */
  cohesion?: number;
  /** Level a representative club's rare project adds, fading each summer (→LEAGUE-10). */
  project?: number;
  /** Crest, representative colours and saved shirts (→KIT-1); absent in older saves. */
  identity?: ClubIdentity;
  /** Season books while nobody owns it (→ECON-36); absent in a founded career. */
  books?: ClubBooks;
  /** Persisted facilities of a club nobody owns (→WORLD-17), each at level 0–5. */
  levels?: {
    academy: number;
    ground: number;
    coaching: number;
    /** Fractional investment/decay carried until a whole level is reached. */
    progress?: number;
  };
}
export interface Player {
  id: string;
  name: string;
  /** His main position (→PLAYER-3); his line is its line. */
  position: Position;
  /** Every position he plays with its level, the main one at 3 (→PLAYER-4). */
  positions: Positions;
  born: number;
  /** The 16 attributes (→PLAYER-2). */
  attrs: Attributes;
  personality: Personality;
  qualities?: OffPitchQualities;
  /** Season of joining our first team; absent history never grants bandiera places. */
  joined?: number;
  graduate?: true;
  traits: PlayTrait[];
  /** How well he fits the club under its manager, 0.3–1.0 (→PLAYER-10). */
  adaptation: number;
  /** Settled league rounds at the club, for 적응 실패 (→PLAYER-14). */
  clubRounds?: number;
  /** The season 적응 실패 was reported for this stay (→PLAYER-14). */
  unsettled?: number;
  /** Starts at each position since its level last changed (→PLAYER-4). */
  positionStarts?: Partial<Record<Position, number>>;
  /** The OVR at his main position he grows toward (→PLAYER-15). */
  potential: number;
  reputation: number;
  wage: string;
  until: number;
  status: 'active' | 'sold' | 'retired';
  fatigue: number;
  /** Cumulative actual positive mean development of his attributes, in hundredths. */
  developed?: number;
  career: Metrics;
  season: Metrics;
  loanUntil?: number;
  /** Out injured until this season day (→CLUB-23); `year` is the season it happened in. */
  injury?: { year: number; day: number; label: string };
  /** Market standing (→CLUB-22); absent means open to offers. */
  stance?: Exclude<TransferStance, 'open'>;
  /** Season year whose close ends the career he has announced he will finish (→CLUB-3). */
  retiring?: number;
  /** The contract talk he opened (→CLUB-26). */
  talk?: ContractTalk;
  /** Season year he last asked for an improved contract: at most once a season (→CLUB-26). */
  improveAsked?: number;
  /** Unhappy since this day, and why (→CLUB-27). */
  unhappy?: { reason: UnhappyReason; year: number; day: number };
  /** The day he handed in a transfer request: listed, never untouchable (→CLUB-27). */
  transferRequest?: { year: number; day: number };
  /**
   * His agent (→CLUB-30), set when he was created and never changing; a player from before rules
   * 1.16 has none until activation draws it from his id (→SAVE-10).
   */
  agent?: AgentRating;
  /**
   * The running contract's clauses (→CLUB-29), settled at its signing; contracts signed before
   * rules 1.16, founding squads and loans have none.
   */
  clauses?: ContractClauses;
}
/**
 * A player the world holds without a club (→CLUB-49): his identity, attributes, positions,
 * personality and agent as he left, his season and career figures zero and no contract terms.
 * `freeSince` is his first season without a club; one unsigned through it retires at its close.
 */
export type FreeAgent = Player & { freeSince: number };
/**
 * A player's contract talk (→CLUB-26), opened when a transfer window opens: a renewal in his
 * contract's final season or an improved contract with at most three seasons left; his demand,
 * the floor he accepts at or above (demand × (1 − goodwill)) and the season day he asked.
 */
export interface ContractTalk {
  kind: 'renew' | 'improve';
  demand: string;
  floor: string;
  year: number;
  day: number;
  /** The clauses the new contract would carry, settled as he asks so no answer rerolls them. */
  clauses?: ContractClauses;
}
export interface Manager {
  id: string;
  person?: string;
  name: string;
  philosophy: Tactic;
  ability: number;
  youth: number;
  flexibility: number;
  pride: number;
  trust: number;
  wage: string;
  since: number;
  until: number;
  interim: boolean;
  /** Selection habit; absent means the neutral pre-trait selection. */
  trait?: ManagerTrait;
  /** School of football; absent means the neutral founding all-rounder. */
  style?: ManagerStyle;
  /** Birth year and the ability he can grow to (→STAFF-16); absent in older saves, which stay put. */
  born?: number;
  potential?: number;
  /** Seasons the owner chose at his last hiring or renewal (→STAFF-14); absent before rules 1.16. */
  term?: ContractTerm;
  /** Set while his trust-floor warning stands (→STAFF-47); absent otherwise. */
  trustWarned?: true;
}
/** Free-agent managers and the clubs whose managers changed (→STAFF-17). */
export interface ManagerMarket {
  /** Season and league round of the last refresh. */
  year: number;
  round: number;
  free: Manager[];
  /** Per club that changed manager: how many it has had since its first, and when he started. */
  clubs: Record<string, [count: number, since: number]>;
  /** Free agents created so far; numbers each new one. */
  serial: number;
}
export interface Staff {
  id: string;
  person?: string;
  role: StaffRole;
  name: string;
  ability: number;
  trait?: StaffTrait;
  wage: string;
  since: number;
  until: number;
  /** Birth year and the ability he can grow to (→STAFF-16); volunteers and older saves have none. */
  born?: number;
  potential?: number;
  /** Seasons the owner chose at his last hiring or renewal (→STAFF-15); absent before rules 1.16. */
  term?: ContractTerm;
}
/**
 * A staff hire candidate (→STAFF-49, CLUB-50): a free agent, or another club's holder of the post,
 * who also costs his club compensation (웃돈).
 */
export type StaffCandidate = Staff & {
  /** Signing fee paid to him. */
  fee: string;
  source: 'free' | 'club';
  /** For another club's holder: his club and the compensation it receives. */
  club?: string;
  compensation?: string;
};
/**
 * The staff markets (→STAFF-49): each post's free agents, and per club and post that changed
 * holder how many it has had since its first and when he started; every other holder is derived.
 */
export interface StaffMarket {
  /** Season and league round of the last refresh. */
  year: number;
  round: number;
  free: Partial<Record<StaffRole, Staff[]>>;
  clubs: Record<string, Partial<Record<StaffRole, [count: number, since: number]>>>;
}
export interface Academy {
  /** Academy prospects are not first-team players until promoted. */
  players: Player[];
  /** Last season year whose intake was settled. */
  intakeYear?: number;
}
/**
 * A recruitment target is never a page offset or a scout-list index: another club's player, or
 * (`offer`) a free agent of the world's pool (→CLUB-49).
 */
export type WorldMarketTarget = { world: string } & (
  { kind: 'club'; playerId: string; clubId: string } | { kind: 'offer'; playerId: string }
);
export interface WorldMarketQuery {
  world: string;
  page?: number;
  pageSize?: number;
  name?: string;
  recommendedOnly?: boolean;
  league?: { country: string; tier: number; group: number };
  team?: string;
  position?: Position;
  line?: Line;
  /** An OVR range, both ends included. */
  ovrMin?: number;
  ovrMax?: number;
  /** The oldest age shown, included: the market's 유소년 view asks for academy ages. */
  ageMax?: number;
  /** The existing roster-fit filter: improves predicted XI strength or tactical fit. */
  fit?: 'all' | 'improves';
  sort?: 'name' | 'age' | 'ovr' | 'potential' | 'fee' | 'wage';
  direction?: 'asc' | 'desc';
}
export interface WorldMarketOffer {
  player: Player;
  fee: string;
  loanFee: string;
  freeAgent: boolean;
  available: boolean;
  target: WorldMarketTarget;
  source?: { club: string; name: string; country: string; tier: number; group: number };
  recommended: boolean;
  own: boolean;
  /** Same-country or cross-country recruitment adaptation, retained on approach. */
  foreign: boolean;
}
/** Where a recruitment candidate is (→CLUB-50): another club's player, or a free agent. */
export type CandidateSource = { kind: 'club'; club: string } | { kind: 'free' };
/** A player the chief scout found within his reach (→CLUB-51), with the terms we would face. */
export interface ScoutOffer {
  /** On our division's market wage and the term he would sign (→CLUB-25). */
  player: Player;
  /** His club's asking transfer and loan fee; '0' for a free agent. */
  fee: string;
  loanFee: string;
  /** A free agent signs at once, outside windows too, for no fee, and is never loaned. */
  freeAgent: boolean;
  available: boolean;
  source: CandidateSource;
  /** His club's country, or a free agent's nationality, is not ours (→PLAYER-11). */
  foreign: boolean;
}
export interface WorldMarketPage {
  world: string;
  revision: number;
  total: number;
  /** Zero-based; clamped to the last existing page, or zero when empty. */
  page: number;
  pageSize: number;
  items: WorldMarketOffer[];
}

export interface TransferBid {
  id: string;
  /** `out`: our offer for a market player. `in`: another club's offer for our player. */
  direction: 'out' | 'in';
  playerId: string;
  /** The bidder for `in`, or actual seller for identity-based `out` bids. */
  club?: string;
  fee: string;
  loan?: boolean;
  /**
   * The player and asking terms an `out` bid was made for (rules 1.15.0); a bid pending from
   * before has none and takes his current terms. Either way he is found by his id in the world.
   */
  offer?: { player: Player; fee: string; loanFee: string };
  year: number;
  day: number;
  /** Season day on which the other side answers (`out`) or the offer lapses (`in`). */
  due: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'completed';
  counterFee?: string;
  /** The 단장's bid or free-agent signing with transfers delegated (→CLUB-33), by its need. */
  staff?: 'short' | 'replacement' | 'upgrade';
}
export interface InboxItem {
  id: string;
  year: number;
  day: number;
  kind: InboxKind;
  title: string;
  detail: string;
  /** Presentation emphasis only; reading a notification never resolves its business action. */
  attention: boolean;
  read?: boolean;
  /** Related bid or player ID. */
  ref?: string;
}
export interface Score {
  home: number;
  away: number;
}
export interface Fixture {
  id: string;
  year: number;
  round: number;
  kind: 'league' | 'cup' | 'europe' | 'playoff';
  home: string;
  away: string;
  country: string;
  groupKey: string;
  score?: Score;
  /** Kicks scored in the shoot-out of a knockout fixture decided on penalties (→MATCH-6). */
  shootout?: Score;
}
export interface TableRow {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}
export interface StandingSnapshot {
  year: number;
  round: number;
  day: number;
  tier: number;
  group: number;
  /** Sorted by rank. Each row is [club index, points, goals for, goals against]. */
  rows: [number, number, number, number][];
}
export interface GoalScorer {
  /** Actual contributions by club, present after an in-league move. */
  clubs?: { club: string; goals: number; appearances: number }[];
  id: string;
  name: string;
  club: string;
  position: Position;
  goals: number;
  appearances: number;
}
export interface GoalScorerSnapshot {
  round: number;
  day: number;
  /** Sorted scorers. Each row is [player index, cumulative goals, appearances]. */
  rows: [number, number, number][];
}
export interface GoalScorerSeason {
  year: number;
  groupKey: string;
  /** Older saves begin tracking from the next round rather than inventing past scorers. */
  trackedSinceRound: number;
  players: GoalScorer[];
  history: GoalScorerSnapshot[];
}
export interface Highlight {
  minute: number;
  side: 0 | 1;
  player: string;
  action: string;
}
/** A card, substitution or injury of a rules 4.0.0 match, in time order (→MATCH-3, →MATCH-19). */
export interface Incident {
  /** Match minute 1–120; added time counts as the period's last minute. */
  minute: number;
  /** n of 45+n, 90+n, 105+n or 120+n. */
  added?: number;
  side: 0 | 1;
  kind: 'yellow' | 'secondYellow' | 'red' | 'sub' | 'injury';
  /** Player ID; for a substitution the player who left. */
  player: string;
  /** For a substitution, the substitute who came on. */
  other?: string;
  reason?: 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious' | 'violent';
}
/**
 * Post-match material of an own current-season match (→MATCH-25), kept until the season close
 * (→MATCH-5). Flat integer rows; the field comments below define their layouts.
 */
export interface MatchMaterial {
  /** Per shot 7 ints: side, line index in `players`, x×10, y×10, xG×100, outcome, header. */
  shots: number[];
  /** Own side: 40 cell touch counts per own line, then the own side total, then the opponent's. */
  heat: number[];
  /** Own side: [avgX×10, avgY×10, touches] per own line, then [from, to, completed] per pair. */
  network: number[];
  /** Per side 30 ints of the tactical report. */
  report: number[];
}
export interface MatchRecord extends Fixture {
  score: Score;
  metrics: [Metrics, Metrics];
  /** `detail` follows PD (contracts/detail.ts); present for every player or for none. */
  players: { id: string; metrics: Metrics; detail?: Metrics }[];
  highlights: Highlight[];
  tactics: [Tactic, Tactic];
  /** Expected goals of the duel chain, home then away, in hundredths; absent before rules 1.5.0. */
  xg?: [number, number];
  /** Advanced counters, home then away, following TD (contracts/detail.ts); from rules 1.6.0. */
  detail?: [Metrics, Metrics];
  /** Cards, substitutions and injuries in time order; from rules 4.0.0. */
  incidents?: Incident[];
  /** Player lines per side in `players`, home lines first. */
  lineCounts?: [number, number];
  /** Added minutes per period played: [first, second], or four with extra time. */
  added?: number[];
  /** The 90-minute score when extra time was played (→MATCH-6). */
  regulation?: Score;
  /** Kicks scored in a shoot-out. */
  shootout?: Score;
  /** Own current-season matches only (→MATCH-25). */
  material?: MatchMaterial;
  /** What both sides actually wore, frozen at settlement (→KIT-12); absent before identities. */
  appearance?: MatchAppearance;
  /** The match model that settled it (→SAVE-23); absent under the pre-feature model. */
  model?: MatchModelRevision;
  /**
   * The own-manager tenure responsible when it settled (→HIST-18), frozen then; absent before
   * tracking began, which stays unattributed.
   */
  managerTenure?: string;
}
export type PlayerMotionState =
  'shape' | 'support' | 'run' | 'press' | 'mark' | 'recover' | 'carry' | 'keeper';
export interface PlayerMotion {
  id: string;
  position: [number, number];
  /** Playback coordinates; scripted frames express velocity per match second. */
  velocity: [number, number];
  state: PlayerMotionState;
  intent: [number, number];
  /** The intention the engine holds for him (→MATCH-17); candidate observation only. */
  intention?: IntentionObservation;
}
export interface MatchMotionSample {
  elapsedSeconds: number;
  ball: [number, number];
  players: [PlayerMotion[], PlayerMotion[]];
  phase?: 'possession' | 'transition' | 'pass' | 'shot' | 'restart';
  ownerId?: string;
}
/**
 * One touch, restart or incident of a grid match minute (spec/ssot/MATCH.md).
 * Players are named by ID; positions are playback units of the minute's period. Observation only:
 * never archived.
 */
export interface MatchEvent {
  /** Seconds into the minute, 0–60. */
  t: number;
  kind:
    | 'kickoff'
    | 'pass'
    | 'cross'
    | 'cutBack'
    | 'carry'
    | 'takeOn'
    | 'shot'
    | 'clearance'
    | 'holdUp'
    | 'restart'
    | 'foul'
    | 'card'
    | 'sub'
    | 'injury'
    | 'offside'
    | 'whistle';
  /** The acting side. */
  side: 0 | 1;
  /** Player ID; empty for a whistle. */
  actor: string;
  /** Pass receiver; for a substitution, the substitute who came on. */
  receiver?: string;
  /** Interceptor, tackler, keeper or blocker; for a foul, the player fouled. */
  opponent?: string;
  from: [number, number];
  to: [number, number];
  ok?: boolean;
  lost?: boolean;
  outcome?: 'goal' | 'save' | 'block' | 'miss';
  restart?: 'kickoff' | 'throwIn' | 'goalKick' | 'corner' | 'freeKick' | 'penalty';
  card?: 'yellow' | 'red';
  xg?: number;
  header?: boolean;
  /** Locale-independent source commentary, resolved at presentation (→MATCH-24, ARCH-32). */
  text: string;
}
/** A dead ball in an observed frame (→WEB-32's dead-ball beat): `dead` ≤ `settled` ≤ `kick`. */
export interface FrameStoppage {
  kind: 'throwIn' | 'goalKick' | 'corner' | 'freeKick' | 'penalty' | 'kickoff' | 'dropBall';
  dead: number;
  settled: number;
  kick: number;
}
/** One match minute of a period, added minutes included. */
export interface MatchFrame {
  /** Match minute, capped at the period's end: added minutes of the first half read 45. */
  minute: number;
  score: Score;
  metrics: [Metrics, Metrics];
  ball: [number, number];
  side: 0 | 1;
  /** The formation slot (0 the keeper) of the player who leads the minute. */
  player: number;
  action: string;
  elapsedSeconds?: number;
  /** The players on the pitch: 10 or fewer after a red card or a man-short injury. */
  players?: [PlayerMotion[], PlayerMotion[]];
  motion?: MatchMotionSample[];
  /** The minute's touches, restarts and incidents (observed matches only). */
  events?: MatchEvent[];
  /** Cumulative expected goals after this minute, home then away (observed matches only). */
  xg?: [number, number];
  /**
   * The ball through this minute as ground x, ground y and height above the pitch (observed
   * matches only; never stored).
   */
  ballTrack?: [number, number, number][];
  /**
   * Elapsed match seconds where this minute starts and of each `ballTrack` knot (→MATCH-12);
   * absent on legacy frames, which decode at equal intervals.
   */
  startSeconds?: number;
  ballTimes?: number[];
  /**
   * Who has the ball through this minute (→WEB-95, observed matches only): from each change's
   * seconds into the minute (as an event's `t`), the holder's ID, or '' while nobody holds it (in
   * flight, loose or dead). Absent on older frames.
   */
  holders?: [number, string][];
  /**
   * The stoppages whose restart is kicked in this minute (→WEB-32, MATCH-12; observed candidate
   * matches only): when the ball went dead, when every player stood on his place and the kick, in
   * seconds from this minute's start (as an event's `t`, negative when the ball went dead in an
   * earlier minute of the period). A period's opening kick-off is a transition, not a stoppage.
   */
  stoppages?: FrameStoppage[];
  period: 1 | 2 | 3 | 4;
  /** '23', '45+2', '90+4', '105+1'. */
  label: string;
  /** Presentation weight, mean 1 over the match (→WEB-32); candidate frames hold it neutral. */
  pace: number;
  /** Player IDs on the pitch at the minute's end, in slot order where filled. */
  onPitch: [string[], string[]];
}
export interface MatchPlayback {
  record: MatchRecord;
  frames: MatchFrame[];
  /** Watched revision-11 matches hand their script to a presentation-only staging consumer. */
  script?: MatchScript;
  staging?: [StagingSide, StagingSide];
  /** Transient presentation progress only; never a world/save fact. */
  staged?: { done: boolean; error?: boolean };
  /** A failed script keeps its settled record and is never handed to the consumer (MATCH-38). */
  problems?: string[];
  /** Whole matchday rosters: the starters in slot order, then the bench. */
  squads: [Player[], Player[]];
}
export interface Event {
  year: number;
  round: number;
  kind: string;
  title: string;
  detail: string;
  amount?: string;
  currency?: string;
}
/** The single sponsor of rules before 1.16; a load moves it into its slot (→SAVE-10). */
export interface Sponsor {
  name: string;
  kind: SponsorKind;
  annual: string;
  bonus: string;
  until: number;
  lastPaid: number;
  index: number;
}
/**
 * One slot's sponsor contract (→ECON-8): an annual amount fixed for its term plus the slot's
 * bonus, paid by league payments (→ECON-14).
 */
export interface SponsorContract {
  slot: SponsorSlot;
  name: string;
  kind: SponsorKind;
  annual: string;
  bonus: string;
  /** Season year it was signed in. */
  from: number;
  /** First season year it no longer pays; it ends at the close before. */
  until: number;
  /** Last season year it was paid in full. */
  lastPaid: number;
  /** Price index at signing; an inflation-linked amount pays annual × current / this. */
  index: number;
}
export interface Campaign {
  id: string;
  kind: string;
  cost: string;
  started: number;
  remaining: number;
  income: string;
  fans: number;
}
/** Association totals in eighth-points, before division by distinct entrants (→EURO-13). */
export interface AssociationCoefficient {
  country: string;
  points: number;
  clubs: number;
}
export interface SeasonArchive {
  year: number;
  tier: number;
  group: number;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  cash: string;
  currency: string;
  income: string;
  expense: string;
  fans: number;
  rating: number;
  manager: string;
  metrics: Metrics;
  standings: number[][];
  champions: { country: string; club: string; cup: string; cupFinal?: CupFinal }[];
  europe: {
    kind: string;
    name: string;
    winner: string;
    field: number;
    standings?: number[][];
    secondStandings?: number[][];
    final?: CupFinal;
  }[];
  /** Absent for closes before association coefficients were recorded. */
  europeCoefficients?: AssociationCoefficient[];
  /** Club Elo at the season's close (→HIST-12). */
  elo?: number;
  /** Rank of that Elo among every club of the world. */
  eloRank?: number;
  /** Sum of the market values of the season-end squad. */
  squadValue?: string;
  /** Club valuation at the season's close (→HIST-12). */
  clubValue?: string;
  /** How far the own club went in each cup this season. */
  runs?: CupRun[];
  /** The own league's ten leading scorers (goals, then fewer appearances); club indexes `clubs`. */
  scorers?: {
    clubs?: { club: number; goals: number; appearances: number }[];
    name: string;
    club: number;
    position: Position;
    goals: number;
    appearances: number;
  }[];
  /** The own league position after each league round, first round first. */
  ranks?: number[];
  /** Club Elo at the close, rounded: world lowest, world highest, own league lowest, highest. */
  eloRange?: [number, number, number, number];
  /** The own country's cup and every continental knockout but the Super Cup. */
  brackets?: BracketArchive[];
  /** Own player ID → his 40 cell touch counts over the season's own matches (→MATCH-5). */
  heat?: Record<string, number[]>;
  /**
   * The season's Ballon d'Or podium, winner first (→PLAYER-27, HIST-13); absent before 1955/56,
   * for a season not tracked whole and for closes before the award existed.
   */
  ballonDor?: BallonDorPlace[];
}
/** A team honour that earned Ballon d'Or points, counted only with a contribution (→PLAYER-27). */
export type BallonDorHonour = 'europe' | 'europe-final' | 'continental' | 'league' | 'cup';
/** One Ballon d'Or place: the player's stable identity and the season's figures that placed him. */
export interface BallonDorPlace {
  id: string;
  name: string;
  /** The club of his last contribution that season. */
  club: string;
  position: Position;
  goals: number;
  assists: number;
  appearances: number;
  points: number;
  honours: BallonDorHonour[];
}
/** A club as a generation digest names it, so the start shows it without the world (→WEB-115). */
export interface DigestClub {
  id: string;
  name: string;
  country: string;
}
/**
 * A season's great feat while the world is generated, greatest first (→WEB-115): the war's stop and
 * restart, a treble, the European Cup lineage kept three seasons running, a third 발롱도르 in a
 * row, the European Cup kept two seasons running, a club's first European Cup, a league run.
 */
export type GenerationFeatKind =
  'war' | 'treble' | 'europe-three' | 'ballon-three' | 'europe-two' | 'europe-first' | 'league-run';
export interface GenerationFeat {
  kind: GenerationFeatKind;
  /** The feat's club; absent for the war. */
  club?: DigestClub;
  /** The 발롱도르 winner of `ballon-three`. */
  player?: string;
  /** The European Cup lineage's name in that season (European Cup, Champions League; →EURO-1). */
  competition?: string;
  /** Titles in a row: the run of a European, 발롱도르 or league feat. */
  count?: number;
}
/**
 * One season reached while the world is generated (→WEB-115, WORLD-13): the facts of the season
 * just closed, read from its archive and the clubs' Elo, never invented (→WORLD-8).
 */
export interface GenerationDigest {
  /** The season reached, standing on its first day. */
  season: number;
  /** The season just closed: 1938 for the 1946 restart (→WORLD-14). */
  closed: number;
  /** The world's ten best clubs by Club Elo, best first (→HIST-12). */
  elo: (DigestClub & { elo: number })[];
  /** Each playable association's league champion, in WORLD-1's order. */
  champions: { country: string; club: DigestClub }[];
  /** The winners of the continental competitions decided that season, the Super Cup aside. */
  europe: { kind: string; name: string; club: DigestClub }[];
  /** The 발롱도르 winner, from 1955/56 (→PLAYER-27). */
  ballonDor?: { name: string; club: DigestClub };
  /** The season's greatest feat, at most one. */
  feat?: GenerationFeat;
}
/** A finished knockout from its first round of 32 clubs or fewer to the final; clubs index `clubs`. */
export interface BracketArchive {
  /** `cup` for the domestic cup, otherwise the continental competition key. */
  key: string;
  rounds: {
    label: string;
    round: number;
    legs: 1 | 2;
    /**
     * One row per tie: [home, away, leg 1 home goals, leg 1 away goals, leg 2 home goals, leg 2
     * away goals, outcome]. Each leg is in its own fixture's order (the away club hosts leg 2; a
     * single match stores 0, 0); outcome is the winner's side (0 home, 1 away) + 2 if it went
     * through on penalties + 4 if on away goals.
     */
    ties: number[][];
    byes?: number[];
  }[];
}
/** The final of a cup: the beaten finalist, the score (winner first) and how a level final ended. */
export interface CupFinal {
  runnerUp: string;
  score: [number, number];
  decided?: 'pens';
}
export interface CupRun {
  /** `cup` for the domestic cup, otherwise the continental competition key. */
  key: string;
  name: string;
  /** Media name of the last round reached (결승, 4강, 리그 페이즈 …). */
  reached: string;
  champion?: boolean;
}
/** One tie of a knockout round: a single match, or two legs on aggregate. */
export interface KnockoutTie {
  /** Home side of the (first) leg. */
  home: string;
  away: string;
  /** Present once the last leg is played. */
  winner?: string;
  /** How a level tie went through: away goals or penalties after extra time. */
  decided?: 'away' | 'pens';
}
export interface KnockoutRound {
  /** Media name: 결승, 4강, 8강, 16강 …, 플레이오프, 1라운드. */
  label: string;
  /** League round of the (first) leg; a second leg follows a round later. */
  round: number;
  legs: 1 | 2;
  ties: KnockoutTie[];
  /** Seeded clubs that enter at the next round. */
  byes?: string[];
}
/** A country's single-elimination cup, played between league rounds (→LEAGUE-5). */
export interface DomesticCup {
  country: string;
  name: string;
  /** Entrants in seeding order: higher divisions first. */
  clubs: string[];
  rounds: KnockoutRound[];
  fixtures: Fixture[];
  winner?: string;
}
export interface EuropeTournament {
  key: string;
  name: string;
  field: number;
  format: 'knockout' | 'groups' | 'double-groups' | 'league';
  games: number;
  stage: string;
  clubs: string[];
  fixtures: Fixture[];
  standings: Record<string, TableRow>;
  winner?: string;
  ownExit?: string;
  /** The qualification cause recorded when this season was drawn, never recomputed on load. */
  ownQualification?: string;
  firstStandings?: number[][];
  secondStandings?: number[][];
  /** Knockout rounds drawn so far (→EURO-10). */
  rounds?: KnockoutRound[];
}
/** Dates are season year and day from August 1, never device time. */
export interface CareerDate {
  year: number;
  day: number;
}
export type CareerRole = 'player' | 'manager' | StaffRole;
export interface CareerEmployment {
  contractUntil?: CareerDate;
  wage?: string;
  currency?: string;
  grownThrough?: number;
  role: CareerRole;
  club: string;
  from: CareerDate;
  to?: CareerDate;
}
export interface MentorExposure {
  manager: string;
  name: string;
  school?: ManagerStyle;
  club: string;
  from: CareerDate;
  to?: CareerDate;
}
/** One joint player/staff proposal with immutable reviewed quote inputs. */
export interface PlayingCoachProposal {
  person: string;
  role: Exclude<StaffRole, 'director' | 'scout'>;
  years: 1 | 2;
  term: ContractTerm;
  created: CareerDate;
  playingEnd: number;
  playerUntil: number;
  coachUntil: number;
  playerWage: string;
  coachWage: string;
  totalWage: string;
  fee: string;
  replacement: string;
  upfront: string;
  replacing?: string;
  stamp: string;
  status: 'pending' | 'accepted' | 'declined';
  settled?: CareerDate;
}
/** Retained identities and actual facts only; unknown playing totals stay absent. */
export interface PersonCareer {
  id: string;
  name: string;
  born: number;
  position: Position;
  professionalism: Personality['professionalism'];
  qualities: OffPitchQualities;
  origin?: { club: string; slot: number };
  loan?: { club?: string; until: number };
  formerOwn?: boolean;
  ownCareer?: number[];
  playing: 'active' | 'released' | 'retired';
  club?: string;
  employment: CareerEmployment[];
  mentors: MentorExposure[];
  intention?: {
    at: CareerDate;
    draw: number;
    willing: boolean;
  };
  retirement?: { announced: CareerDate; year: number; at?: CareerDate };
  coaching?: {
    role: Exclude<StaffRole, 'director' | 'scout'>;
    ability: number;
    potential: number;
    at: CareerDate;
  };
  management?: { ability: number; potential: number; school: ManagerStyle; at: CareerDate };
}
/** One completed fee signing, sale or loan of our club (→HIST-20). */
export interface TransferFact {
  direction: 'in' | 'out';
  loan: boolean;
  /** Player.id */
  player: string;
  /** PersonCareer id when known. */
  person?: string;
  /** His name when it happened. */
  name: string;
  /** The other club's id when known. */
  club?: string;
  /** Minor units, as the ledger amount. */
  fee: string;
  /** As Event.currency at the time. */
  currency?: string;
  year: number;
  /** Season day (careerDate). */
  day: number;
}
export interface TransferRecords {
  /** w.events.length when the first fact was recorded: ledger entries before it are the older career's (→HIST-20). */
  ledgerBefore: number;
  facts: TransferFact[];
}

export interface World {
  schema: 1;
  /** The game version whose rules it plays (→SAVE-10, SAVE-26). */
  engine: string;
  catalog: string;
  catalogHash: string;
  id: string;
  seed: string;
  /** Live players of playable clubs nobody owns, chosen eighteen first; ours stay in `players`. */
  squads?: Record<string, Player[]>;
  year: number;
  round: number;
  revision: number;
  /** Days since August 1 of the current season. Absent in older saves. */
  calendar?: { day: number };
  /** All clubs in the player's league, retained for the latest ten seasons. */
  rankHistory?: StandingSnapshot[];
  /** Actual league goals and appearances with round snapshots, for the current season. */
  scorerSeason?: GoalScorerSeason;
  playerClub: string;
  clubs: Club[];
  people?: Record<string, PersonCareer>;
  playingCoachProposals?: Record<string, PlayingCoachProposal>;
  coachingMarketAt?: CareerDate;
  recruitmentArrivals?: RecruitmentArrival[];
  replacementNeeds?: {
    line: Line;
    playerId: string;
    year: number;
    window: 'summer' | 'winter';
    day: number;
  }[];
  mediations?: RecruitmentMediation[];
  promises?: ReinforcementPromise[];
  players: Player[];
  /** The squad's settled rounds in a row under 하드 (→CLUB-19). */
  hardStreak?: number;
  /** Last settled training boundary, preventing repeated development/recovery. */
  trainingAt?: string;
  /** Last settled NPC round-growth boundary and annual lifecycle (→WORLD-16). */
  npcGrowthAt?: { year: number; round: number };
  npcRetirementAt?: number;
  npcSummerAt?: number;
  /** Club operating policy; absent means POLICY_DEFAULTS. */
  policy?: SavedPolicy;
  /** Coaching staff below the manager. Absent in older saves, whose effects stay neutral. */
  staff?: Staff[];
  academy?: Academy;
  /** Game-owned authority, progression mode and observation preferences (→WEB-45). */
  settings?: GameSettings;
  /** Explicit optional business decisions; notification reads never resolve these. */
  decisionChoices?: string[];
  /**
   * Settled days each owner-held approval has waited, by decision id (→STAFF-48); absent while
   * nothing waits and in older saves, which count from 0.
   */
  approvalWaits?: Record<string, number>;
  /** Season-review recommendations retained independently of the bounded notification feed. */
  academyReviews?: { id: string; year: number; kind: 'promote' | 'release' }[];
  bids?: TransferBid[];
  inbox?: InboxItem[];
  /** Squad morale 0–100; absent in older saves, which keep pre-morale strength. */
  morale?: number;
  /** The club build, one card per slot (→ECON-22); absent slots are standard. */
  build?: ClubBuild;
  /**
   * A strategy reserved for the next season, written only by rules 1.13–1.15; writer activation
   * drops it with an inbox item (→SAVE-10), and the engine never reads it.
   */
  buildNext?: { build: ClubBuild; name?: string };
  /** The manager market (→STAFF-17); absent until it first moves, when the season's four seed it. */
  managerMarket?: ManagerMarket;
  /** The staff markets (→STAFF-49); absent until they first change, when the season seeds them. */
  staffMarket?: StaffMarket;
  /** The chief scout's shortlist and the manager's requests (→CLUB-33); absent until first drawn. */
  shortlist?: Shortlist;
  /**
   * The free agents (→CLUB-49), at most FREE_AGENT_CAP: replaced whole on every change, never
   * edited in place (`free-agents.ts` owns it); absent in a world made before the pool.
   */
  freeAgents?: FreeAgent[];
  manager: Manager;
  tactic: Tactic;
  fixtures: Fixture[];
  tables: Record<string, TableRow>;
  /** Bounded cross-season results for every club; absent in saves made before tracking. */
  recentResults?: RecentResults;
  /** The owner's shirt for one named unplayed own fixture (→KIT-7); absent is automatic. */
  kitChoice?: FixtureKitChoice;
  /** The designer's drafts waiting for the owner's pick; absent when none was commissioned. */
  designCommission?: DesignCommission;
  ownMatches: MatchRecord[];
  /** Source-linked headlines and incremental record counters; absent in older saves. */
  newsJournal?: NewsJournal;
  careerReads?: CareerReads;
  /** The persisted match model and its counters' coverage (→SAVE-23); absent before activation. */
  matchModel?: MatchModelState;
  /** Current-season NPC aggregates under the full model (→HIST-17); absent before activation. */
  npcSeason?: NpcSeasonStats;
  /**
   * Own-manager tenures and their attributed outcomes (→HIST-18/19, SAVE-24), tracked from the
   * founding or a writer activation; absent in a career not yet tracked.
   */
  managerHistory?: ManagerHistoryFacts;
  /** Our club's fee transfers (→HIST-20); absent until the first is recorded. */
  transfers?: TransferRecords;
  history: SeasonArchive[];
  events: Event[];
  cash: string;
  income: string;
  expense: string;
  /**
   * This season's operating expenses (→ECON-30), recorded when it starts: a share of the last
   * completed season's turnover, never below the floor of the division played. Absent in worlds
   * saved before rules 1.16, which pay that floor until their next season starts (→SAVE-10).
   */
  operatingExpenses?: string;
  currency: string;
  priceIndex: number;
  /** The stadium's step 0–8 (→ECON-32): 2,500 seats at founding, 90,000 at the top. */
  stadium: number;
  /** Training ground level 0–5 (→ECON-32). */
  trainingGround: number;
  /** Academy facilities level 0–5 (→ECON-32). */
  academyFacility: number;
  /** Facility works in progress, one per part: the step or level it builds and the day it began. */
  facilityWorks?: Partial<Record<FacilityPart, { to: number; year: number; day: number }>>;
  ticket: number;
  campaigns: Campaign[];
  /**
   * Written only by rules before 1.16, which kept one sponsor; a load moves it into `sponsors`
   * (→SAVE-10), so a validated world never has it.
   */
  sponsor?: Sponsor;
  /** One contract per open slot at most (→ECON-8); absent or missing slots are empty. */
  sponsors?: SponsorContract[];
  /** The direction rows the delegated staff follow (→ECON-25); absent rows are at their default. */
  direction?: Direction;
  /** The owner's spending request per delegated responsibility; absent is 적당히 (3). */
  delegationRequests?: Partial<Record<BudgetResponsibility, SpendRequest>>;
  /**
   * The 단장's season plan: the season's income he planned on and the player sales already in
   * when he made it, written at each plan moment (→`delegation.ts`). Absent, or from another
   * season, the plans read the income projection live.
   */
  budgetPlan?: { year: number; revenue: string; sales: string };
  /** 지역 기반 and 글로벌 인지도, 0–100 (→ECON-34); absent is 0. */
  localBase?: number;
  globalReach?: number;
  cupWinners: Record<string, string>;
  /** This season's domestic cups, one per country (→LEAGUE-5); absent in older saves. */
  cups?: DomesticCup[];
  europe: EuropeTournament[];
  lastChampions: { country: string; club: string; cup: string }[];
  critical?: string;
  /** League rounds settled in a row with negative cash (→ECON-24); absent while solvent. */
  insolvent?: number;
  /** The day the club went bankrupt: the career is over and nothing advances (→ECON-24). */
  bankrupt?: { year: number; round: number; day: number };
  receiptIds: string[];
  /** Yellow cards, bans and NPC injuries of every club (→MATCH-19, →LEAGUE-15); from rules 4.0.0. */
  discipline?: DisciplineState;
  /** The owner who took the club over (→OWNER); absent in a founded career. */
  owner?: OwnerState;
  /** The club's debt at the takeover, repaid as a loan (→ECON-38); absent once repaid or never owed. */
  loan?: TakeoverLoan;
  /** What ended the career (→OWNER-16): nothing advances and only the inbox is read after it. */
  ended?: EndCause;
}
/** The competition a card counts in: the league, one domestic cup, or Europe (→MATCH-19). */
export type CompetitionKey = 'league' | `cup:${string}` | 'europe';
/** A suspension: matches still to serve in `scope`; domestic covers the league and every cup. */
export interface Ban {
  player: string;
  club: string;
  matches: number;
  scope: 'domestic' | CompetitionKey;
  reason: NonNullable<Incident['reason']> | 'secondYellow' | 'yellows';
}
/** An NPC player out injured until that date (→LEAGUE-15). */
export interface Unavailable {
  player: string;
  club: string;
  until: { year: number; day: number };
}
export interface DisciplineState {
  year: number;
  /** Player ID → competition → yellow cards this season. */
  yellows: Record<string, Partial<Record<CompetitionKey, number>>>;
  bans: Ban[];
  out: Unavailable[];
}
export type Command =
  | { type: 'settings'; settings: GameSettings }
  | { type: 'club-policy'; key: PolicyKey; level: PolicyLevel }
  | { type: 'club-direction'; key: DirectionKey; choice: string }
  | { type: 'club-build'; slot: keyof ClubBuild; choice: string }
  | { type: 'club-ticket'; price: number }
  | { type: 'delegation-request'; responsibility: BudgetResponsibility; level: SpendRequest }
  | { type: 'coaching-investment'; choice: 'volunteer' | 'cheap' | 'standard' | 'elite' }
  | { type: 'facility-upgrade'; part: FacilityPart; from: number; cost: string }
  | { type: 'next-event' }
  | { type: 'advance'; rounds: number }
  /** Stops early on the day a new unread attention item of a `stop` kind arrives. */
  | { type: 'advance-days'; days: number; stop?: InboxKind[] }
  | { type: 'next-match' }
  | { type: 'season'; count: number }
  /** `term`: the seasons the owner chooses (→STAFF-15); absent keeps the earlier rule. */
  | {
      type: 'hire-staff';
      role: StaffRole;
      candidate: number;
      term?: ContractTerm;
      candidateId?: string;
    }
  | { type: 'release-staff'; role: StaffRole }
  | { type: 'renew-staff'; role: StaffRole; term?: ContractTerm }
  | { type: 'promote-youth'; id: string }
  | { type: 'release-youth'; id: string }
  /** Exactly one of the legacy index or stable target is required at the boundary. */
  | { type: 'bid'; candidate?: number; target?: WorldMarketTarget; fee: string; loan?: boolean }
  | { type: 'respond-bid'; id: string; accept: boolean }
  | { type: 'read-inbox'; id?: string }
  | { type: 'resolve-mediation'; id: string; support: MediationSupport }
  | { type: 'answer-playing-coach'; player: string; accept: boolean }
  /**
   * Hires a manager from the market (→STAFF-17), by id: a free agent or another club's manager.
   * `term`: the seasons the owner chooses (→STAFF-14); absent keeps the earlier rule.
   */
  | { type: 'hire'; id: string; term?: ContractTerm }
  /** Renews the manager whose contract ends at this season's close; `term` as for `hire`. */
  | { type: 'renew-manager'; term?: ContractTerm }
  /** Answers a player's contract talk (→CLUB-26) with a wage fixed for `term` seasons. */
  | { type: 'contract-offer'; player: string; wage: string; term: TalkTerm }
  /** Declines a player's contract talk (→CLUB-27). */
  | { type: 'contract-decline'; player: string }
  /** Signs a slot's offer, by its index among that slot's offers (→ECON-8). */
  | { type: 'sign-sponsor'; slot: SponsorSlot; offer: number }
  | { type: 'recruit'; candidate?: number; target?: WorldMarketTarget; loan?: boolean }
  /** Lists a player, opens him to offers or declares him untouchable. */
  | { type: 'transfer-stance'; id: string; stance: TransferStance }
  /** Pays a designer from operating funds for fresh drafts in the owner's colours. */
  | { type: 'design-commission'; studio: DesignStudio; colours: IdentityColours }
  /** Applies one of the commissioned drafts and closes the commission. */
  | { type: 'adopt-design'; draft: number }
  /** Throws every commissioned draft away; the fee stays spent. */
  | { type: 'discard-designs' }
  /** Pays half the fee for fresh drafts from the same designer in the same colours. */
  | { type: 'redraw-designs' }
  /** Our shirt role for the named next own fixture (→KIT-6); `null` returns it to automatic. */
  | { type: 'match-kit'; fixtureId: string; role: KitRole | null }
  /** The business stake, whole percent of the fortune, from the next settlement (→OWNER-7). */
  | { type: 'owner-stake'; percent: number }
  /** Puts this much of the owner's fortune into the club's cash (자금 투입, →OWNER-9/10). */
  | { type: 'owner-inject'; amount: string }
  /** The share of the season's profit the close pays the owner (배당, →OWNER-11). */
  | { type: 'owner-dividend'; share: DividendShare };
