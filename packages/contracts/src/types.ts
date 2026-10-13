import type { ClubBuild } from './build';
export type { ClubBuild, BuildSlot } from './build';
export type CountryCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'POR' | 'NED' | 'BEL';
export type Tactic = 'balanced' | 'possession' | 'counter' | 'press';
export type TrainingFocus = 'balanced' | 'youth' | 'recovery';
export type PolicyKey = 'support' | 'recruitment' | 'marketing' | 'academy';
export type PolicyLevel = 1 | 2 | 3 | 4 | 5;
export type ClubPolicy = Record<PolicyKey, PolicyLevel>;
/** Saved policy: keys added later (academy) may be absent and resolve to their defaults. */
export type SavedPolicy = Omit<ClubPolicy, 'academy'> & { academy?: PolicyLevel };
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';
/** Backroom roles below the manager, following a professional club's coaching staff. */
export type StaffRole =
  'assistant' | 'attack' | 'defense' | 'goalkeeping' | 'fitness' | 'youth' | 'scout';
export type StaffTrait = 'developer' | 'specialist' | 'recovery' | 'spotter' | 'negotiator';
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
/** `contracts`: player contract talks (→CLUB-26); `manager`: the manager post (→STAFF-18). */
export type DelegationKey =
  'training' | 'academy' | 'transfers' | 'business' | 'staff' | 'contracts' | 'manager';
/**
 * How delegated staff appoint a manager (→STAFF-18): the departing manager's school (the
 * default), the best by OVR, or the school the operating strategy's aimed synergy needs.
 */
export type ManagerRule = 'school' | 'best' | 'strategy';
/** Seasons a contract is signed for (→CLUB-26, STAFF-14). */
export type ContractTerm = 1 | 2 | 3 | 4 | 5;
/** Coaching investment (→STAFF-15): 1 volunteers only, 2 mid-market coaches, 3 the best available. */
export type CoachingLevel = 1 | 2 | 3;
/**
 * Sponsor slots in the order they open (→ECON-8): 지역 후원, 용품 후원, 메인 스폰서, 경기장 명명권,
 * 소매 스폰서. The catalog says when each opens per country.
 */
export type SponsorSlot = 'local' | 'kit' | 'shirt' | 'stadium' | 'sleeve';
/** Guaranteed, performance-linked, exclusive (no merchandise campaigns) or inflation-linked. */
export type SponsorKind = 'stable' | 'performance' | 'exclusive' | 'indexed';
/** Why a player turned unhappy (→CLUB-27): the club declined his renewal or his raise. */
export type UnhappyReason = 'renewal-declined' | 'raise-declined';
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
  /** Level a rare project (new owner, golden generation) adds, fading each summer (→LEAGUE-10). */
  project?: number;
}
export interface Player {
  id: string;
  name: string;
  role: Role;
  born: number;
  attack: number;
  passing: number;
  defense: number;
  keeper: number;
  stamina: number;
  potential: number;
  reputation: number;
  wage: string;
  until: number;
  status: 'active' | 'sold' | 'retired';
  fatigue: number;
  /** Cumulative actual positive mean development of role skills, in hundredths. */
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
  /** Season year he last asked for a raise: at most once a season (→CLUB-26). */
  raiseAsked?: number;
  /** Unhappy since this day, and why (→CLUB-27). */
  unhappy?: { reason: UnhappyReason; year: number; day: number };
  /** The day he handed in a transfer request: listed, never untouchable (→CLUB-27). */
  transferRequest?: { year: number; day: number };
}
/**
 * A player's contract talk (→CLUB-26): his demand, the floor he accepts at or above (demand ×
 * (1 − goodwill)) and the season day he asked.
 */
