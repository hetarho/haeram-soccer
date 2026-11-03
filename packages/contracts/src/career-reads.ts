/** Source-backed running statistics. Arrays hold season then career contributions. */
import { z } from 'zod';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const year = z.number().int().min(1901).max(4000);
const pair = z.tuple([count, count]);
export const playerReadSchema = z.object({
  year,
  apps: pair,
  sub: pair,
  yellow: pair,
  red: pair,
  leagueReds: count,
  heat: z.array(count).max(10000).optional(),
});
export type PlayerRead = z.infer<typeof playerReadSchema>;
export const careerReadsSchema = z.object({
  format: z.literal(1),
  year,
  matches: count,
  events: count,
  history: count,
  wins: count,
  promoted: z.boolean(),
  bestPlayed: count,
  bestFans: count,
  bestWon: count,
  lastTier: count.optional(),
  heatPlayers: z.array(z.string().min(1).max(100)).max(100000),
  players: z.record(z.string().min(1).max(100), playerReadSchema),
  europe: z.record(z.string().regex(/^\d{4}$/), count),
});
export type CareerReads = z.infer<typeof careerReadsSchema>;
