import { z } from 'zod';
import type { World } from './types';
const money = z.string().regex(/^-?\d{1,80}$/);
const rating = z.number().finite().min(0).max(100);
const text = z.string().max(160);
const id = z.string().min(1).max(100);
const number = z.number().finite();
const metrics = z.array(z.number().int().nonnegative()).length(12);
const tactic = z.enum(['balanced', 'possession', 'counter', 'press']);
const club = z.object({
  id,
  name: text,
  short: text,
  country: text,
  tier: z.number().int().min(0).max(10),
  group: z.number().int().min(0).max(10),
  strength: rating,
  reputation: rating,
  fans: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  representative: z.boolean().optional(),
});
const player = z.object({
  id,
  name: text,
  role: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  born: z.number().int(),
  attack: rating,
  passing: rating,
  defense: rating,
  keeper: rating,
  stamina: rating,
  potential: rating,
  reputation: rating,
  wage: money,
  until: z.number().int(),
  status: z.enum(['active', 'sold', 'retired']),
  fatigue: rating,
  career: metrics,
  season: metrics,
  loanUntil: z.number().int().optional(),
});
const manager = z.object({
  id,
  name: text,
  philosophy: tactic,
  ability: rating,
  youth: rating,
  flexibility: rating,
  pride: rating,
  trust: rating,
  conflicts: z.number().int().nonnegative(),
  wage: money,
  since: z.number().int(),
  until: z.number().int(),
  interim: z.boolean(),
  lastRequest: text.optional(),
  pending: tactic.optional(),
});
const score = z.object({
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
});
const fixture = z.object({
  id,
  year: z.number().int(),
  round: z.number().int(),
  kind: z.enum(['league', 'cup', 'europe', 'playoff', 'lower']),
  home: id,
  away: id,
  country: text,
  groupKey: text,
  score: score.optional(),
});
const table = z.object({
  played: number,
  won: number,
  drawn: number,
  lost: number,
  gf: number,
  ga: number,
  points: number,
});
const match = fixture.extend({
  score,
  metrics: z.tuple([metrics, metrics]),
  players: z.array(z.object({ id, metrics })).max(60),
  highlights: z
    .array(
      z.object({
        minute: number,
        side: z.union([z.literal(0), z.literal(1)]),
        player: text,
        action: text,
      }),
    )
    .max(100),
  tactics: z.tuple([tactic, tactic]),
});
const event = z.object({
  year: number,
  round: number,
  kind: text,
  title: text,
  detail: z.string().max(1000),
  amount: money.optional(),
  currency: text.optional(),
});
const champions = z.array(z.object({ country: text, club: id, cup: id })).max(60);
const archive = z.object({
  year: number,
  tier: number,
  group: number,
  rank: number,
  points: number,
  played: number,
  won: number,
  drawn: number,
  lost: number,
  gf: number,
  ga: number,
  cash: money,
  currency: text,
  income: money,
  expense: money,
  fans: number,
  rating: number,
  manager: text,
  metrics,
  standings: z.array(z.array(number).max(10)).max(1000),
  champions,
  europe: z.array(z.object({ kind: text, name: text, winner: id, field: number })).max(10),
});
const tournament = z.object({
  key: text,
  name: text,
  field: number,
  format: z.enum(['knockout', 'groups', 'double-groups', 'league']),
  games: number,
  stage: text,
  clubs: z.array(id).max(100),
  fixtures: z.array(fixture).max(1000),
  standings: z.record(id, table),
  winner: id.optional(),
  ownExit: text.optional(),
});
export const worldSchema: z.ZodType<World> = z.object({
  schema: z.literal(1),
  engine: text,
  catalog: text,
  id,
  seed: text,
  year: z.number().int().min(1901).max(4000),
  round: z.number().int().min(0).max(100),
  revision: z.number().int().nonnegative(),
  playerClub: id,
  difficulty: z.number().min(0.1).max(10),
  clubs: z.array(club).min(10).max(1000),
  players: z.array(player).max(20000),
  manager,
  tactic,
  requested: tactic.optional(),
  fixtures: z.array(fixture).max(20000),
  tables: z.record(id, table),
  ownMatches: z.array(match).max(100000),
  history: z.array(archive).max(2200),
  events: z.array(event).max(100000),
  cash: money,
  income: money,
  expense: money,
  currency: text,
  priceIndex: number,
  support: z.number().int().nonnegative(),
  facilities: z.number().int().min(0).max(30),
  ticket: z.number().finite().min(0.01).max(10),
  campaigns: z
    .array(
      z.object({
        id,
        kind: text,
        cost: money,
        started: number,
        remaining: number,
        income: money,
        fans: number,
      }),
    )
    .max(50),
  sponsor: z
    .object({
      name: text,
      kind: z.enum(['stable', 'performance', 'exclusive', 'indexed']),
      annual: money,
      bonus: money,
      until: number,
      lastPaid: number,
      index: number,
    })
    .optional(),
  cupWinners: z.record(id, id),
  europe: z.array(tournament).max(10),
  lastChampions: champions,
  lower: z.boolean(),
  critical: text.optional(),
  receiptIds: z.array(id).max(200),
});
export function validateWorld(input: unknown): World {
  const w = worldSchema.parse(input);
  const ids = new Set(w.clubs.map((c) => c.id));
  if (ids.size !== w.clubs.length || !ids.has(w.playerClub))
    throw new Error('저장된 클럽 식별자가 올바르지 않습니다.');
  const playerIds = new Set(w.players.map((p) => p.id));
  if (playerIds.size !== w.players.length) throw new Error('중복 선수 식별자');
  for (const f of [...w.fixtures, ...w.ownMatches, ...w.europe.flatMap((t) => t.fixtures)])
    if (!ids.has(f.home) || !ids.has(f.away) || f.home === f.away)
      throw new Error('경기 참가 클럽을 찾을 수 없습니다.');
  if (w.players.filter((p) => p.status === 'active').length > 26)
    throw new Error('선수단 정원 초과');
  return w;
}
