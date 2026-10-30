import type { Fixture } from './types';

export const RECENT_RESULT_LIMIT = 10;
/** Each club's latest settled results, oldest first, retained across season changes. */
export type RecentResults = Record<string, Fixture[]>;
