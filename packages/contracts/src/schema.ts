import { z } from 'zod';
z.config({ jitless: true });
import type { World } from './types';
const money = z.string().regex(/^-?\d{1,80}$/);
const rating = z.number().finite().min(0).max(100);
const text = z.string().max(160);
const id = z.string().min(1).max(100);
const number = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const metrics = z.array(z.number().int().nonnegative()).length(12);
const tactic = z.enum(['balanced', 'possession', 'counter', 'press']);
const policyLevel = z.literal([1, 2, 3, 4, 5]);
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
  developed: z.number().finite().min(0).max(500).optional(),
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
  trait: z.enum(['youth', 'rotation', 'stable']).optional(),
  requestHistory: z
    .object({
      at: z.string().regex(/^\d{4}:\d{1,3}$/),
      keys: z
        .array(
          z
            .string()
            .regex(/^(balanced|possession|counter|press):(respect|evidence|support|demand)$/),
        )
        .max(16)
        .refine((keys) => new Set(keys).size === keys.length),
      trustAwarded: z.boolean(),
    })
    .optional(),
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
const snapshot = z.object({
  year: z.number().int().min(1901).max(4000),
  round: z.number().int().min(0).max(46),
  day: z.number().int().min(0).max(365),
  tier: z.number().int().min(0).max(10),
  group: z.number().int().min(0).max(10),
  rows: z
    .array(
      z.tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
      ]),
    )
    .max(100),
});
const scorerSeason = z.object({
  year: z.number().int().min(1901).max(4000),
  groupKey: text,
  trackedSinceRound: z.number().int().min(1).max(47),
  players: z
    .array(
      z.object({
        id,
        name: text,
        club: id,
        role: z.enum(['GK', 'DEF', 'MID', 'FWD']),
        goals: z.number().int().nonnegative(),
        appearances: z.number().int().min(1).max(46),
      }),
    )
    .max(1000),
  history: z
    .array(
      z.object({
        round: z.number().int().min(0).max(46),
        day: z.number().int().min(0).max(365),
        rows: z
          .array(
            z.tuple([
              z.number().int().nonnegative(),
              z.number().int().positive(),
              z.number().int().min(1).max(46),
            ]),
          )
          .max(1000),
      }),
    )
    .max(47),
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
  europe: z
    .array(
      z.object({
        kind: text,
        name: text,
        winner: id,
        field: number,
        standings: z.array(z.array(number).length(6)).max(100).optional(),
        secondStandings: z.array(z.array(number).length(6)).max(100).optional(),
      }),
    )
    .max(10),
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
  firstStandings: z.array(z.array(number).length(6)).max(100).optional(),
  secondStandings: z.array(z.array(number).length(6)).max(100).optional(),
});
const staffRole = z.enum([
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
]);
const staff = z.strictObject({
  id,
  role: staffRole,
  name: text,
  ability: rating,
  trait: z.enum(['developer', 'specialist', 'recovery', 'spotter', 'negotiator']).optional(),
  wage: money,
  since: z.number().int(),
  until: z.number().int(),
});
const bid = z.strictObject({
  id,
  direction: z.enum(['out', 'in']),
  playerId: id,
  club: id.optional(),
  fee: money,
  loan: z.boolean().optional(),
  year: z.number().int(),
  day: z.number().int().min(0).max(400),
  due: z.number().int().min(0).max(800),
  status: z.enum(['pending', 'accepted', 'rejected', 'countered', 'expired', 'completed']),
  counterFee: money.optional(),
});
const inboxItem = z.strictObject({
  id,
  year: z.number().int(),
  day: z.number().int().min(0).max(400),
  kind: z.enum([
    'match',
    'window-open',
    'window-close',
    'bid-response',
    'incoming-bid',
    'youth-intake',
    'staff-report',
  ]),
  title: text,
  detail: z.string().max(400),
  attention: z.boolean(),
  read: z.boolean().optional(),
  ref: id.optional(),
});
export const worldSchema: z.ZodType<World> = z.object({
  schema: z.literal(1),
  engine: text,
  catalog: text,
  catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
  id,
  seed: text,
  year: z.number().int().min(1901).max(4000),
  round: z.number().int().min(0).max(100),
  revision: z.number().int().nonnegative(),
  calendar: z.object({ day: z.number().int().min(0).max(365) }).optional(),
  rankHistory: z.array(snapshot).max(470).optional(),
  scorerSeason: scorerSeason.optional(),
  playerClub: id,
  difficulty: z.number().min(0.1).max(10),
  clubs: z.array(club).min(10).max(1000),
  players: z.array(player).max(20000),
  lineup: z.array(id).length(11).optional(),
  training: z.enum(['balanced', 'youth', 'recovery']).optional(),
  trainingAt: z
    .string()
    .regex(/^\d{4}:\d{1,3}$/)
    .optional(),
  policy: z
    .strictObject({ support: policyLevel, recruitment: policyLevel, marketing: policyLevel })
    .optional(),
  staff: z.array(staff).max(20).optional(),
  academy: z
    .strictObject({ players: z.array(player).max(60), intakeYear: z.number().int().optional() })
    .optional(),
  delegation: z
    .strictObject({
      training: z.boolean().optional(),
      academy: z.boolean().optional(),
      transfers: z.boolean().optional(),
    })
    .optional(),
  bids: z.array(bid).max(200).optional(),
  morale: z.number().finite().min(0).max(100).optional(),
  inbox: z.array(inboxItem).max(200).optional(),
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
  const seasonDays = (Date.UTC(w.year + 1, 7, 1) - Date.UTC(w.year, 7, 1)) / 86400000;
  if (
    w.calendar &&
    (w.calendar.day >= seasonDays || w.round !== Math.min(46, Math.floor(w.calendar.day / 7)))
  )
    throw new Error('시즌 날짜와 진행 회차가 일치하지 않습니다.');
  const snapshotKeys = new Set<string>();
  for (const s of w.rankHistory || []) {
    const key = `${s.year}:${s.round}:${s.tier}:${s.group}`;
    if (
      snapshotKeys.has(key) ||
      s.year > w.year ||
      s.day < s.round * 7 ||
      new Set(s.rows.map((row) => row[0])).size !== s.rows.length ||
      s.rows.some((row) => row[0] >= w.clubs.length)
    )
      throw new Error('순위 추이 기록 참조 손상');
    snapshotKeys.add(key);
  }
  const playerIds = new Set(w.players.map((p) => p.id));
  if (playerIds.size !== w.players.length) throw new Error('중복 선수 식별자');
  if (w.lineup) {
    const roles = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
    if (
      new Set(w.lineup).size !== 11 ||
      w.lineup.some((id, i) => w.players.find((player) => player.id === id)?.role !== roles[i])
    )
      throw new Error('선발 명단의 선수나 포지션이 올바르지 않습니다.');
  }
  for (const f of [...w.fixtures, ...w.ownMatches, ...w.europe.flatMap((t) => t.fixtures)])
    if (!ids.has(f.home) || !ids.has(f.away) || f.home === f.away)
      throw new Error('경기 참가 클럽을 찾을 수 없습니다.');
  const owner = w.clubs.find((c) => c.id === w.playerClub)!;
  if (w.scorerSeason) {
    const season = w.scorerSeason;
    const group = w.lower ? 'lower' : `${owner.country}:${owner.tier}:${owner.group}`;
    if (
      season.year !== w.year ||
      season.groupKey !== group ||
      season.trackedSinceRound > w.round + 1 ||
      new Set(season.players.map((p) => p.id)).size !== season.players.length ||
      season.players.some((p) => !ids.has(p.club))
    )
      throw new Error('득점 순위 선수 참조 손상');
    const goals = new Map<string, number>();
    const appearances = new Map<string, number>();
    for (const fixture of w.fixtures) {
      if (
        !fixture.score ||
        fixture.year !== w.year ||
        fixture.groupKey !== group ||
        fixture.round < season.trackedSinceRound ||
        !['league', 'lower'].includes(fixture.kind)
      )
        continue;
      for (const [club, count] of [
        [fixture.home, fixture.score.home],
        [fixture.away, fixture.score.away],
      ] as const) {
        goals.set(club, (goals.get(club) || 0) + count);
        appearances.set(club, (appearances.get(club) || 0) + 11);
      }
    }
    for (const scorer of season.players) {
      goals.set(scorer.club, (goals.get(scorer.club) || 0) - scorer.goals);
      appearances.set(scorer.club, (appearances.get(scorer.club) || 0) - scorer.appearances);
    }
    if ([...goals.values(), ...appearances.values()].some((value) => value !== 0))
      throw new Error('득점 순위와 실제 경기 지표가 일치하지 않습니다.');
    let previousRound = season.trackedSinceRound - 2;
    const previous = new Map<number, number[]>();
    for (const snapshot of season.history) {
      if (
        snapshot.round <= previousRound ||
        snapshot.round > w.round ||
        snapshot.day < snapshot.round * 7 ||
        new Set(snapshot.rows.map((row) => row[0])).size !== snapshot.rows.length
      )
        throw new Error('득점 순위 추이 기록 참조 손상');
      previousRound = snapshot.round;
      for (let i = 0; i < snapshot.rows.length; i++) {
        const [index, count, played] = snapshot.rows[i];
        const scorer = season.players[index];
        const last = previous.get(index);
        const above = snapshot.rows[i - 1];
        if (
          !scorer ||
          count > scorer.goals ||
          played > scorer.appearances ||
          (last && (count < last[0] || played < last[1])) ||
          (above && (above[1] < count || (above[1] === count && above[2] > played)))
        )
          throw new Error('득점 순위 추이 선수 지표 손상');
        previous.set(index, [count, played]);
      }
    }
    const last = season.history.at(-1);
    if (
      !last ||
      last.round !== w.round ||
      last.rows.length !== season.players.filter((p) => p.goals > 0).length ||
      last.rows.some(
        ([index, count, played]) =>
          count !== season.players[index].goals || played !== season.players[index].appearances,
      )
    )
      throw new Error('최근 득점 순위 추이 지표 손상');
  }
  if (!['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL'].includes(owner.country))
    throw new Error('지원하지 않는 창단 국가');
  if (w.players.filter((p) => p.status === 'active').length < 14)
    throw new Error('최소 선수단 부족');
  if (w.players.some((p) => p.born > w.year)) throw new Error('선수 생년 손상');
  if (w.players.filter((p) => p.status === 'active').length > 26)
    throw new Error('선수단 정원 초과');
  for (const [clubId, row] of Object.entries(w.tables)) {
    if (
      !ids.has(clubId) ||
      Object.values(row).some((n) => !Number.isInteger(n) || n < 0) ||
      row.played !== row.won + row.drawn + row.lost
    )
      throw new Error('리그 표 손상');
  }
  const matchIds = new Set(w.ownMatches.map((m) => m.id));
  if (matchIds.size !== w.ownMatches.length) throw new Error('중복 경기 기록');
  for (const m of w.ownMatches)
    if (
      (m.home !== w.playerClub && m.away !== w.playerClub) ||
      m.players.some((p) => !playerIds.has(p.id))
    )
      throw new Error('소유 클럽 기록 참조 손상');
  for (const h of w.history)
    for (const row of h.standings)
      if (
        row.length !== 6 ||
        row.some((n) => !Number.isInteger(n) || n < 0) ||
        row[0] >= w.clubs.length
      )
        throw new Error('시즌 순위 참조 손상');
  for (const t of w.europe)
    if (t.clubs.some((c) => !ids.has(c)) || (t.winner && !ids.has(t.winner)))
      throw new Error('유럽대회 참조 손상');
  if (w.players.some((p) => BigInt(p.wage) < 0) || BigInt(w.manager.wage) < 0)
    throw new Error('급여 범위 손상');
  if (!w.players.some((p) => p.status === 'active' && p.role === 'GK'))
    throw new Error('골키퍼 부족');
  if (w.priceIndex <= 0 || BigInt(w.income) < 0 || BigInt(w.expense) < 0)
    throw new Error('재무 지표 손상');
  if (
    w.sponsor &&
    (w.sponsor.index <= 0 || BigInt(w.sponsor.annual) < 0 || BigInt(w.sponsor.bonus) < 0)
  )
    throw new Error('후원 계약 손상');
  if (
    w.campaigns.some(
      (c) =>
        BigInt(c.cost) < 0 || !Number.isInteger(c.remaining) || c.remaining < 1 || c.remaining > 4,
    )
  )
    throw new Error('캠페인 손상');
  for (const h of w.history) {
    for (const ch of h.champions)
      if (!ids.has(ch.club) || !ids.has(ch.cup)) throw new Error('우승 기록 참조 손상');
    for (const e of h.europe) {
      if (!ids.has(e.winner)) throw new Error('유럽 우승 참조 손상');
      for (const row of [...(e.standings || []), ...(e.secondStandings || [])])
        if (
          row.length !== 6 ||
          row.some((n) => !Number.isInteger(n) || n < 0) ||
          row[0] >= w.clubs.length
        )
          throw new Error('유럽 순위 참조 손상');
    }
  }
  for (const m of w.ownMatches) {
    const side = m.home === w.playerClub ? 0 : 1;
    if (
      m.metrics[0][0] !== m.score.home ||
      m.metrics[1][0] !== m.score.away ||
      m.players.reduce((n, p) => n + p.metrics[0], 0) !== m.metrics[side][0] ||
      m.metrics.some((row) => row[3] > row[2] || row[5] > row[4])
    )
      throw new Error('경기 지표 손상');
  }
  for (const t of w.europe) {
    if (new Set(t.clubs).size !== t.clubs.length || t.clubs.length !== t.field)
      throw new Error('유럽 참가팀 손상');
    for (const [id, row] of Object.entries(t.standings))
      if (
        !t.clubs.includes(id) ||
        Object.values(row).some((n) => !Number.isInteger(n) || n < 0) ||
        row.played !== row.won + row.drawn + row.lost
      )
        throw new Error('유럽 리그 표 손상');
    for (const row of [...(t.firstStandings || []), ...(t.secondStandings || [])])
      if (row.some((n) => !Number.isInteger(n) || n < 0) || row[0] >= w.clubs.length)
        throw new Error('유럽 단계 참조 손상');
  }
  return w;
}
