export type CountryCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'POR' | 'NED' | 'BEL';
export type Tactic = 'balanced' | 'possession' | 'counter' | 'press';
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';
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
  pending?: Tactic;
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
export interface MatchFrame {
  minute: number;
  score: Score;
  metrics: [Metrics, Metrics];
  ball: [number, number];
  side: 0 | 1;
  player: number;
  action: string;
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
  playerClub: string;
  difficulty: number;
  clubs: Club[];
  players: Player[];
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
  | { type: 'season'; count: number }
  | { type: 'tactics'; tactic: Tactic; tone: string }
  | { type: 'hire'; candidate: number }
  | { type: 'recruit'; candidate: number; loan?: boolean }
  | { type: 'sell'; id: string }
  | { type: 'campaign'; kind: string }
  | { type: 'sponsor'; kind: Sponsor['kind'] }
  | { type: 'facility' }
  | { type: 'ticket'; price: number }
  | { type: 'support' }
  | { type: 'accept-condition' };
