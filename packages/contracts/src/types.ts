export type CountryCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'POR' | 'NED' | 'BEL';
export type Tactic = 'balanced' | 'possession' | 'counter' | 'press';
export type TrainingFocus = 'balanced' | 'youth' | 'recovery';
export type PolicyKey = 'support' | 'recruitment' | 'marketing';
export type PolicyLevel = 1 | 2 | 3 | 4 | 5;
export type ClubPolicy = Record<PolicyKey, PolicyLevel>;
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';
/** Backroom roles below the manager, following a professional club's coaching staff. */
export type StaffRole =
  'assistant' | 'attack' | 'defense' | 'goalkeeping' | 'fitness' | 'youth' | 'scout';
export type StaffTrait = 'developer' | 'specialist' | 'recovery' | 'spotter' | 'negotiator';
export type ManagerTrait = 'youth' | 'rotation' | 'stable';
export type DelegationKey = 'training' | 'academy' | 'transfers';
export type InboxKind =
  | 'match'
  | 'window-open'
  | 'window-close'
  | 'bid-response'
  | 'incoming-bid'
  | 'youth-intake'
  | 'staff-report';
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
  players: { id: string; metrics: Metrics }[];
  highlights: Highlight[];
  tactics: [Tactic, Tactic];
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
export interface Sponsor {
  name: string;
  kind: 'stable' | 'performance' | 'exclusive' | 'indexed';
  annual: string;
  bonus: string;
  until: number;
  lastPaid: number;
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
  champions: { country: string; club: string; cup: string }[];
  europe: {
    kind: string;
    name: string;
    winner: string;
    field: number;
    standings?: number[][];
    secondStandings?: number[][];
  }[];
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
  policy?: ClubPolicy;
  /** Coaching staff below the manager. Absent in older saves, whose effects stay neutral. */
  staff?: Staff[];
  academy?: Academy;
  /** Decisions the staff makes on the owner's behalf; absent keys mean the owner decides. */
  delegation?: Partial<Record<DelegationKey, boolean>>;
  bids?: TransferBid[];
  inbox?: InboxItem[];
  /** Squad morale 0–100; absent in older saves, which keep pre-morale strength. */
  morale?: number;
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
  currency: string;
  priceIndex: number;
  support: number;
  facilities: number;
  ticket: number;
  campaigns: Campaign[];
  sponsor?: Sponsor;
  cupWinners: Record<string, string>;
  europe: EuropeTournament[];
  lastChampions: { country: string; club: string; cup: string }[];
  lower: boolean;
  critical?: string;
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
  | { type: 'advance-days'; days: number }
  | { type: 'next-match' }
  | { type: 'season'; count: number }
  | { type: 'tactics'; tactic: Tactic; tone: string }
  | { type: 'lineup'; ids: string[] | null }
  | { type: 'training'; focus: TrainingFocus }
  | { type: 'policy'; key: PolicyKey; level: PolicyLevel }
  | { type: 'hire-staff'; role: StaffRole; candidate: number }
  | { type: 'release-staff'; role: StaffRole }
  | { type: 'promote-youth'; id: string }
  | { type: 'release-youth'; id: string }
  | { type: 'delegate'; key: DelegationKey; value: boolean }
  | { type: 'bid'; candidate: number; fee: string; loan?: boolean }
  | { type: 'respond-bid'; id: string; accept: boolean }
  | { type: 'read-inbox'; id?: string }
  /** Advances at least one day and stops at the next event; `matches: false` plays through match eves. */
  | { type: 'advance-to-event'; matches?: boolean }
  | { type: 'hire'; candidate: number }
  | { type: 'recruit'; candidate: number; loan?: boolean }
  | { type: 'sell'; id: string }
  | { type: 'campaign'; kind: string }
  | { type: 'sponsor'; kind: Sponsor['kind'] }
  | { type: 'facility' }
  | { type: 'ticket'; price: number }
  | { type: 'support' }
  | { type: 'accept-condition' };
