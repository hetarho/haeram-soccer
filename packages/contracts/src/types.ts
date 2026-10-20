import type { ClubBuild } from './build';
import type { ClubIdentity, FixtureKitChoice, MatchAppearance } from './identity';
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
export type CountryCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'POR' | 'NED' | 'BEL';
export type Tactic = 'balanced' | 'possession' | 'counter' | 'press';
/** The first team's training focus (→CLUB-11): 균형, 회복 or 하드 트레이닝. */
export type TrainingFocus = 'balanced' | 'recovery' | 'hard';
/** The four difficulty levels; each sets only the starting cash and squad (→WEB-3). */
export type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'extreme';
/** The facility parts the owner builds separately (→ECON-32). */
export type FacilityPart = 'stadium' | 'training' | 'academy';
/** The academy's training focus, set by the youth director (→CLUB-31). */
export type YouthFocus = 'balanced' | 'fundamentals' | 'firstTeam';
/** The coaches who set a training focus (→STAFF-19). */
export type TrainingCoach = 'assistant' | 'youth';
/** A focus the owner had a coach take: accepted when suggested, or forced (→STAFF-19). */
export interface TrainingOrder<F> {
  focus: F;
  /** Settled rounds it still holds. */
  rounds: number;
  forced?: true;
}
/**
 * The board's dials (→ECON-16): squad investment, recruitment, academy investment and, from rules
 * 1.19, the 지역 and 글로벌 rows (주변 투자, 풀뿌리 유망주 투자, 해외 마케팅, 해외 스카우트망 and
 * 해외 투어, which has three levels) in place of the marketing dial.
 */
export type PolicyKey =
  | 'support'
  | 'recruitment'
  | 'academy'
  | 'localInvest'
  | 'grassroots'
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
/** One coaching department's hiring and renewal (→STAFF-15). */
export type CoachDelegationKey = `coach:${StaffRole}`;
/**
 * A decision the staff can take for the owner (→STAFF-13): `contracts` player contract talks
 * (→CLUB-26), `manager` the manager post (→STAFF-18) and one `coach:<department>` per coaching
 * department. Which of them the staff take is decided by the intervention level alone (→WEB-45).
 */
export type DelegationKey =
  'academy' | 'transfers' | 'business' | 'contracts' | 'manager' | CoachDelegationKey;
/**
 * How much the owner decides himself (→WEB-45): 1 every decision, 2 important decisions only,
 * 3 transfers only, 4 leave it to the staff.
 */
export type InterventionLevel = 1 | 2 | 3 | 4;
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
 * The direction rows the delegated staff follow (→ECON-25), each absent at its default (표준, or
 * any school): 재계약 기조 (→CLUB-26), 선호 학파 and 감독 기조 (→STAFF-18), 코치 기조 (→STAFF-15),
 * 재정 기조 (→ECON-33), 육성 목표 and 데뷔 시점 (→CLUB-32).
 */
export interface Direction {
  /** Standing recruitment mediation support; absent means balanced (→STAFF-26). */
  recruitmentSupport?: 'director' | 'manager';
  renewal?: 'keepAll' | 'coreOnly' | 'frugal' | 'youngFirst';
  school?: ManagerStyle;
  manager?: 'developer' | 'proven' | 'young' | 'cheap';
  coaches?: 'volunteer' | 'cheap' | 'elite';
  finance?: 'aggressive' | 'bold' | 'careful' | 'stable';
  /** 육성 목표 (→CLUB-32): what the academy is for. */
  youthGoal?: 'firstTeam' | 'sell' | 'minimal';
  /** 데뷔 시점 (→CLUB-32): how early prospects go up. */
  debut?: 'early' | 'ready' | 'late';
}
export type DirectionKey = keyof Direction;
/** What rules before 1.17 kept for the delegated staff's hiring; a load turns it into rows (→SAVE-10). */
export interface HiringCriteria {
  manager?: ManagerCriteria;
  coaches?: Partial<Record<StaffRole, CoachCriteria>>;
}
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
}
/** Why a player turned unhappy (→CLUB-27): the club declined his renewal or improved contract. */
export type UnhappyReason = 'renewal-declined' | 'improve-declined' | 'ambition';
/**
 * Ledger kinds of competition money (→ECON-28), sponsor contracts (→ECON-8), expiring contracts
 * (→CLUB-28) and operating expenses (→ECON-30); `Event.kind` stays a string, so older entries keep
 * theirs.
 */
export type LedgerKind =
  | 'league-share'
  | 'league-merit'
  | 'parachute'
  | `sponsor:${SponsorSlot}`
  | 'free-transfer-compensation'
  | 'operating-expenses';
