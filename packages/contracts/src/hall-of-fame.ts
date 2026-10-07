export const HALL_OF_FAME_ENABLED = false as const;
export interface HallEntry {
  pseudonym: string;
  worldId: string;
  engine: string;
  catalog: string;
  country: string;
  foundingYear: 1901;
  capitalCategory: 0.5 | 1 | 2;
  seasons: number;
  score: number;
  honors: { competition: string; count: number }[];
  trust: 'self-reported' | 'replay-verified';
}
export interface HallOfFamePort {
  list(limit: number): Promise<HallEntry[]>;
  submit(entry: HallEntry, identityToken: string): Promise<{ id: string }>;
}
// No network implementation, SDK, credentials, score policy or automatic submission in the web demo.
