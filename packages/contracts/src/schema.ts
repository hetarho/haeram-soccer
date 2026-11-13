import { message as sourceMessage } from './messages';
import {
  CAREER_READS_FORMAT,
  careerReadsSchema,
  OBSOLETE_CAREER_READS_FORMAT,
} from './career-reads';
import { SaveCompatibilityError } from './versions';
import { newsJournalSchema } from './news';
import { z } from 'zod';
z.config({ jitless: true });
import type { GenerationDigest, GenerationFeatKind, SponsorSlot, World } from './types';
import { PD, PLAYER_DETAIL_SIZE, TD, TEAM_DETAIL_SIZE } from './detail';
import { BUILD_OPTIONS, STRATEGY_NAME_LIMIT } from './build';
import { ATTRIBUTES, FREE_AGENT_CAP, LINES, PLAY_TRAITS, POSITIONS } from './player';
import type { Position, Positions } from './player';
import {
  assertIdentityFormatVersions,
  clubIdentitySchema,
  designCommissionSchema,
  fixtureKitChoiceSchema,
  matchAppearanceSchema,
} from './identitySchema';
import {
  assertMatchModelFormat,
  MATCH_MODEL_REVISIONS,
  matchModelStateSchema,
  trackingBoundarySchema,
} from './match-model';
import { managerHistoryFactsSchema } from './manager-history';
import { RECENT_RESULT_LIMIT } from './recent-results';
import { DIVIDEND_SHARES, OWNER_TRAIT_IDS, OWNER_TRAIT_LIMIT, WEALTH_TIER_IDS } from './owner';
const money = z.string().regex(/^-?\d{1,80}$/);
/** Money that is never negative: wages asked, contract amounts. */
const amount = z.string().regex(/^\d{1,80}$/);
const season = z.number().int().min(1901).max(4000);
const seasonDay = z.number().int().min(0).max(365);
const term = z.literal([1, 2, 3, 4, 5]);
const rating = z.number().finite().min(0).max(100);
const text = z.string().max(160);
const id = z.string().min(1).max(100);
/** Bounded world-market reads and stable approach targets (WEB-43). */
export const WORLD_MARKET_PAGE_SIZE = 50;
export const worldMarketTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('club'),
    world: z.string().min(1).max(300),
    playerId: id,
    clubId: id,
  }),
  z.strictObject({ kind: z.literal('offer'), world: z.string().min(1).max(300), playerId: id }),
]);
export const worldMarketQuerySchema = z.strictObject({
  world: z.string().min(1).max(300),
  page: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  pageSize: z.number().int().min(1).max(WORLD_MARKET_PAGE_SIZE).optional(),
  name: z.string().max(160).optional(),
  recommendedOnly: z.boolean().optional(),
  league: z
    .strictObject({
      country: z.string().regex(/^[A-Z]{3}$/),
      tier: z.number().int().min(0).max(20),
      group: z.number().int().min(0).max(20),
    })
    .optional(),
  team: id.optional(),
  position: z.enum(POSITIONS).optional(),
  line: z.enum(LINES).optional(),
  ovrMin: z.number().int().min(0).max(100).optional(),
  ovrMax: z.number().int().min(0).max(100).optional(),
  ageMax: z.number().int().min(0).max(100).optional(),
  fit: z.enum(['all', 'improves']).optional(),
  sort: z.enum(['name', 'age', 'ovr', 'potential', 'fee', 'wage']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});
const number = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const metrics = z.array(z.number().int().nonnegative()).length(12);
const teamDetail = z.array(z.number().int().nonnegative()).length(TEAM_DETAIL_SIZE);
const playerDetail = z.array(z.number().int().nonnegative()).length(PLAYER_DETAIL_SIZE);
const tactic = z.enum(['balanced', 'possession', 'counter', 'press']);
const position = z.enum(POSITIONS);
const line = z.enum(['GK', 'DF', 'MF', 'FW']);
const grade = z.literal([1, 2, 3, 4, 5]);
const authority = z.enum(['direct', 'delegated']);
export const gameSettingsSchema = z.strictObject({
  responsibilities: z.strictObject({
    manager: authority,
    staff: authority,
    contracts: authority,
    recruitment: authority,
    sales: authority,
    academy: authority,
    sponsors: authority,
  }),
  mode: z.enum(['automatic', 'manual']),
  observations: z.strictObject({ matchEve: z.boolean(), windowOpen: z.boolean() }),
});
/** The 16 attributes (→PLAYER-2). */
const attributes = z.strictObject(
  Object.fromEntries(ATTRIBUTES.map((a) => [a, rating])) as Record<
    (typeof ATTRIBUTES)[number],
    typeof rating
  >,
);
/** Every position he plays with its level, the main one among them (→PLAYER-4). */
const positions = z.partialRecord(position, z.literal([1, 2, 3]));
/** One card per build slot (→ECON-22); shared by saves and the build command. */
export const clubBuildSchema = z.strictObject({
  youth: z.enum(BUILD_OPTIONS.youth).optional(),
  scouting: z.enum(BUILD_OPTIONS.scouting).optional(),
  market: z.enum(BUILD_OPTIONS.market).optional(),
  revenue: z.enum(BUILD_OPTIONS.revenue).optional(),
  fans: z.enum(BUILD_OPTIONS.fans).optional(),
  culture: z.enum(BUILD_OPTIONS.culture).optional(),
});
const policyLevel = z.literal([1, 2, 3, 4, 5]);
export const budgetResponsibilitySchema = z.enum([
  'manager',
  'staff',
  'contracts',
  'recruitment',
  'sales',
  'academy',
]);
/** The owner's spending request to a delegated person (→ SpendRequest). */
export const spendRequestSchema = z.literal([1, 2, 3, 4, 5]);
/** A club's books while nobody owns it (→ECON-36): the current and the last closed season. */
const clubBooks = z.strictObject({
  openingIncome: amount.optional(),
  transfersPaid: amount.optional(),
  transfersReceived: amount.optional(),
  seasons: z
    .array(
      z.strictObject({
        year: season,
        income: amount,
        wages: amount,
        costs: amount,
        transfersPaid: amount.optional(),
        transfersReceived: amount.optional(),
        result: money,
      }),
    )
    .max(2),
  cash: amount,
  debt: amount,
});
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
  elo: z.number().finite().min(0).max(4000).optional(),
  project: z.number().finite().min(0).max(60).optional(),
  cohesion: z.number().finite().min(0.3).max(1).optional(),
  identity: clubIdentitySchema.optional(),
  books: clubBooks.optional(),
  levels: z
    .strictObject({
      academy: z.number().int().min(0).max(5),
      ground: z.number().int().min(0).max(5),
      coaching: z.number().int().min(0).max(5),
      progress: z.number().finite().min(-1).max(1).optional(),
    })
    .optional(),
});
/** Whole percent of the wage (→CLUB-29): a promotion rise, a relegation cut, a Ballon d'Or bonus. */
const clauses = z.strictObject({
  promotion: z.number().int().min(1).max(100).optional(),
  relegation: z.number().int().min(-99).max(-1).optional(),
  ballonDor: z.number().int().min(1).max(100).optional(),
});
const playerShape = {
  id,
  name: text,
  position,
  positions,
  born: z.number().int(),
  joined: season.optional(),
  graduate: z.literal(true).optional(),
  attrs: attributes,
  personality: z.strictObject({ professionalism: grade, adaptability: grade, ambition: grade }),
  qualities: z.strictObject({ understanding: grade, teaching: grade, judgement: grade }).optional(),
  traits: z.array(z.enum(PLAY_TRAITS)).max(3),
  adaptation: z.number().finite().min(0.3).max(1),
  clubRounds: z.number().int().nonnegative().optional(),
  unsettled: season.optional(),
  positionStarts: z.partialRecord(position, z.number().int().nonnegative()).optional(),
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
  injury: z
    .strictObject({
      year: z.number().int(),
      day: z.number().int().min(0).max(800),
      label: text,
    })
    .optional(),
  stance: z.enum(['listed', 'untouchable']).optional(),
  retiring: z.number().int().optional(),
  talk: z
    .strictObject({
      kind: z.enum(['renew', 'improve']),
      demand: amount,
      floor: amount,
      year: season,
      day: seasonDay,
      clauses: clauses.optional(),
    })
    .optional(),
  improveAsked: season.optional(),
  unhappy: z
    .strictObject({
      reason: z.enum(['renewal-declined', 'improve-declined', 'ambition']),
      year: season,
      day: seasonDay,
    })
    .optional(),
  transferRequest: z.strictObject({ year: season, day: seasonDay }).optional(),
  agent: z.literal([1, 2, 3, 4, 5]).optional(),
  clauses: clauses.optional(),
};
const intactPlayer = (p: { position: Position; positions: Positions; traits: readonly string[] }) =>
  p.positions[p.position] === 3 && new Set(p.traits).size === p.traits.length;