export interface ContractTalk {
  kind: 'renew' | 'raise';
  demand: string;
  floor: string;
  year: number;
  day: number;
}
export interface Manager {
  id: string;
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
}
export interface InboxItem {
  id: string;
  year: number;
  day: number;
  kind: InboxKind;
  title: string;
  detail: string;
  /** Attention items stop automatic progression until read. */
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
  id: string;
  name: string;
  club: string;
  role: Role;
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
 * One duel of the minute's possession chain. Slots index the side's starting XI; `side` is the
 * team in possession when the duel starts. Observation only: never archived.
 */
export interface MatchEvent {
  /** Seconds into the minute, 0–60. */
  t: number;
  /**
   * A restart opens a minute that the other side ended with the ball: it went out of play off
   * them and `side` restarts it to `actor` (MATCH-12).
   */
  kind: 'pass' | 'dribble' | 'shot' | 'restart';
  side: 0 | 1;
  /** Passer, dribbler or shooter; for a restart, the player it reaches. */
  actor: number;
  /** Pass receiver (or the teammate who recovered a loose ball). */
  receiver?: number;
  /** Opposing marker, tackler, blocker or keeper slot; for a restart, who put the ball out. */
  opponent?: number;
  restart?: 'throwIn' | 'goalKick' | 'corner';
  /** Pass completed or dribble beaten; shots use `outcome`. */
  ok?: boolean;
  /** A failed pass or dribble lost the ball to `opponent`. */
  lost?: boolean;
  outcome?: 'goal' | 'save' | 'block' | 'miss';
  xg?: number;
  /** Zone the ball reaches: 0 build-up, 1 midfield, 2 final third (attacking direction). */
  zone: 0 | 1 | 2;
}
export interface MatchFrame {
  minute: number;
  score: Score;
  metrics: [Metrics, Metrics];
  ball: [number, number];
  side: 0 | 1;
  player: number;
  action: string;
  elapsedSeconds?: number;
  players?: [PlayerMotion[], PlayerMotion[]];
  motion?: MatchMotionSample[];
  /** The minute's duel chain (observed matches only). */
  events?: MatchEvent[];
  /** Cumulative expected goals after this minute, home then away (observed matches only). */
  xg?: [number, number];
  /**
   * The ball every motion integration step of this minute as ground x, ground y and height above
   * the pitch (observed matches only; never stored).
   */
  ballTrack?: [number, number, number][];
}
export interface MatchPlayback {
  record: MatchRecord;
  frames: MatchFrame[];
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
  scorers?: { name: string; club: number; role: Role; goals: number; appearances: number }[];
  /** The own league position after each league round, first round first. */
  ranks?: number[];
  /** Club Elo at the close, rounded: world lowest, world highest, own league lowest, highest. */
  eloRange?: [number, number, number, number];
  /** The own country's cup and every continental knockout but the Super Cup. */
  brackets?: BracketArchive[];
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
  difficulty: number;
  clubs: Club[];
  players: Player[];
  /** Preferred starting XI in goalkeeper, four defenders, three midfielders, three forwards order. */
  lineup?: string[];
  /** Older saves use balanced training until a focus is chosen. */
  training?: TrainingFocus;
  /** Last settled training boundary, preventing repeated development/recovery. */
  trainingAt?: string;
  /** Club operating policy; absent means POLICY_DEFAULTS. */
  policy?: SavedPolicy;
  /** Coaching staff below the manager. Absent in older saves, whose effects stay neutral. */
  staff?: Staff[];
  academy?: Academy;
  /** Decisions the staff makes on the owner's behalf; absent keys mean the owner decides. */
  delegation?: Partial<Record<DelegationKey, boolean>>;
  /** Coaching investment per department that delegated staff hire to (→STAFF-15); absent is 2. */
  coaching?: Partial<Record<StaffRole, CoachingLevel>>;
  bids?: TransferBid[];
  inbox?: InboxItem[];
  /** Squad morale 0–100; absent in older saves, which keep pre-morale strength. */
  morale?: number;
  /** The club build, one card per slot (→ECON-22); absent slots are standard. */
  build?: ClubBuild;
  /** Season year the build was last changed; one change per season. */
  buildYear?: number;
  /** A strategy reserved for the next season (→ECON-22); it applies as that season starts. */
  buildNext?: { build: ClubBuild; name?: string };
  /** The manager market (→STAFF-17); absent until it first moves, when the season's four seed it. */
  managerMarket?: ManagerMarket;
  /** Win bonus promised for the next own matches: pays per win until `matches` run out. */
  winBonus?: { matches: number };
  manager: Manager;
  tactic: Tactic;
  requested?: Tactic;
  fixtures: Fixture[];
  tables: Record<string, TableRow>;
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
  facilities: number;
  ticket: number;
  campaigns: Campaign[];
  /**
   * Written only by rules before 1.16, which kept one sponsor; a load moves it into `sponsors`
   * (→SAVE-10), so a validated world never has it.
   */
  sponsor?: Sponsor;
  /** One contract per open slot at most (→ECON-8); absent or missing slots are empty. */
  sponsors?: SponsorContract[];
  /** The rule delegated staff appoint a manager by (→STAFF-18); absent is `school`. */
  managerRule?: ManagerRule;
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
}
export interface Founding {
  country: CountryCode;
  name: string;
  color: string;
  seed: string;
  difficulty: number;
}
export type Command =
  | { type: 'advance'; rounds: number }
  /** Stops early on the day a new unread attention item of a `stop` kind arrives. */
  | { type: 'advance-days'; days: number; stop?: InboxKind[] }
  | { type: 'next-match' }
  | { type: 'season'; count: number }
  | { type: 'tactics'; tactic: Tactic; tone: string }
  | { type: 'lineup'; ids: string[] | null }
  | { type: 'training'; focus: TrainingFocus }
  | { type: 'policy'; key: PolicyKey; level: PolicyLevel }
  /** `term`: the seasons the owner chooses (→STAFF-15); absent keeps the earlier rule. */
  | { type: 'hire-staff'; role: StaffRole; candidate: number; term?: ContractTerm }
  | { type: 'release-staff'; role: StaffRole }
  | { type: 'renew-staff'; role: StaffRole; term?: ContractTerm }
  | { type: 'coaching'; role: StaffRole; level: CoachingLevel }
  | { type: 'promote-youth'; id: string }
  | { type: 'release-youth'; id: string }
  | { type: 'delegate'; key: DelegationKey; value: boolean }
  | { type: 'bid'; candidate: number; fee: string; loan?: boolean }
  | { type: 'respond-bid'; id: string; accept: boolean }
  | { type: 'read-inbox'; id?: string }
  /**
   * Hires a manager from the market (→STAFF-17), by id: a free agent or another club's manager.
   * `term`: the seasons the owner chooses (→STAFF-14); absent keeps the earlier rule.
   */
  | { type: 'hire'; id: string; term?: ContractTerm }
  /** Renews the manager whose contract ends at this season's close; `term` as for `hire`. */
  | { type: 'renew-manager'; term?: ContractTerm }
  /** How delegated staff appoint a manager (→STAFF-18). */
  | { type: 'manager-rule'; rule: ManagerRule }
  /** Answers a player's contract talk (→CLUB-26) with a wage fixed for `term` seasons. */
  | { type: 'contract-offer'; player: string; wage: string; term: ContractTerm }
  /** Declines a player's contract talk (→CLUB-27). */
  | { type: 'contract-decline'; player: string }
  /** Signs a slot's offer, by its index among that slot's offers (→ECON-8). */
  | { type: 'sign-sponsor'; slot: SponsorSlot; offer: number }
  | { type: 'recruit'; candidate: number; loan?: boolean }
  /** Lists a player, opens him to offers or declares him untouchable. */
  | { type: 'transfer-stance'; id: string; stance: TransferStance }
  | { type: 'campaign'; kind: string }
  | { type: 'sponsor'; kind: Sponsor['kind'] }
  | { type: 'facility' }
  | { type: 'ticket'; price: number }
  | { type: 'support' }
  | { type: 'accept-condition' }
  | { type: 'care'; kind: CareKind }
  /** `name` labels an owner's saved strategy in the club's history (→WEB-61). */
  | { type: 'build'; build: ClubBuild; name?: string; next?: boolean };