/** A player's standing on the market (→CLUB-22): listed to sell, open to offers, or untouchable. */
export type TransferStance = 'listed' | 'open' | 'untouchable';
/** Owner requests to the manager and staff (→CLUB-20). */
export type CareKind =
  | 'rest-day'
  | 'recovery'
  | 'meeting'
  | 'bonding'
  | 'camp'
  | 'backing'
  | 'win-bonus'
  | 'owner-visit'
  | 'friendly';
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
  /** Up to three market candidates per line, best first; one no longer available drops on reading. */
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
  /** Level a rare project (new owner, golden generation) adds, fading each summer (→LEAGUE-10). */
  project?: number;
  /** Crest, representative colours and saved shirts (→KIT-1); absent in older saves. */
  identity?: ClubIdentity;
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
  conflicts: number;
  wage: string;
  since: number;
  until: number;
  interim: boolean;
  lastRequest?: string;
  /** Bounded per-round replies and positive-trust guard; absent in older saves. */
  requestHistory?: { at: string; keys: string[]; trustAwarded: boolean };
  pending?: Tactic;
  /** Selection habit; absent means the neutral pre-trait selection. */
  trait?: ManagerTrait;
  /** School of football; absent means the neutral founding all-rounder. */
  style?: ManagerStyle;
  /** Birth year and the ability he can grow to (→STAFF-16); absent in older saves, which stay put. */
  born?: number;
  potential?: number;
  /** Seasons the owner chose at his last hiring or renewal (→STAFF-14); absent before rules 1.16. */
  term?: ContractTerm;
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
  /** Orders the owner forced on him this season (→STAFF-19). */
  strain?: { year: number; count: number };
  /** The settled round of the owner's last suggestion to him (→STAFF-19). */
  asked?: { year: number; round: number };
}
export interface Academy {
  /** Academy prospects are not first-team players until promoted. */
  players: Player[];
  /** Last season year whose intake was settled. */
  intakeYear?: number;
}
export interface TransferBid {
  id: string;
  /** `out`: our offer for a market player. `in`: another club's offer for our player. */
  direction: 'out' | 'in';
  playerId: string;
  /** The bidding club for `in` bids. */
  club?: string;
  fee: string;
  loan?: boolean;
  /**
   * The market player and asking terms an `out` bid was made for (rules 1.15.0); a bid pending
   * from before has none and finds him in its season's list.
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
  kind: 'league' | 'cup' | 'europe' | 'playoff' | 'lower';
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
 * (→MATCH-5). Flat integer rows; the layouts are docs/MATCH-ENGINE-DESIGN.md §9.4.
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
}
export type PlayerMotionState =
  'shape' | 'support' | 'run' | 'press' | 'mark' | 'recover' | 'carry' | 'keeper';
export interface PlayerMotion {
  id: string;
  position: [number, number];
  velocity: [number, number];
  state: PlayerMotionState;
  intent: [number, number];
}
export interface MatchMotionSample {
  elapsedSeconds: number;
  ball: [number, number];
  players: [PlayerMotion[], PlayerMotion[]];
  phase?: 'possession' | 'transition' | 'pass' | 'shot' | 'restart';
  ownerId?: string;
}
/**
 * One touch, restart or incident of a grid match minute (docs/MATCH-ENGINE-DESIGN.md §2.4).
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
  /** Korean commentary (→MATCH-24). */
  text: string;
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
  period: 1 | 2 | 3 | 4;
  /** '23', '45+2', '90+4', '105+1'. */
  label: string;
  /** Presentation weight, mean 1 over the match (→WEB-32). */
  pace: number;
  /** Player IDs on the pitch at the minute's end, in slot order where filled. */
  onPitch: [string[], string[]];
}
export interface MatchPlayback {
  record: MatchRecord;
  frames: MatchFrame[];
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
    encouraged?: { at: CareerDate; changed: boolean };
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

export interface World {
  schema: 1;
  engine: string;
  catalog: string;
  catalogHash: string;
  id: string;
  seed: string;
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
  /** The difficulty level the club was founded at (→WEB-3). */
  level: DifficultyLevel;
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
  /** Preferred starting XI, one player per slot of the applied tactic's formation (→STAFF-22). */
  lineup?: string[];
  /**
   * Focuses the owner had the coaches take (→STAFF-19); without one the coaches set it by rule
   * (→CLUB-13, CLUB-31).
   */
  trainingOrders?: {
    assistant?: TrainingOrder<TrainingFocus>;
    youth?: TrainingOrder<YouthFocus>;
    /** A first-team player's own focus, by player id (→CLUB-11). */
    players?: Record<string, TrainingOrder<TrainingFocus>>;
    /** The settled round of the owner's last suggestion for each player (→STAFF-19). */
    asked?: Record<string, { year: number; round: number }>;
    /** The squad's settled rounds in a row under 하드 (→CLUB-19). */
    hardStreak?: number;
  };
  /** Last settled training boundary, preventing repeated development/recovery. */
  trainingAt?: string;
  /** Club operating policy; absent means POLICY_DEFAULTS. */
  policy?: SavedPolicy;
  /** Coaching staff below the manager. Absent in older saves, whose effects stay neutral. */
  staff?: Staff[];
  academy?: Academy;
  /**
   * The intervention level (→WEB-45), which alone decides what the staff take on the owner's
   * behalf; absent means 1, the owner decides everything.
   */
  intervention?: InterventionLevel;
  /** Game-owned authority, progression mode and observation preferences (→WEB-45). */
  settings?: GameSettings;
  /** Explicit optional business decisions; notification reads never resolve these. */
  decisionChoices?: string[];
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
  /** The chief scout's shortlist and the manager's requests (→CLUB-33); absent until first drawn. */
  shortlist?: Shortlist;
  /** Win bonus promised for the next own matches: pays per win until `matches` run out. */
  winBonus?: { matches: number };
  manager: Manager;
  tactic: Tactic;
  requested?: Tactic;
  fixtures: Fixture[];
  tables: Record<string, TableRow>;
  /** The owner's shirt for one named unplayed own fixture (→KIT-7); absent is automatic. */
  kitChoice?: FixtureKitChoice;
  ownMatches: MatchRecord[];
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
  support: number;
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
  /** 지역 기반 and 글로벌 인지도, 0–100 (→ECON-34); absent is 0. */
  localBase?: number;
  globalReach?: number;
  cupWinners: Record<string, string>;
  /** This season's domestic cups, one per country (→LEAGUE-5); absent in older saves. */
  cups?: DomesticCup[];
  europe: EuropeTournament[];
  lastChampions: { country: string; club: string; cup: string }[];
  lower: boolean;
  critical?: string;
  /** League rounds settled in a row with negative cash (→ECON-24); absent while solvent. */
  insolvent?: number;
  /** The day the club went bankrupt: the career is over and nothing advances (→ECON-24). */
  bankrupt?: { year: number; round: number; day: number };
  receiptIds: string[];
  /** Yellow cards, bans and NPC injuries of every club (→MATCH-19, →LEAGUE-15); from rules 4.0.0. */
  discipline?: DisciplineState;
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
export interface Founding {
  country: CountryCode;
  name: string;
  color: string;
  seed: string;
  level: DifficultyLevel;
  /** The direction preset chosen at founding (→WEB-15); absent is 기본 방향. */
  preset?: string;
  /** The previewed founding identity (→KIT-14); its first colour equals `color`. */
  identity?: ClubIdentity;
}
export type Command =
  | { type: 'settings'; settings: GameSettings }
  | { type: 'next-event' }
  | { type: 'advance'; rounds: number }
  /** Stops early on the day a new unread attention item of a `stop` kind arrives. */
  | { type: 'advance-days'; days: number; stop?: InboxKind[] }
  | { type: 'next-match' }
  | { type: 'season'; count: number }
  | { type: 'tactics'; tactic: Tactic; tone: string }
  | { type: 'lineup'; ids: string[] | null }
  /** A training focus suggested to a coach, or forced on him (→STAFF-19). */
  | {
      type: 'coach-training';
      coach: TrainingCoach;
      focus: TrainingFocus | YouthFocus;
      force?: boolean;
      /** One first-team player's own focus instead of the squad's (→CLUB-11). */
      player?: string;
    }
  | { type: 'policy'; key: PolicyKey; level: PolicyLevel }
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
  | { type: 'intervention'; level: InterventionLevel }
  | { type: 'bid'; candidate: number; fee: string; loan?: boolean }
  | { type: 'respond-bid'; id: string; accept: boolean }
  | { type: 'read-inbox'; id?: string }
  | { type: 'encourage-coaching'; player: string }
  | { type: 'resolve-mediation'; id: string; support: MediationSupport }
  | { type: 'propose-playing-coach'; player: string; years: 1 | 2; term: ContractTerm }
  | { type: 'answer-playing-coach'; player: string; accept: boolean }
  /**
   * Hires a manager from the market (→STAFF-17), by id: a free agent or another club's manager.
   * `term`: the seasons the owner chooses (→STAFF-14); absent keeps the earlier rule.
   */
  | { type: 'hire'; id: string; term?: ContractTerm }
  /** Renews the manager whose contract ends at this season's close; `term` as for `hire`. */
  | { type: 'renew-manager'; term?: ContractTerm }
  /** Sets one direction row; `standard` (or `any` for the school) is its default (→ECON-25). */
  | { type: 'direction'; key: DirectionKey; option: string }
  /** Answers a player's contract talk (→CLUB-26) with a wage fixed for `term` seasons. */
  | { type: 'contract-offer'; player: string; wage: string; term: TalkTerm }
  /** Declines a player's contract talk (→CLUB-27). */
  | { type: 'contract-decline'; player: string }
  /** Signs a slot's offer, by its index among that slot's offers (→ECON-8). */
  | { type: 'sign-sponsor'; slot: SponsorSlot; offer: number }
  | { type: 'recruit'; candidate: number; loan?: boolean }
  /** Lists a player, opens him to offers or declares him untouchable. */
  | { type: 'transfer-stance'; id: string; stance: TransferStance }
  | { type: 'campaign'; kind: string }
  | { type: 'sponsor'; kind: Sponsor['kind'] }
  | { type: 'facility'; part: FacilityPart }
  | { type: 'ticket'; price: number }
  | { type: 'support' }
  | { type: 'accept-condition' }
  | { type: 'care'; kind: CareKind }
  /**
   * Applies a strategy at once (→ECON-22); `name` labels an owner's saved strategy in the club's
   * history (→WEB-61).
   */
  | { type: 'build'; build: ClubBuild; name?: string };