const player = z.object(playerShape).refine(intactPlayer, sourceMessage('copy.schema.1abfb8b2e0'));
/** A player without a club (→CLUB-49) and his first free season. */
const freeAgent = z
  .object({ ...playerShape, freeSince: season })
  .refine(intactPlayer, sourceMessage('copy.schema.1abfb8b2e0'));
const manager = z.object({
  id,
  person: id.optional(),
  name: text,
  philosophy: tactic,
  ability: rating,
  youth: rating,
  flexibility: rating,
  pride: rating,
  trust: rating,
  wage: money,
  since: z.number().int(),
  until: z.number().int(),
  interim: z.boolean(),
  trait: z.enum(['youth', 'rotation', 'stable']).optional(),
  style: z
    .enum([
      'positional',
      'gegenpress',
      'counter',
      'organizer',
      'motivator',
      'developer',
      'firefighter',
      'headcoach',
    ])
    .optional(),
  born: z.number().int().optional(),
  potential: rating.optional(),
  term: term.optional(),
  trustWarned: z.literal(true).optional(),
});
const score = z.object({
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
});
const fixture = z.object({
  id,
  year: z.number().int(),
  round: z.number().int(),
  kind: z.enum(['league', 'cup', 'europe', 'playoff']),
  home: id,
  away: id,
  country: text,
  groupKey: text,
  score: score.optional(),
  shootout: score.optional(),
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
        clubs: z
          .array(
            z.strictObject({
              club: id,
              goals: z.number().int().nonnegative(),
              appearances: z.number().int().min(1).max(46),
            }),
          )
          .min(2)
          .max(46)
          .optional(),
        position,
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
const addedMinutes = z.number().int().min(0).max(15);
const lineCount = z.number().int().min(0).max(30);
/** A card, substitution or injury of a rules 4.0.0 match (→MATCH-3, →MATCH-19). */
const incident = z.strictObject({
  minute: z.number().int().min(1).max(130),
  added: addedMinutes.optional(),
  side: z.union([z.literal(0), z.literal(1)]),
  kind: z.enum(['yellow', 'secondYellow', 'red', 'sub', 'injury']),
  player: id,
  other: id.optional(),
  reason: z.enum(['reckless', 'tactical', 'dissent', 'dogso', 'serious', 'violent']).optional(),
});
/** One flat row of post-match material (→MATCH-25): bounded non-negative integers. */
const materialRow = (max: number) => z.array(z.number().int().min(0).max(100000)).max(max);
const match = fixture
  .extend({
    score,
    metrics: z.tuple([metrics, metrics]),
    players: z.array(z.object({ id, metrics, detail: playerDetail.optional() })).max(60),
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
    xg: z
      .tuple([z.number().finite().min(0).max(50), z.number().finite().min(0).max(50)])
      .optional(),
    detail: z.tuple([teamDetail, teamDetail]).optional(),
    incidents: z.array(incident).max(120).optional(),
    lineCounts: z.tuple([lineCount, lineCount]).optional(),
    added: z
      .array(addedMinutes)
      .refine((periods) => periods.length === 2 || periods.length === 4)
      .optional(),
    regulation: score.optional(),
    material: z
      .strictObject({
        shots: materialRow(7 * 80),
        heat: materialRow(40 * 34),
        network: materialRow(3 * 30 + 3 * 300),
        report: materialRow(60),
      })
      .optional(),
    appearance: matchAppearanceSchema.optional(),
    model: z.enum(MATCH_MODEL_REVISIONS).optional(),
    managerTenure: id.optional(),
  })
  .refine((m) => !m.lineCounts || m.lineCounts[0] + m.lineCounts[1] === m.players.length);
/** Current-season NPC aggregates under the full model (→HIST-17); widths follow the record rows. */
const npcSeasonSchema = z.strictObject({
  year: season,
  model: z.enum(MATCH_MODEL_REVISIONS),
  trackedFrom: trackingBoundarySchema,
  competitions: z
    .array(
      z.strictObject({
        kind: z.enum(['league', 'cup', 'europe', 'playoff']),
        groupKey: id,
        clubs: z
          .array(
            z.strictObject({
              club: id,
              matches: z.number().int().nonnegative().max(1000),
              metrics,
              detail: teamDetail,
              xg: z.number().int().nonnegative(),
              xga: z.number().int().nonnegative(),
            }),
          )
          .max(1000),
        players: z
          .array(
            z.strictObject({
              id,
              name: text,
              position,
              clubs: z
                .array(
                  z
                    .strictObject({
                      club: id,
                      appearances: z.number().int().nonnegative().max(1000),
                      // Appearances are starts plus substitute appearances (→HIST-13).
                      starts: z.number().int().nonnegative().max(1000),
                      metrics,
                      detail: playerDetail,
                    })
                    .refine((part) => part.starts <= part.appearances),
                )
                .min(1)
                .max(50),
            }),
          )
          .max(100000),
      }),
    )
    .max(1000),
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
const cupFinal = z.strictObject({
  runnerUp: id,
  score: z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]),
  decided: z.literal('pens').optional(),
});
const champions = z
  .array(z.object({ country: text, club: id, cup: id, cupFinal: cupFinal.optional() }))
  .max(60);
const clubIndex = z.number().int().nonnegative();
const goals = z.number().int().min(0).max(99);
const archivedElo = z.number().int().min(0).max(4000);
/** An archived bracket starts at a round of 32 clubs or fewer: at most 16 ties and five rounds. */
const bracket = z.strictObject({
  key: text,
  rounds: z
    .array(
      z.strictObject({
        label: text,
        round: z.number().int().min(0).max(100),
        legs: z.union([z.literal(1), z.literal(2)]),
        ties: z
          .array(
            z.tuple([clubIndex, clubIndex, goals, goals, goals, goals, z.number().int().min(0)]),
          )
          .max(16),
        byes: z.array(clubIndex).max(32).optional(),
      }),
    )
    .max(6),
});
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
        final: cupFinal.optional(),
      }),
    )
    .max(10),
  elo: z.number().finite().min(0).max(4000).optional(),
  eloRank: z.number().int().min(1).max(5000).optional(),
  europeCoefficients: z
    .array(
      z.strictObject({
        country: z.enum(['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL']),
        points: z.number().int().min(0).max(1000000),
        clubs: z.number().int().min(1).max(100),
      }),
    )
    .max(8)
    .refine((rows) => new Set(rows.map((row) => row.country)).size === rows.length)
    .optional(),
  squadValue: money.optional(),
  clubValue: money.optional(),
  runs: z
    .array(
      z.strictObject({
        key: text,
        name: text,
        reached: text,
        champion: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),
  scorers: z
    .array(
      z.strictObject({
        name: text,
        club: clubIndex,
        clubs: z
          .array(
            z.strictObject({
              club: clubIndex,
              goals: z.number().int().nonnegative(),
              appearances: z.number().int().min(1).max(46),
            }),
          )
          .min(2)
          .max(46)
          .optional(),
        position,
        goals: z.number().int().positive(),
        appearances: z.number().int().min(1).max(46),
      }),
    )
    .max(10)
    .optional(),
  ranks: z.array(z.number().int().min(1).max(100)).max(46).optional(),
  // The own league is part of the world, so its spread lies inside the world's.
  eloRange: z
    .tuple([archivedElo, archivedElo, archivedElo, archivedElo])
    .refine(
      ([low, high, leagueLow, leagueHigh]) =>
        low <= leagueLow && leagueLow <= leagueHigh && leagueHigh <= high,
    )
    .optional(),
  brackets: z.array(bracket).max(8).optional(),
  heat: z.record(id, z.array(z.number().int().min(0).max(1000000)).length(40)).optional(),
  // The podium, winner first (→PLAYER-27): three distinct players at most.
  ballonDor: z
    .array(
      z.strictObject({
        id,
        name: text,
        club: id,
        position,
        goals: z.number().int().nonnegative(),
        assists: z.number().int().nonnegative(),
        appearances: z.number().int().min(1).max(200),
        points: z.number().int().nonnegative(),
        honours: z.array(z.enum(['europe', 'europe-final', 'continental', 'league', 'cup'])).max(5),
      }),
    )
    .min(1)
    .max(3)
    .refine((places) => new Set(places.map((place) => place.id)).size === places.length)
    .optional(),
});
const knockoutRound = z.strictObject({
  label: text,
  round: z.number().int().min(0).max(100),
  legs: z.union([z.literal(1), z.literal(2)]),
  ties: z
    .array(
      z.strictObject({
        home: id,
        away: id,
        winner: id.optional(),
        decided: z.enum(['away', 'pens']).optional(),
      }),
    )
    .max(128),
  byes: z.array(id).max(128).optional(),
});
const domesticCup = z.strictObject({
  country: text,
  name: text,
  clubs: z.array(id).max(256),
  rounds: z.array(knockoutRound).max(12),
  fixtures: z.array(fixture).max(600),
  winner: id.optional(),
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
  ownQualification: text.optional(),
  firstStandings: z.array(z.array(number).length(6)).max(100).optional(),
  secondStandings: z.array(z.array(number).length(6)).max(100).optional(),
  rounds: z.array(knockoutRound).max(12).optional(),
});
/** The seven coaching departments, as every save before rules 1.22 knew the staff. */
const coachingDepartments = [
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
] as const;
/** The 단장 (→STAFF-20) and the coaching departments. */
const staffRole = z.enum(['director', ...coachingDepartments]);
const staffTrait = z.enum([
  'developer',
  'specialist',
  'recovery',
  'spotter',
  'negotiator',
  'closer',
]);
const managerStyle = z.enum([
  'positional',
  'gegenpress',
  'counter',
  'organizer',
  'motivator',
  'developer',
  'firefighter',
  'headcoach',
]);
const staff = z.strictObject({
  id,
  person: id.optional(),
  role: staffRole,
  name: text,
  ability: rating,
  trait: staffTrait.optional(),
  wage: money,
  since: z.number().int(),
  until: z.number().int(),
  born: z.number().int().optional(),
  potential: rating.optional(),
  term: term.optional(),
  // SAVE-25 legacy: the owner's withdrawn training orders strained a coach and timed suggestions
  // to him; read so an older save opens, then dropped by validateWorld.
  strain: z.strictObject({ year: season, count: z.number().int().min(1).max(40) }).optional(),
  asked: z.strictObject({ year: season, round: z.number().int().min(0).max(46) }).optional(),
});
const bid = z.strictObject({
  id,
  direction: z.enum(['out', 'in']),
  playerId: id,
  club: id.optional(),
  fee: money,
  loan: z.boolean().optional(),
  offer: z.strictObject({ player, fee: money, loanFee: money }).optional(),
  year: z.number().int(),
  day: z.number().int().min(0).max(400),
  due: z.number().int().min(0).max(800),
  status: z.enum(['pending', 'accepted', 'rejected', 'countered', 'expired', 'completed']),
  counterFee: money.optional(),
  staff: z.enum(['short', 'replacement', 'upgrade']).optional(),
});
const request = z.strictObject({
  line,
  kind: z.enum(['short', 'upgrade']),
  slot: z.number().int().min(0).max(10).optional(),
  position: position.optional(),
  pick: id.optional(),
});
/** The chief scout's shortlist and the manager's requests (→CLUB-33). */
const shortlist = z.strictObject({
  year: season,
  day: z.number().int().min(0).max(400),
  // At most five per line: an 80+ chief scout's four and a scouting card's one more (→CLUB-51).
  entries: z.array(z.strictObject({ playerId: id, line })).max(20),
  requests: z.array(request).max(3),
  window: z
    .strictObject({
      year: season,
      opening: z.number().int().min(0).max(400),
      manager: id,
      requests: z.array(request).max(3),
      met: z.literal(true).optional(),
    })
    .optional(),
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
    'staff-renewal',
    'cup',
    'finance',
    'contract-talk',
    'unhappy',
    'transfer-request',
    'sponsor-ending',
  ]),
  title: text,
  detail: z.string().max(400),
  attention: z.boolean(),
  read: z.boolean().optional(),
  ref: id.optional(),
});
const sponsorSlot = z.enum(['local', 'kit', 'shirt', 'stadium', 'sleeve']);
const sponsorContract = z
  .strictObject({
    slot: sponsorSlot,
    name: text,
    kind: z.enum(['stable', 'performance', 'exclusive', 'indexed']),
    annual: amount,
    bonus: amount,
    from: season,
    until: season,
    // An offer from the club's first season counts the season before as paid.
    lastPaid: z.number().int().min(1900).max(4000),
    index: z.number().finite().positive(),
  })
  .refine((contract) => contract.from <= contract.until);
