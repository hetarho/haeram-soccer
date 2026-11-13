import { message as sourceMessage } from './messages';
/** Persisted fact-backed headlines and the counters needed for the next one (HIST-11/22). */
import { z } from 'zod';

export const NEWS_LIMITS = { recent: 50, page: 50, seasons: 2200, perSeason: 20000 } as const;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const numeric = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const key = z.string().min(1).max(300);
const pairs = z.array(z.tuple([key, numeric])).max(100000);
const results = z.array(z.enum(['W', 'D', 'L'])).max(1000);
export const newsItemSchema = z.object({
  id: key,
  year: z.number().int().min(1901).max(4000),
  round: count,
  order: count,
  tag: z.enum([
    sourceMessage('copy.LabPage.e56314e9a1'),
    sourceMessage('navigation.history'),
    sourceMessage('team.column.player'),
    sourceMessage('copy.BallonDorView.8f363885a3'),
    sourceMessage('copy.NewsFeed.45ec3425c8'),
    sourceMessage('copy.InvestmentTotals.47dfdfd818'),
    sourceMessage('copy.NewsFeed.832934e8a8'),
    sourceMessage('copy.NewsFeed.690198ae20'),
  ]),
  tone: z.enum(['good', 'neutral', 'bad']),
  weight: z.enum(['major', 'notable', 'minor']),
  title: z.string().max(2000),
  detail: z.string().max(8000).optional(),
  celebrate: z.boolean().optional(),
  sequence: count.optional(),
  players: z.array(key).max(1000).optional(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;
export const newsStateSchema = z.object({
  hasHistory: z.boolean(),
  unbeatenRecord: numeric,
  winsRecord: numeric,
  unbeaten: numeric,
  winning: numeric,
  winless: numeric,
  losing: numeric,
  scoring: numeric,
  clean: numeric,
  totalWins: numeric,
  biggestMargin: numeric,
  homePossessionRun: numeric,
  homeUnbeaten: numeric,
  awayUnbeaten: numeric,
  awayWithoutWin: numeric,
  awayWins: numeric,
  goalsFor: numeric,
  goalsAgainst: numeric,
  xgFor: numeric,
  xgAgainst: numeric,
  xgSample: numeric,
  appeared: z.array(key).max(100000),
  careerGoals: pairs,
  scorerRun: pairs,
  drought: pairs,
  seasonGoals: pairs,
  seasonBest: pairs,
  crossed: z.array(key).max(1000),
  season: results,
  possessionGames: results,
  ahead: results,
  scoredFirst: results,
});
export type NewsState = z.infer<typeof newsStateSchema>;
export const newsJournalSchema = z.object({
  format: z.literal(1),
  year: z.number().int().min(1901).max(4000),
  matches: count,
  events: count,
  count: count.optional(),
  peakUnbeaten: count,
  peakWinning: count,
  state: newsStateSchema,
  // Buckets keep updates and routine reads independent of the number of past seasons.
  years: z.array(z.number().int().min(1901).max(4000)).max(NEWS_LIMITS.seasons),
  seasons: z.record(
    z.string().regex(/^\d{4}$/),
    z.array(newsItemSchema).max(NEWS_LIMITS.perSeason),
  ),
});
export type NewsJournal = z.infer<typeof newsJournalSchema>;
export type NewsResult = NewsState['season'][number];