const careerDate = z.strictObject({ year: season, day: seasonDay });
const qualities = z.strictObject({ understanding: grade, teaching: grade, judgement: grade });
const careerEmployment = z.strictObject({
  contractUntil: careerDate.optional(),
  wage: amount.optional(),
  currency: z.string().min(1).max(16).optional(),
  grownThrough: season.optional(),
  role: z.enum([
    'player',
    'manager',
    'director',
    'assistant',
    'attack',
    'defense',
    'goalkeeping',
    'fitness',
    'youth',
    'scout',
  ]),
  club: id,
  from: careerDate,
  to: careerDate.optional(),
});
const personCareer = z.strictObject({
  id,
  name: text,
  born: z.number().int(),
  position,
  professionalism: grade,
  qualities,
  origin: z.strictObject({ club: id, slot: z.number().int().min(0).max(25) }).optional(),
  loan: z.strictObject({ club: id.optional(), until: season }).optional(),
  formerOwn: z.boolean().optional(),
  ownCareer: metrics.optional(),
  playing: z.enum(['active', 'released', 'retired']),
  club: id.optional(),
  employment: z.array(careerEmployment),
  mentors: z.array(
    z.strictObject({
      manager: id,
      name: text,
      school: managerStyle.optional(),
      club: id,
      from: careerDate,
      to: careerDate.optional(),
    }),
  ),
  intention: z
    .strictObject({
      at: careerDate,
      draw: z.number().finite().min(0).lt(1),
      willing: z.boolean(),
      // SAVE-25 legacy: the owner's withdrawn coaching encouragement (→STAFF-29) was kept with the
      // intention; read so an older save opens, then dropped by validateWorld.
      encouraged: z.strictObject({ at: careerDate, changed: z.boolean() }).optional(),
    })
    .optional(),
  retirement: z
    .strictObject({ announced: careerDate, year: season, at: careerDate.optional() })
    .optional(),
  coaching: z
    .strictObject({
      role: z.enum(['assistant', 'attack', 'defense', 'goalkeeping', 'fitness', 'youth']),
      ability: rating,
      potential: rating,
      at: careerDate,
    })
    .optional(),
  management: z
    .strictObject({ ability: rating, potential: rating, school: managerStyle, at: careerDate })
    .optional(),
});
export const personCareerSchema = personCareer;
/** A digest's club: identity, name and association, so the start needs no world (→WEB-115). */
const digestClub = z.strictObject({ id, name: text, country: text });
/** The feats of WEB-115, greatest first. */
export const GENERATION_FEAT_KINDS = [
  'war',
  'treble',
  'europe-three',
  'ballon-three',
  'europe-two',
  'europe-first',
  'league-run',
] as const satisfies readonly GenerationFeatKind[];
/** One season reached while the world is generated (→WEB-115, WORLD-13). */
export const generationDigestSchema: z.ZodType<GenerationDigest> = z
  .strictObject({
    season: z.number().int().min(1930).max(2100),
    closed: z.number().int().min(1930).max(2100),
    elo: z
      .array(z.strictObject({ ...digestClub.shape, elo: z.number().int().min(0).max(4000) }))
      .max(10),
    champions: z.array(z.strictObject({ country: text, club: digestClub })).max(8),
    europe: z.array(z.strictObject({ kind: text, name: text, club: digestClub })).max(8),
    ballonDor: z.strictObject({ name: text, club: digestClub }).optional(),
    feat: z
      .strictObject({
        kind: z.enum(GENERATION_FEAT_KINDS),
        club: digestClub.optional(),
        player: text.optional(),
        competition: text.optional(),
        count: z.number().int().min(2).max(100).optional(),
      })
      .optional(),
  })
  .refine((digest) => digest.closed < digest.season);
const competitionKey = z.union([
  z.literal(['league', 'europe']),
  z.templateLiteral(['cup:', z.string().min(1).max(90)]),
]);
/** Yellow cards, bans and NPC injuries of every club (→MATCH-19, →LEAGUE-15). */
const discipline = z.strictObject({
  year: z.number().int(),
  yellows: z.record(id, z.partialRecord(competitionKey, z.number().int().min(0).max(60))),
  bans: z
    .array(
      z.strictObject({
        player: id,
        club: id,
        matches: z.number().int().min(1).max(10),
        scope: z.union([z.literal('domestic'), competitionKey]),
        reason: z.enum([
          'reckless',
          'tactical',
          'dissent',
          'dogso',
          'serious',
          'violent',
          'secondYellow',
          'yellows',
        ]),
      }),
    )
    .max(5000),
  out: z
    .array(
      z.strictObject({
        player: id,
        club: id,
        until: z.strictObject({ year: z.number().int(), day: z.number().int().min(0).max(800) }),
      }),
    )
    .max(20000),
});
/** Our club's fee transfers (→HIST-20). */
const transferRecords = z.strictObject({
  ledgerBefore: z.number().int().min(0).max(100000),
  facts: z
    .array(
      z.strictObject({
        direction: z.enum(['in', 'out']),
        loan: z.boolean(),
        player: id,
        person: id.optional(),
        name: text,
        club: id.optional(),
        fee: amount,
        currency: text.optional(),
        year: season,
        day: seasonDay,
      }),
    )
    .max(100000),
});
/** The owner (→OWNER, SAVE-27): tier, traits, money, standing, crises and the takeover's facts. */
const ownerState = z.strictObject({
  tier: z.enum(WEALTH_TIER_IDS),
  traits: z
    .array(z.enum(OWNER_TRAIT_IDS))
    .max(OWNER_TRAIT_LIMIT)
    .refine((traits) => new Set(traits).size === traits.length),
  fortune: money,
  stake: z.number().int().min(0).max(100),
  dividendShare: z.literal(DIVIDEND_SHARES),
  fanMood: rating,
  starSaleWindow: z.strictObject({ year: season, kind: z.enum(['summer', 'winter']) }).optional(),
  ownerCrisis: z.strictObject({ since: careerDate }).optional(),
  fanCrisis: z.strictObject({ rounds: z.number().int().min(1).max(100) }).optional(),
  ffpInjections: z.array(z.strictObject({ season, amount })).max(100),
  takeover: z.strictObject({
    year: season,
    clubId: id,
    price: amount,
    debt: amount,
    fortune: amount,
    currency: text,
    lastIncome: amount.optional(),
  }),
  seasonRecords: z
    .array(
      z.strictObject({
        year: season,
        currency: text,
        fortune: money,
        business: money,
        living: amount,
        injected: amount,
        dividend: amount,
        fanMood: rating,
      }),
    )
    .max(2200),
});
/** The club's debt at the takeover as a loan (→ECON-38). */
const takeoverLoan = z.strictObject({
  balance: amount,
  installment: amount,
  seasonsLeft: z.number().int().min(0).max(100),
});
const worldSchema: z.ZodType<World> = z.object({
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
  replacementNeeds: z
    .array(
      z.strictObject({
        line,
        playerId: id,
        year: z.number().int().min(1901).max(4000),
        window: z.enum(['summer', 'winter']),
        day: z.number().int().min(0).max(365),
      }),
    )
    .max(200)
    .optional(),
  recruitmentArrivals: z
    .array(z.strictObject({ player: id, name: text, position, positions, at: careerDate }))
    .optional(),
  promises: z
    .array(
      z.strictObject({
        id,
        mediation: id,
        manager: z.strictObject({ id, name: text }),
        director: z.strictObject({ id, name: text }),
        target: request,
        created: careerDate,
        deadline: careerDate,
        status: z.enum(['pending', 'fulfilled', 'unfulfilled', 'cancelled']),
        resolved: careerDate.optional(),
        arrival: z.strictObject({ player: id, at: careerDate }).optional(),
        reason: z.string().max(1000).optional(),
        reaction: z.string().max(1000).optional(),
      }),
    )
    .optional(),
  mediations: z
    .array(
      z.strictObject({
        id,
        key: text,
        created: careerDate,
        window: z.enum(['summer', 'winter']),
        manager: z.strictObject({ id, name: text }),
        director: z.strictObject({ id, name: text }),
        target: request,
        candidate: z.strictObject({ id, name: text, fee: amount, wage: amount }),
        managerReason: z.string().min(1).max(1000),
        directorReason: z.string().min(1).max(1000),
        support: z.enum(['director', 'balanced', 'manager']),
        status: z.enum(['pending', 'resolved']),
        resolution: z
          .strictObject({
            at: careerDate,
            support: z.enum(['director', 'balanced', 'manager']),
            result: text,
            promise: id.optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  coachingMarketAt: careerDate.optional(),
  people: z.record(id, personCareer).optional(),
  playingCoachProposals: z
    .record(
      id,
      z.strictObject({
        person: id,
        role: z.enum(['assistant', 'attack', 'defense', 'goalkeeping', 'fitness', 'youth']),
        years: z.literal([1, 2]),
        term,
        created: careerDate,
        playingEnd: season,
        playerUntil: season,
        coachUntil: season,
        playerWage: amount,
        coachWage: amount,
        totalWage: amount,
        fee: amount,
        replacement: amount,
        upfront: amount,
        replacing: id.optional(),
        stamp: z.string().max(8000),
        status: z.enum(['pending', 'accepted', 'declined']),
        settled: careerDate.optional(),
      }),
    )
    .optional(),
  playerClub: id,
  clubs: z.array(club).min(10).max(1000),
  players: z.array(player).max(20000),
  squads: z.record(id, z.array(player).max(20000)).optional(),
  playerRecords: z
    .record(
      id,
      z.strictObject({
        moves: z.array(
          z.strictObject({
            year: season,
            day: seasonDay,
            from: id,
            to: id,
            fee: amount,
            loan: z.boolean().optional(),
          }),
        ),
        loan: z
          .strictObject({
            club: id, until: season, wage: amount, contractUntil: season, year: season,
            graduate: z.literal(true).optional(), joined: season.optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  npcMarketAt: careerDate.optional(),
  npcGrowthAt: z.strictObject({ year: season, round: z.number().int().min(0).max(46) }).optional(),
  npcRetirementAt: season.optional(),
  npcSummerAt: season.optional(),
  hardStreak: z.number().int().nonnegative().optional(),
  trainingAt: z
    .string()
    .regex(/^\d{4}:\d{1,3}$/)
    .optional(),
  policy: z
    .strictObject({
      support: policyLevel,
      recruitment: policyLevel,
      academy: policyLevel.optional(),
      localInvest: policyLevel.optional(),
      // Accepted only to read earlier saves; the retired investment is discarded on decode.
      grassroots: policyLevel.optional(),
      globalMarketing: policyLevel.optional(),
      globalScouting: policyLevel.optional(),
      tour: z.literal([1, 2, 3]).optional(),
    })
    .transform((saved) => {
      const policy = { ...saved };
      delete policy.grassroots;
      return policy;
    })
    .optional(),
  localBase: z.number().finite().min(0).max(100).optional(),
  globalReach: z.number().finite().min(0).max(100).optional(),
  staff: z.array(staff).max(20).optional(),
  academy: z
    .strictObject({ players: z.array(player).max(60), intakeYear: z.number().int().optional() })
    .optional(),
  settings: gameSettingsSchema.optional(),
  decisionChoices: z.array(z.string().max(300)).max(10000).optional(),
  approvalWaits: z
    .record(z.string().max(300), z.number().int().min(1).max(100000))
    .refine((waits) => Object.keys(waits).length <= 500)
    .optional(),
  academyReviews: z
    .array(
      z.strictObject({
        id: z.string().max(300),
        year: z.number().int(),
        kind: z.enum(['promote', 'release']),
      }),
    )
    .max(100)
    .optional(),
  bids: z.array(bid).max(200).optional(),
  shortlist: shortlist.optional(),
  freeAgents: z
    .array(freeAgent)
    .max(FREE_AGENT_CAP)
    .refine(
      (pool) => new Set(pool.map((p) => p.id)).size === pool.length,
      sourceMessage('copy.schema.c2f02333c7'),
    )
    .optional(),
  morale: z.number().finite().min(0).max(100).optional(),
  build: clubBuildSchema.optional(),
  // Written only by rules 1.13–1.15; writer activation drops it (→SAVE-10).
  buildNext: z
    .strictObject({
      build: clubBuildSchema,
      name: z.string().trim().min(1).max(STRATEGY_NAME_LIMIT).optional(),
    })
    .optional(),
  // The free agents hold at most 8, 마당발's 9 (→STAFF-17, OWNER-5).
  managerMarket: z
    .strictObject({
      year: z.number().int().min(1901).max(4000),
      round: z.number().int().min(0).max(46),
      free: z.array(manager).max(9),
      clubs: z.record(id, z.tuple([z.number().int().min(0).max(10000), z.number().int()])),
      serial: z.number().int().min(0),
    })
    .optional(),
  // Each post's free agents hold at most 6, 마당발's 7 (→STAFF-49, OWNER-5).
  staffMarket: z
    .strictObject({
      year: z.number().int().min(1901).max(4000),
      round: z.number().int().min(0).max(46),
      free: z.partialRecord(
        staffRole,
        z
          .array(staff)
          .max(7)
          .refine(
            (pool) => new Set(pool.map((m) => m.id)).size === pool.length,
            sourceMessage('copy.schema.c3ba820ef6'),
          ),
      ),
      clubs: z.record(
        id,
        z.partialRecord(staffRole, z.tuple([z.number().int().min(0).max(10000), z.number().int()])),
      ),
    })
    .optional(),
  inbox: z.array(inboxItem).max(200).optional(),
  manager,
  tactic,
  fixtures: z.array(fixture).max(20000),
  recentResults: z.record(id, z.array(fixture).max(RECENT_RESULT_LIMIT)).optional(),
  tables: z.record(id, table),
  kitChoice: fixtureKitChoiceSchema.optional(),
  designCommission: designCommissionSchema.optional(),
  ownMatches: z.array(match).max(100000),
  newsJournal: newsJournalSchema.optional(),
  careerReads: z.preprocess((value) => {
    const format =
      typeof value === 'object' && value !== null && !Array.isArray(value) && 'format' in value
        ? value.format
        : undefined;
    // Only the known derived cache is retired; unknown formats retain SAVE-11 protection.
    if (value === undefined || format === OBSOLETE_CAREER_READS_FORMAT) return undefined;
    if (format !== CAREER_READS_FORMAT) throw new SaveCompatibilityError();
    return value;
  }, careerReadsSchema.optional()),
  matchModel: matchModelStateSchema.optional(),
  npcSeason: npcSeasonSchema.optional(),
  managerHistory: managerHistoryFactsSchema.optional(),
  transfers: transferRecords.optional(),
  history: z.array(archive).max(2200),
  events: z.array(event).max(100000),
  cash: money,
  income: money,
  expense: money,
  operatingExpenses: amount.optional(),
  currency: text,
  priceIndex: number,
  stadium: z.number().int().min(0).max(8),
  trainingGround: z.number().int().min(0).max(5),
  academyFacility: z.number().int().min(0).max(5),
  facilityWorks: z
    .partialRecord(
      z.enum(['stadium', 'training', 'academy']),
      z.strictObject({ to: z.number().int().min(1).max(8), year: season, day: seasonDay }),
    )
    .optional(),
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
  // Rules before 1.16 kept one sponsor; validateWorld moves it into its slot.
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
  sponsors: z.array(sponsorContract).max(5).optional(),
  direction: z
    .strictObject({
      recruitmentSupport: z.enum(['director', 'manager']).optional(),
      renewal: z.enum(['keepAll', 'coreOnly', 'frugal', 'youngFirst']).optional(),
      school: managerStyle.optional(),
      manager: z.enum(['developer', 'proven', 'young', 'cheap']).optional(),
      coaches: z.enum(['volunteer', 'cheap', 'elite']).optional(),
      youthGoal: z.enum(['firstTeam', 'sell', 'minimal']).optional(),
      debut: z.enum(['early', 'ready', 'late']).optional(),
    })
    .optional(),
  delegationRequests: z.partialRecord(budgetResponsibilitySchema, spendRequestSchema).optional(),
  budgetPlan: z.strictObject({ year: season, revenue: amount, sales: amount }).optional(),
  cupWinners: z.record(id, id),
  cups: z.array(domesticCup).max(10).optional(),
  europe: z.array(tournament).max(10),
  lastChampions: champions,
  critical: text.optional(),
  insolvent: z.number().int().min(1).optional(),
  bankrupt: z
    .strictObject({
      year: z.number().int(),
      round: z.number().int().min(0).max(46),
      day: z.number().int().min(0).max(800),
    })
    .optional(),
  receiptIds: z.array(id).max(200),
  discipline: discipline.optional(),
  owner: ownerState.optional(),
  loan: takeoverLoan.optional(),
  ended: z.enum(['club', 'owner', 'fans']).optional(),
});
/** The record's player lines of one side: all of them unless `lineCounts` splits home from away. */
function sideLines(m: World['ownMatches'][number], side: 0 | 1) {
  if (!m.lineCounts) return m.players;
  return side === 0 ? m.players.slice(0, m.lineCounts[0]) : m.players.slice(m.lineCounts[0]);
}
/**
 * Advanced counters exist for every saved player or for none, and never exceed the counters they
 * refine: each shot has at most one key pass, completions never exceed attempts. With every own
 * line saved (`lineCounts`, or the eleven of the duel chain) the own players add up to the side.
 */
function detailConsistent(m: World['ownMatches'][number], side: 0 | 1) {
  const withDetail = m.players.filter((p) => p.detail).length;
  if (!m.detail) return withDetail === 0;
  if (withDetail !== m.players.length) return false;
  for (const s of [0, 1] as const) {
    const t = m.detail[s],
      row = m.metrics[s];
    if (
      t[TD.keyPasses] > row[4] ||
      t[TD.bigChancesScored] > t[TD.bigChances] ||
      t[TD.bigChancesScored] > row[0] ||
      t[TD.bigChances] > t[TD.boxShots] ||
      t[TD.boxShots] > row[4] ||
      t[TD.finalThirdCompleted] > t[TD.finalThirdPasses] ||
      t[TD.finalThirdPasses] > row[2] ||
      t[TD.progressivePasses] > row[3] ||
      t[TD.takeOns] < row[8] ||
      t[TD.buildUpPasses] > row[2] ||
      t[TD.crossesCompleted] > t[TD.crosses] ||
      t[TD.throughBallsCompleted] > t[TD.throughBalls] ||
      t[TD.penaltiesScored] > t[TD.penalties]
    )
      return false;
  }
  for (const p of m.players) {
    const d = p.detail!;
    if (
      d[PD.finalThirdCompleted] > d[PD.finalThirdPasses] ||
      d[PD.bigChancesCreated] > d[PD.keyPasses] ||
      d[PD.takeOns] < p.metrics[8] ||
      d[PD.xg] > 80 * p.metrics[4] ||
      d[PD.xa] > 80 * d[PD.keyPasses] ||
      d[PD.crossesCompleted] > d[PD.crosses] ||
      d[PD.throughBallsCompleted] > d[PD.throughBalls]
    )
      return false;
  }
  if (!m.lineCounts && m.players.length !== 11) return true;
  const own = sideLines(m, side),
    team = m.detail[side],
    sum = (index: number) => own.reduce((n, p) => n + p.detail![index], 0);
  return (
    sum(PD.keyPasses) === team[TD.keyPasses] &&
    sum(PD.yellowCards) === team[TD.yellowCards] &&
    sum(PD.redCards) === team[TD.redCards]
  );
}
/** Catalog facts a load needs to bring older rules forward; contracts never import catalogs (→ARCH-4). */
export interface LoadCatalog {
  /** Season year a sponsor slot opens in a country (→ECON-8). */
  sponsorSlotOpens(country: string, slot: SponsorSlot): number;
}
/**
 * Rules before 1.16 kept one sponsor (→SAVE-10): it becomes the 메인 스폰서 contract, or the 지역
 * 후원 one before the shirt slot opens in the club's country, keeping its amounts and end.
 */
function legacySponsor(w: World, country: string, catalog: LoadCatalog | undefined) {
  const sponsor = w.sponsor!;
  if (!catalog) throw new Error(sourceMessage('copy.schema.a283d01329'));
  // Those offers ran four seasons when exclusive and two otherwise.
  const from = Math.min(w.year, sponsor.until - (sponsor.kind === 'exclusive' ? 4 : 2));
  const contract = sponsorContract.safeParse({
    slot: catalog.sponsorSlotOpens(country, 'shirt') <= w.year ? 'shirt' : 'local',
    name: sponsor.name,
    kind: sponsor.kind,
    annual: sponsor.annual,
    bonus: sponsor.bonus,
    from,
    until: sponsor.until,
    lastPaid: sponsor.lastPaid,
    index: sponsor.index,
  });
  if (!contract.success) throw new Error(sourceMessage('copy.schema.bf5c6b4960'));
  delete w.sponsor;
  w.sponsors = [...(w.sponsors || []), contract.data];
}

/** `catalog` is needed only for a world from rules before 1.16 that has a sponsor. */
function scorerClubsValid<C extends string | number>(
  scorer: {
    club: C;
    goals: number;
    appearances: number;
    clubs?: { club: C; goals: number; appearances: number }[];
  },
  exists: (club: C) => boolean,
) {
  const parts = scorer.clubs;
  return (
    !parts ||
    (new Set(parts.map((p) => p.club)).size === parts.length &&
      parts.some((p) => p.club === scorer.club) &&
      parts.every((p) => exists(p.club)) &&
      parts.reduce((sum, p) => sum + p.goals, 0) === scorer.goals &&
      parts.reduce((sum, p) => sum + p.appearances, 0) === scorer.appearances)
  );
}

export function validateWorld(input: unknown, catalog?: LoadCatalog): World {
  assertIdentityFormatVersions(input);
  assertMatchModelFormat(input);
  const w = worldSchema.parse(input);
  if (
    w.careerReads &&
    (w.careerReads.matches > w.ownMatches.length ||
      w.careerReads.events > w.events.length ||
      w.careerReads.history > w.history.length ||
      w.careerReads.year > w.year)
  )
    throw new Error(sourceMessage('copy.schema.5c0f9fda74'));
  if (w.newsJournal) {
    const j = w.newsJournal;
    if (
      j.matches > w.ownMatches.length ||
      j.events > w.events.length ||
      j.year > w.year ||
      new Set(j.years).size !== j.years.length ||
      Object.keys(j.seasons).length !== j.years.length ||
      j.years.some(
        (year, i) =>
          year > w.year ||
          (i > 0 && year <= j.years[i - 1]) ||
          !j.seasons[year] ||
          j.seasons[year].some((item) => item.year !== year) ||
          new Set(j.seasons[year].map((item) => item.id)).size !== j.seasons[year].length,
      )
    )
      throw new Error(sourceMessage('copy.schema.d80020f916'));
  }
  // SAVE-25: the parse strips an older save's owner lineup and tactic requests (`lineup`,
  // `requested`, the manager's `lastRequest`, `requestHistory`, `pending` and `conflicts`).
  // An older save's coaches kept the strain and suggestion timing of withdrawn orders.
  for (const member of w.staff ?? []) {
    const legacy = member as typeof member & { strain?: unknown; asked?: unknown };
    delete legacy.strain;
    delete legacy.asked;
  }
  // An older save kept the owner's coaching encouragement with a player's intention.
  for (const person of Object.values(w.people ?? {}))
    if (person.intention) delete (person.intention as { encouraged?: unknown }).encouraged;
  const ids = new Set(w.clubs.map((c) => c.id));
  const dateNumber = (date: { year: number; day: number }) => date.year * 366 + date.day;
  const today = { year: w.year, day: w.calendar?.day ?? w.round * 7 };
  if (w.npcMarketAt && dateNumber(w.npcMarketAt) > dateNumber(today))
    throw new Error(sourceMessage('copy.packing.5ccd8ed532'));
  for (const record of Object.values(w.playerRecords ?? {})) {
    let previous: (typeof record.moves)[number] | undefined;
    for (const move of record.moves) {
      if (!ids.has(move.from) || !ids.has(move.to) || move.from === move.to ||
        dateNumber(move) > dateNumber(today) || (previous &&
          (dateNumber(move) < dateNumber(previous) || previous.to !== move.from)))
        throw new Error(sourceMessage('copy.packing.5ccd8ed532'));
      previous = move;
    }
    if (record.loan && (!ids.has(record.loan.club) || !previous?.loan || previous.from !== record.loan.club))
      throw new Error(sourceMessage('copy.packing.5ccd8ed532'));
  }
  for (const [club, results] of Object.entries(w.recentResults ?? {})) {
    const seen = new Set<string>();
    if (!ids.has(club)) throw new Error(sourceMessage('copy.schema.df9beb0eea'));
    for (const result of results) {
      if (
        !result.score ||
        seen.has(result.id) ||
        !ids.has(result.home) ||
        !ids.has(result.away) ||
        result.home === result.away ||
        (result.home !== club && result.away !== club) ||
        result.year > w.year
      )
        throw new Error(sourceMessage('copy.schema.d86d874582'));
      seen.add(result.id);
    }
  }
  for (const [key, proposal] of Object.entries(w.playingCoachProposals || {})) {
    if (key !== proposal.person || !w.people?.[key])
      throw new Error(sourceMessage('copy.schema.08db35d6c8'));
    if (
      BigInt(proposal.totalWage) !== BigInt(proposal.playerWage) + BigInt(proposal.coachWage) ||
      BigInt(proposal.upfront) !== BigInt(proposal.fee) + BigInt(proposal.replacement)
    )
      throw new Error(sourceMessage('copy.schema.66925a0aed'));
  }
  const occupied = new Set<string>();
  const mediationIds = new Set<string>(),
    mediationKeys = new Set<string>();
  for (const mediation of w.mediations ?? []) {
    if (
      mediationIds.has(mediation.id) ||
      mediationKeys.has(mediation.key) ||
      dateNumber(mediation.created) > w.year * 366 + (w.calendar?.day ?? w.round * 7) ||
      !mediation.manager.name ||
      !mediation.director.name ||
      mediation.manager.id === mediation.director.id ||
      (mediation.target.kind === 'upgrade' &&
        (mediation.target.slot === undefined || !mediation.target.position)) ||
      (mediation.resolution &&
        (dateNumber(mediation.resolution.at) < dateNumber(mediation.created) ||
          dateNumber(mediation.resolution.at) > w.year * 366 + (w.calendar?.day ?? w.round * 7))) ||
      (mediation.status === 'resolved') !== !!mediation.resolution
    )
      throw new Error(sourceMessage('copy.schema.fd784f2dba'));
    mediationIds.add(mediation.id);
    mediationKeys.add(mediation.key);
  }
  const promiseIds = new Set<string>();
  for (const promise of w.promises ?? []) {
    if (
      promiseIds.has(promise.id) ||
      !mediationIds.has(promise.mediation) ||
      dateNumber(promise.deadline) < dateNumber(promise.created) ||
      (promise.resolved && dateNumber(promise.resolved) < dateNumber(promise.created)) ||
      (promise.status !== 'pending') !== !!promise.resolved
    )
      throw new Error(sourceMessage('copy.schema.207d4bbc48'));
    promiseIds.add(promise.id);
  }
  for (const mediation of w.mediations ?? [])
    if (mediation.resolution?.promise && !promiseIds.has(mediation.resolution.promise))
      throw new Error(sourceMessage('copy.schema.ad5a8a8ef9'));
  for (const arrival of w.recruitmentArrivals ?? [])
    if (
      dateNumber(arrival.at) > w.year * 366 + (w.calendar?.day ?? w.round * 7) ||
      !arrival.positions[arrival.position]
    )
      throw new Error(sourceMessage('copy.schema.cf04608c1a'));
  const beforeToday = (at: { year: number; day: number }) => dateNumber(at) <= dateNumber(today);
  const isCoach = (role: string) => !['player', 'manager', 'director', 'scout'].includes(role);
  const arrivalKeys = new Set<string>();
  for (const arrival of w.recruitmentArrivals ?? []) {
    const key = `${arrival.player}:${arrival.at.year}:${arrival.at.day}`;
    if (
      !w.people?.[arrival.player] ||
      w.people[arrival.player].name !== arrival.name ||
      arrivalKeys.has(key)
    )
      throw new Error(sourceMessage('copy.schema.25021cbb1f'));
    arrivalKeys.add(key);
  }
  const outstanding = new Set<string>();
  const targetKey = (target: { kind: string; line: string; slot?: number; position?: string }) =>
    target.kind === 'short' ? `line:${target.line}` : `slot:${target.slot}:${target.position}`;
  for (const promise of w.promises ?? []) {
    const mediation = w.mediations!.find((m) => m.id === promise.mediation)!;
    const year = mediation.created.year + (mediation.window === 'winter' ? 1 : 0);
    const day =
      mediation.window === 'summer'
        ? Math.round((Date.UTC(year + 1, 1, 1) - Date.UTC(year, 7, 1)) / 86400000)
        : 31;
    if (
      !beforeToday(promise.created) ||
      (promise.resolved && !beforeToday(promise.resolved)) ||
      promise.deadline.year !== year ||
      promise.deadline.day !== day ||
      promise.manager.id !== mediation.manager.id ||
      promise.director.id !== mediation.director.id ||
      targetKey(promise.target) !== targetKey(mediation.target) ||
      dateNumber(promise.created) < dateNumber(mediation.created)
    )
      throw new Error(sourceMessage('copy.schema.45fe80261d'));
    const key = `${promise.manager.id}:${targetKey(promise.target)}`;
    if (promise.status === 'pending') {
      if (outstanding.has(key)) throw new Error(sourceMessage('copy.schema.239cdfb4e3'));
      outstanding.add(key);
    }
    if (promise.status === 'fulfilled') {
      const arrival = (w.recruitmentArrivals ?? []).find(
        (a) =>
          a.player === promise.arrival?.player &&
          dateNumber(a.at) === dateNumber(promise.arrival!.at),
      );
      if (
        !arrival ||
        dateNumber(arrival.at) < dateNumber(promise.created) ||
        dateNumber(arrival.at) > dateNumber(promise.deadline) ||
        (promise.target.position
          ? (arrival.positions[promise.target.position] ?? 0) < 2
          : !(
              (promise.target.line === 'GK' && arrival.position === 'GK') ||
              (promise.target.line === 'DF' &&
                ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(arrival.position)) ||
              (promise.target.line === 'MF' &&
                ['DM', 'CM', 'AM', 'LM', 'RM'].includes(arrival.position)) ||
              (promise.target.line === 'FW' && ['LW', 'RW', 'ST'].includes(arrival.position))
            ))
      )
        throw new Error(sourceMessage('copy.schema.2f65a2ea89'));
    } else if (promise.arrival) throw new Error(sourceMessage('copy.schema.e1188c505d'));
  }
  for (const [key, person] of Object.entries(w.people || {})) {
    if (
      key !== person.id ||
      person.born > w.year ||
      (person.club && !ids.has(person.club)) ||
      (person.origin && !ids.has(person.origin.club)) ||
      (person.loan?.club && !ids.has(person.loan.club))
    )
      throw new Error(sourceMessage('copy.schema.dc0d6c76fb'));
    const roles = new Set<string>();
    for (const job of person.employment) {
      if (
        !ids.has(job.club) ||
        !beforeToday(job.from) ||
        (job.to && !beforeToday(job.to)) ||
        job.from.year < person.born ||
        (job.wage === undefined) !== (job.currency === undefined) ||
        (job.to && dateNumber(job.to) < dateNumber(job.from)) ||
        (job.contractUntil && dateNumber(job.contractUntil) < dateNumber(job.from)) ||
        (job.to && job.contractUntil && dateNumber(job.to) > dateNumber(job.contractUntil))
      )
        throw new Error(sourceMessage('copy.schema.207069af4a'));
      if (!job.to) {
        if (
          job.club !== person.club ||
          (job.role !== 'player' && [...roles].some((role) => role !== 'player')) ||
          (job.role === 'player' && [...roles].some((role) => !isCoach(role))) ||
          (job.role !== 'player' && !isCoach(job.role) && roles.has('player')) ||
          roles.has(job.role) ||
          (job.role === 'manager' && [...roles].some((role) => role !== 'player')) ||
          (job.role !== 'player' && job.role !== 'manager' && roles.has('manager'))
        )
          throw new Error(sourceMessage('copy.schema.33e1676423'));
        roles.add(job.role);
        if (job.role !== 'player') {
          const post = `${job.club}:${job.role}`;
          if (
            job.club === w.playerClub &&
            (job.role === 'manager'
              ? w.manager.person !== person.id
              : !w.staff?.some((member) => member.person === person.id && member.role === job.role))
          )
            throw new Error(sourceMessage('copy.schema.86e4177746'));
          if (occupied.has(post)) throw new Error(sourceMessage('copy.schema.23bd0edad3'));
          occupied.add(post);
        }
      }
    }
    for (let a = 0; a < person.employment.length; a++)
      for (let b = a + 1; b < person.employment.length; b++) {
        const left = person.employment[a],
          right = person.employment[b];
        const overlap =
          Math.max(dateNumber(left.from), dateNumber(right.from)) <
          Math.min(dateNumber(left.to ?? today), dateNumber(right.to ?? today));
        const playingCoach =
          left.club === right.club &&
          ((left.role === 'player' && isCoach(right.role)) ||
            (right.role === 'player' && isCoach(left.role)));
        if (overlap && !playingCoach) throw new Error(sourceMessage('copy.schema.2e81209877'));
      }
    if (
      (person.retirement?.at &&
        dateNumber(person.retirement.at) < dateNumber(person.retirement.announced)) ||
      (person.retirement && person.retirement.year < person.retirement.announced.year)
    )
      throw new Error(sourceMessage('copy.schema.7c19060b7e'));
    for (const at of [
      person.intention?.at,
      person.retirement?.announced,
      person.retirement?.at,
      person.coaching?.at,
      person.management?.at,
    ])
      if (at && (!beforeToday(at) || at.year < person.born))
        throw new Error(sourceMessage('copy.schema.44a9a910d7'));
    for (const exposure of person.mentors)
      if (
        !ids.has(exposure.club) ||
        !beforeToday(exposure.from) ||
        (exposure.to && !beforeToday(exposure.to)) ||
        (exposure.to && dateNumber(exposure.to) < dateNumber(exposure.from))
      )
        throw new Error(sourceMessage('copy.schema.9e9554ba46'));
  }
  for (const player of [...w.players, ...(w.academy?.players || [])]) {
    const person = w.people?.[player.id];
    if (player.joined !== undefined && (player.joined < player.born || player.joined > w.year))
      throw new Error(sourceMessage('copy.schema.4df6c52871'));
    if (w.people && player.qualities && !person)
      throw new Error(sourceMessage('copy.schema.36e8f15607'));
    if (
      person &&
      player.status === 'active' &&
      !person.employment.some(
        (job) => job.role === 'player' && !job.to && job.club === w.playerClub,
      )
    )
      throw new Error(sourceMessage('copy.schema.bd60052307'));
    if (
      person &&
      (person.name !== player.name ||
        person.born !== player.born ||
        person.professionalism !== player.personality.professionalism ||
        JSON.stringify(person.qualities) !== JSON.stringify(player.qualities))
    )
      throw new Error(sourceMessage('copy.schema.25325b6c22'));
  }
  for (const member of [w.manager, ...(w.staff || []), ...(w.managerMarket?.free || [])]) {
    if (!member.person) continue;
    const person = w.people?.[member.person];
    if (
      !person ||
      person.id !== member.id ||
      person.name !== member.name ||
      person.born !== member.born
    )
      throw new Error(sourceMessage('copy.schema.c12bc1d3e6'));
  }

  for (const member of [w.manager, ...(w.staff ?? [])]) {
    if (!member.person) continue;
    const role = 'role' in member ? member.role : 'manager';
    if (
      !w.people?.[member.person]?.employment.some(
        (job) => !job.to && job.club === w.playerClub && job.role === role,
      )
    )
      throw new Error(sourceMessage('copy.schema.e87876585b'));
  }
  if (ids.size !== w.clubs.length || !ids.has(w.playerClub))
    throw new Error(sourceMessage('copy.schema.98a25ad507'));
  const seasonDays = (Date.UTC(w.year + 1, 7, 1) - Date.UTC(w.year, 7, 1)) / 86400000;
  if (
    w.calendar &&
    (w.calendar.day >= seasonDays || w.round !== Math.min(46, Math.floor(w.calendar.day / 7)))
  )
    throw new Error(sourceMessage('copy.schema.4e233965db'));
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
      throw new Error(sourceMessage('copy.schema.5c3b1c6347'));
    snapshotKeys.add(key);
  }
  const playerIds = new Set(w.players.map((p) => p.id));
  if (playerIds.size !== w.players.length) throw new Error(sourceMessage('copy.schema.7d0218ff22'));
  if (w.squads) {
    if (w.clubs.some((c) => !c.representative && c.id !== w.playerClub && !w.squads![c.id]))
      throw new Error(sourceMessage('copy.schema.df9beb0eea'));
    const live = new Set(w.players.filter((p) => p.status === 'active').map((p) => p.id));
    for (const [club, players] of Object.entries(w.squads)) {
      if (club === w.playerClub || !w.clubs.some((c) => c.id === club && !c.representative))
        throw new Error(sourceMessage('copy.schema.df9beb0eea'));
      for (const p of players) {
        if (p.status !== 'active' || live.has(p.id))
          throw new Error(sourceMessage('copy.schema.7d0218ff22'));
        live.add(p.id);
      }
    }
    for (const p of w.freeAgents ?? []) {
      if (live.has(p.id)) throw new Error(sourceMessage('copy.schema.7d0218ff22'));
      live.add(p.id);
    }
  }
  for (const f of [...w.fixtures, ...w.ownMatches, ...w.europe.flatMap((t) => t.fixtures)])
    if (!ids.has(f.home) || !ids.has(f.away) || f.home === f.away)
      throw new Error(sourceMessage('copy.schema.ec2c12eba2'));
  for (const m of w.ownMatches)
    if (
      m.appearance &&
      (m.appearance.sides[0].club !== m.home || m.appearance.sides[1].club !== m.away)
    )
      throw new Error(sourceMessage('copy.schema.d35500e9ac'));
  // HIST-18: the facts are the own club's, and a record names a tenure they hold, never a guess.
  const tenures = new Set(w.managerHistory?.tenures.map((t) => t.id));
  if (w.managerHistory && w.managerHistory.club !== w.playerClub)
    throw new Error(sourceMessage('copy.schema.8edd8e9130'));
  for (const m of w.ownMatches)
    if (m.managerTenure !== undefined && !tenures.has(m.managerTenure))
      throw new Error(sourceMessage('copy.schema.8844e34077'));
  // KIT-7: a kit choice names a known unplayed own fixture of this season, not necessarily the earliest.
  if (w.kitChoice) {
    const fixtureId = w.kitChoice.fixtureId;
    const known = [
      ...w.fixtures,
      ...w.europe.flatMap((t) => t.fixtures),
      ...(w.cups || []).flatMap((cup) => cup.fixtures),
    ].some(
      (f) =>
        f.id === fixtureId &&
        !f.score &&
        f.year === w.year &&
        (f.home === w.playerClub || f.away === w.playerClub),
    );
    if (!known) throw new Error(sourceMessage('copy.schema.d8b9b356f3'));
  }
  const owner = w.clubs.find((c) => c.id === w.playerClub)!;
  if (w.scorerSeason) {
    const season = w.scorerSeason;
    const group = `${owner.country}:${owner.tier}:${owner.group}`;
    if (
      season.year !== w.year ||
      season.groupKey !== group ||
      season.trackedSinceRound > w.round + 1 ||
      new Set(season.players.map((p) => p.id)).size !== season.players.length ||
      season.players.some((p) => !ids.has(p.club))
    )
      throw new Error(sourceMessage('copy.schema.6d344fa4eb'));
    const goals = new Map<string, number>();
    const appearances = new Map<string, number>();
    const matches = new Map<string, number>();
    for (const fixture of w.fixtures) {
      if (
        !fixture.score ||
        fixture.year !== w.year ||
        fixture.groupKey !== group ||
        fixture.round < season.trackedSinceRound ||
        fixture.kind !== 'league'
      )
        continue;
      for (const [club, count] of [
        [fixture.home, fixture.score.home],
        [fixture.away, fixture.score.away],
      ] as const) {
        goals.set(club, (goals.get(club) || 0) + count);
        matches.set(club, (matches.get(club) || 0) + 1);
      }
    }
    for (const scorer of season.players) {
      if (!scorerClubsValid(scorer, (club) => ids.has(club)))
        throw new Error(sourceMessage('copy.schema.5c402186ba'));
      for (const part of scorer.clubs ?? [scorer]) {
        goals.set(part.club, (goals.get(part.club) || 0) - part.goals);
        appearances.set(part.club, (appearances.get(part.club) || 0) + part.appearances);
      }
    }
    // Each match counts its starters and the substitutes who came on: at most five in any era
    // (→MATCH-20).
    const outOfRange = [...new Set([...matches.keys(), ...appearances.keys()])].some((club) => {
      const n = matches.get(club) || 0,
        count = appearances.get(club) || 0;
      return count < 11 * n || count > 16 * n;
    });
    if ([...goals.values()].some((value) => value !== 0) || outOfRange)
      throw new Error(sourceMessage('copy.schema.cde83eb8c6'));
    let previousRound = season.trackedSinceRound - 2;
    const previous = new Map<number, number[]>();
    for (const snapshot of season.history) {
      if (
        snapshot.round <= previousRound ||
        snapshot.round > w.round ||
        snapshot.day < snapshot.round * 7 ||
        new Set(snapshot.rows.map((row) => row[0])).size !== snapshot.rows.length
      )
        throw new Error(sourceMessage('copy.schema.7af8fbad32'));
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
          throw new Error(sourceMessage('copy.schema.81c5eabe5a'));
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
      throw new Error(sourceMessage('copy.schema.a4623a2263'));
  }
  if (!['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL'].includes(owner.country))
    throw new Error(sourceMessage('copy.schema.1b2eb15238'));
  if (w.sponsor) legacySponsor(w, owner.country, catalog);
  if (w.sponsors && new Set(w.sponsors.map((s) => s.slot)).size !== w.sponsors.length)
    throw new Error(sourceMessage('copy.schema.bf5c6b4960'));
  if (w.players.filter((p) => p.status === 'active').length < 14)
    throw new Error(sourceMessage('copy.schema.465be508ee'));
  if (w.players.some((p) => p.born > w.year))
    throw new Error(sourceMessage('copy.schema.5d4989e7a5'));
  if (w.players.filter((p) => p.status === 'active').length > 40)
    throw new Error(sourceMessage('copy.schema.ce46b6eff4'));
  for (const [clubId, row] of Object.entries(w.tables)) {
    if (
      !ids.has(clubId) ||
      Object.values(row).some((n) => !Number.isInteger(n) || n < 0) ||
      row.played !== row.won + row.drawn + row.lost
    )
      throw new Error(sourceMessage('copy.schema.2c83d17d53'));
  }
  const matchIds = new Set(w.ownMatches.map((m) => m.id));
  if (matchIds.size !== w.ownMatches.length)
    throw new Error(sourceMessage('copy.schema.b838ba8da0'));
  for (const m of w.ownMatches)
    if (
      (m.home !== w.playerClub && m.away !== w.playerClub) ||
      m.players.some((p) => !playerIds.has(p.id))
    )
      throw new Error(sourceMessage('copy.schema.417e0ab4fb'));
  for (const h of w.history)
    for (const row of h.standings)
      if (
        row.length !== 6 ||
        row.some((n) => !Number.isInteger(n) || n < 0) ||
        row[0] >= w.clubs.length
      )
        throw new Error(sourceMessage('copy.schema.4a1531878b'));
  for (const h of w.history) {
    if (
      h.scorers?.some(
        (scorer) =>
          scorer.club >= w.clubs.length ||
          !scorerClubsValid(scorer, (club) => club < w.clubs.length),
      )
    )
      throw new Error(sourceMessage('copy.schema.ce4c384ba2'));
    for (const round of (h.brackets || []).flatMap((b) => b.rounds))
      if (
        round.byes?.some((club) => club >= w.clubs.length) ||
        round.ties.some(
          ([home, away, , , leg2Home, leg2Away, outcome]) =>
            home >= w.clubs.length ||
            away >= w.clubs.length ||
            home === away ||
            outcome > 5 ||
            // A single match has no second leg to score or to win on away goals.
            (round.legs === 1 && (leg2Home !== 0 || leg2Away !== 0 || outcome >= 4)),
        )
      )
        throw new Error(sourceMessage('copy.schema.e474a99b6d'));
  }
  for (const t of w.europe)
    if (t.clubs.some((c) => !ids.has(c)) || (t.winner && !ids.has(t.winner)))
      throw new Error(sourceMessage('copy.schema.f6479767dd'));
  if (w.players.some((p) => BigInt(p.wage) < 0) || BigInt(w.manager.wage) < 0)
    throw new Error(sourceMessage('copy.schema.6514e0af55'));
  if (!w.players.some((p) => p.status === 'active' && p.position === 'GK'))
    throw new Error(sourceMessage('copy.schema.0725a1e367'));
  if (w.priceIndex <= 0 || BigInt(w.income) < 0 || BigInt(w.expense) < 0)
    throw new Error(sourceMessage('copy.schema.96478217c2'));
  if (
    w.campaigns.some(
      (c) =>
        BigInt(c.cost) < 0 || !Number.isInteger(c.remaining) || c.remaining < 1 || c.remaining > 4,
    )
  )
    throw new Error(sourceMessage('copy.schema.cb30d05042'));
  for (const h of w.history) {
    for (const ch of h.champions)
      if (!ids.has(ch.club) || !ids.has(ch.cup))
        throw new Error(sourceMessage('copy.schema.5e781162c6'));
    for (const e of h.europe) {
      if (!ids.has(e.winner)) throw new Error(sourceMessage('copy.schema.85af867959'));
      for (const row of [...(e.standings || []), ...(e.secondStandings || [])])
        if (
          row.length !== 6 ||
          row.some((n) => !Number.isInteger(n) || n < 0) ||
          row[0] >= w.clubs.length
        )
          throw new Error(sourceMessage('copy.schema.62592cb1b7'));
    }
  }
  for (const m of w.ownMatches) {
    const side = m.home === w.playerClub ? 0 : 1;
    if (
      m.metrics[0][0] !== m.score.home ||
      m.metrics[1][0] !== m.score.away ||
      sideLines(m, side).reduce((n, p) => n + p.metrics[0], 0) !== m.metrics[side][0] ||
      m.metrics.some((row) => row[3] > row[2] || row[5] > row[4])
    )
      throw new Error(sourceMessage('copy.schema.d37624990c'));
    if (!detailConsistent(m, side)) throw new Error(sourceMessage('copy.schema.ae6fab4b7b'));
  }
  for (const t of w.europe) {
    if (new Set(t.clubs).size !== t.clubs.length || t.clubs.length !== t.field)
      throw new Error(sourceMessage('copy.schema.4b20b4e2e5'));
    for (const [id, row] of Object.entries(t.standings))
      if (
        !t.clubs.includes(id) ||
        Object.values(row).some((n) => !Number.isInteger(n) || n < 0) ||
        row.played !== row.won + row.drawn + row.lost
      )
        throw new Error(sourceMessage('copy.schema.b3c1d69d52'));
    for (const row of [...(t.firstStandings || []), ...(t.secondStandings || [])])
      if (row.some((n) => !Number.isInteger(n) || n < 0) || row[0] >= w.clubs.length)
        throw new Error(sourceMessage('copy.schema.ff6491f817'));
  }
  return w;
}
