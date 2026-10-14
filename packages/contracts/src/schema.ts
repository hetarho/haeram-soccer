import { z } from 'zod';
z.config({ jitless: true });
import type { SponsorSlot, World } from './types';
import { PD, PLAYER_DETAIL_SIZE, TD, TEAM_DETAIL_SIZE } from './detail';
import { BUILD_OPTIONS, LEGACY_VISION_BUILDS, STRATEGY_NAME_LIMIT } from './build';
const money = z.string().regex(/^-?\d{1,80}$/);
/** Money that is never negative: wages asked, contract amounts. */
const amount = z.string().regex(/^\d{1,80}$/);
const season = z.number().int().min(1901).max(4000);
const seasonDay = z.number().int().min(0).max(365);
const term = z.literal([1, 2, 3, 4, 5]);
const rating = z.number().finite().min(0).max(100);
const text = z.string().max(160);
const id = z.string().min(1).max(100);
const number = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const metrics = z.array(z.number().int().nonnegative()).length(12);
const teamDetail = z.array(z.number().int().nonnegative()).length(TEAM_DETAIL_SIZE);
const playerDetail = z.array(z.number().int().nonnegative()).length(PLAYER_DETAIL_SIZE);
const tactic = z.enum(['balanced', 'possession', 'counter', 'press']);
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
});
/** Whole percent of the wage (→CLUB-29): a promotion rise, a relegation cut. */
const clauses = z.strictObject({
  promotion: z.number().int().min(1).max(100).optional(),
  relegation: z.number().int().min(-99).max(-1).optional(),
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
      reason: z.enum(['renewal-declined', 'improve-declined']),
      year: season,
      day: seasonDay,
    })
    .optional(),
  transferRequest: z.strictObject({ year: season, day: seasonDay }).optional(),
  agent: z.literal([1, 2, 3, 4, 5]).optional(),
  clauses: clauses.optional(),
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
  born: z.number().int().optional(),
  potential: rating.optional(),
  term: term.optional(),
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
  xg: z.tuple([z.number().finite().min(0).max(50), z.number().finite().min(0).max(50)]).optional(),
  detail: z.tuple([teamDetail, teamDetail]).optional(),
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
        role: z.enum(['GK', 'DEF', 'MID', 'FWD']),
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
const staffTrait = z.enum(['developer', 'specialist', 'recovery', 'spotter', 'negotiator']);
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
/** Each value at most once in a list. */
const distinct = <T>(values: T[]) => new Set(values).size === values.length;
const criterion = (max: number) => z.number().int().min(0).max(max);
/** A wage cap names the going wage of a manager or coach of OVR 50–90 in steps of 5. */
const wageCapOvr = z.literal([50, 55, 60, 65, 70, 75, 80, 85, 90]);
/** The manager criteria (→STAFF-18); shared by saves and the hiring command. */
export const managerCriteriaSchema = z.strictObject({
  minOvr: criterion(99),
  schools: z.array(managerStyle).max(8).refine(distinct),
  minFlexibility: criterion(100),
  maxPride: criterion(100),
  minYouth: criterion(100),
  traits: z
    .array(z.enum(['none', 'youth', 'rotation', 'stable']))
    .max(4)
    .refine(distinct),
  maxWageOvr: wageCapOvr.optional(),
  priority: z.enum(['ovr', 'potential', 'wage']),
  term,
  poach: z.boolean(),
  whenNone: z.enum(['wait', 'best']),
});
/** One coaching department's criteria (→STAFF-15); the engine checks the department's traits. */
export const coachCriteriaSchema = z.strictObject({
  volunteer: z.boolean(),
  minAbility: criterion(99),
  trait: staffTrait.optional(),
  maxWageOvr: wageCapOvr.optional(),
  priority: z.enum(['ability', 'wage']),
  term,
});
/** The contract-talk rule (→CLUB-26); shared by saves and the talk-rule command. */
export const talkRuleSchema = z.strictObject({
  maxPay: z.literal([0.9, 1, 1.1, 1.25, 1.4]),
  minOvr: criterion(99),
  maxAge: z.number().int().min(28).max(40).optional(),
});
const staff = z.strictObject({
  id,
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
  staff: z.enum(['short', 'upgrade']).optional(),
});
const playerRole = z.enum(['GK', 'DEF', 'MID', 'FWD']);
/** The chief scout's shortlist and the manager's requests (→CLUB-33). */
const shortlist = z.strictObject({
  year: season,
  day: z.number().int().min(0).max(400),
  entries: z.array(z.strictObject({ playerId: id, role: playerRole })).max(12),
  requests: z
    .array(
      z.strictObject({ role: playerRole, kind: z.enum(['short', 'upgrade']), pick: id.optional() }),
    )
    .max(3),
  window: z
    .strictObject({
      year: season,
      opening: z.number().int().min(0).max(400),
      manager: id,
      roles: z.array(playerRole).max(3),
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
  trainingOrders: z
    .strictObject({
      assistant: z
        .strictObject({
          focus: z.enum(['balanced', 'youth', 'recovery']),
          rounds: z.number().int().min(1).max(4),
          forced: z.literal(true).optional(),
        })
        .optional(),
      youth: z
        .strictObject({
          focus: z.enum(['balanced', 'fundamentals', 'firstTeam']),
          rounds: z.number().int().min(1).max(4),
          forced: z.literal(true).optional(),
        })
        .optional(),
    })
    .optional(),
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
      grassroots: policyLevel.optional(),
      globalMarketing: policyLevel.optional(),
      globalScouting: policyLevel.optional(),
      tour: z.literal([1, 2, 3]).optional(),
    })
    .optional(),
  localBase: z.number().finite().min(0).max(100).optional(),
  globalReach: z.number().finite().min(0).max(100).optional(),
  staff: z.array(staff).max(20).optional(),
  academy: z
    .strictObject({ players: z.array(player).max(60), intakeYear: z.number().int().optional() })
    .optional(),
  intervention: z.literal([1, 2, 3, 4]).optional(),
  bids: z.array(bid).max(200).optional(),
  shortlist: shortlist.optional(),
  morale: z.number().finite().min(0).max(100).optional(),
  build: clubBuildSchema.optional(),
  // Written only by rules 1.13–1.15; writer activation drops it (→SAVE-10).
  buildNext: z
    .strictObject({
      build: clubBuildSchema,
      name: z.string().trim().min(1).max(STRATEGY_NAME_LIMIT).optional(),
    })
    .optional(),
  managerMarket: z
    .strictObject({
      year: z.number().int().min(1901).max(4000),
      round: z.number().int().min(0).max(46),
      free: z.array(manager).max(8),
      clubs: z.record(id, z.tuple([z.number().int().min(0).max(10000), z.number().int()])),
      serial: z.number().int().min(0),
    })
    .optional(),
  winBonus: z.strictObject({ matches: z.number().int().min(1).max(10) }).optional(),
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
  operatingExpenses: amount.optional(),
  currency: text,
  priceIndex: number,
  support: z.number().int().nonnegative(),
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
      renewal: z.enum(['keepAll', 'coreOnly', 'frugal', 'youngFirst']).optional(),
      school: managerStyle.optional(),
      manager: z.enum(['developer', 'proven', 'young', 'cheap']).optional(),
      coaches: z.enum(['volunteer', 'cheap', 'elite']).optional(),
      finance: z.enum(['aggressive', 'bold', 'careful', 'stable']).optional(),
      youthGoal: z.enum(['firstTeam', 'sell', 'minimal']).optional(),
      debut: z.enum(['early', 'ready', 'late']).optional(),
    })
    .optional(),
  cupWinners: z.record(id, id),
  cups: z.array(domesticCup).max(10).optional(),
  europe: z.array(tournament).max(10),
  lastChampions: champions,
  lower: z.boolean(),
  critical: text.optional(),
  insolvent: z.number().int().min(1).max(46).optional(),
  bankrupt: z
    .strictObject({
      year: z.number().int(),
      round: z.number().int().min(0).max(46),
      day: z.number().int().min(0).max(800),
    })
    .optional(),
  receiptIds: z.array(id).max(200),
});
/**
 * Advanced counters exist for every saved player or for none, and never exceed the counters they
 * refine: each shot has at most one key pass, completions never exceed attempts.
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
      t[TD.buildUpPasses] > row[2]
    )
      return false;
  }
  let keyPasses = 0;
  for (const p of m.players) {
    const d = p.detail!;
    keyPasses += d[PD.keyPasses];
    if (
      d[PD.finalThirdCompleted] > d[PD.finalThirdPasses] ||
      d[PD.bigChancesCreated] > d[PD.keyPasses] ||
      d[PD.takeOns] < p.metrics[8] ||
      d[PD.xg] > 80 * p.metrics[4] ||
      d[PD.xa] > 80 * d[PD.keyPasses]
    )
      return false;
  }
  return m.players.length !== 11 || keyPasses === m.detail[side][TD.keyPasses];
}
/** Rules 1.6–1.7 kept one of six visions; it loads as the build preset of the same name. */
/** Rules 1.9 saved one coaching level for every department and listed players at an ask. */
function legacyMarket(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const w = input as Record<string, unknown>;
  const flat = typeof w.coaching === 'number';
  const listed =
    Array.isArray(w.players) && w.players.some((p) => p && typeof p === 'object' && 'listed' in p);
  if (!flat && !listed) return input;
  return {
    ...w,
    ...(flat
      ? {
          coaching: Object.fromEntries(coachingDepartments.map((role) => [role, w.coaching])),
        }
      : {}),
    ...(listed
      ? {
          players: (w.players as Record<string, unknown>[]).map((p) => {
            if (!p || typeof p !== 'object' || !('listed' in p)) return p;
            const { listed, ...rest } = p;
            return listed ? { ...rest, stance: 'listed' } : rest;
          }),
        }
      : {}),
  };
}
function legacyVision(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !('vision' in input || 'visionYear' in input))
    return input;
  const { vision, visionYear, ...rest } = input as Record<string, unknown>;
  const build =
    typeof vision === 'string' && Object.hasOwn(LEGACY_VISION_BUILDS, vision)
      ? LEGACY_VISION_BUILDS[vision]
      : {};
  // Its yearly lock went with the yearly strategy change (→SAVE-10): every slot is free.
  void visionYear;
  return { ...rest, ...(Object.keys(build).length ? { build: { ...build } } : {}) };
}
/**
 * Coaching investment levels of rules 1.10–1.15 as coach criteria (→SAVE-10), each over the
 * defaults the engine keeps in hiring.ts (ability 55, cheapest first, two seasons): 절약 keeps a
 * volunteer, 균형 is the defaults and so stores nothing, 최고 asks ability 65, the ablest first.
 */
const LEGACY_COACHING: Readonly<Record<number, z.input<typeof coachCriteriaSchema> | undefined>> = {
  1: { volunteer: true, minAbility: 55, priority: 'wage', term: 2 },
  3: { volunteer: false, minAbility: 65, priority: 'ability', term: 2 },
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
/**
 * The hiring criteria with a pre-1.16 `coaching` record's levels added as coach criteria; an
 * existing `hiring` entry wins. A level outside 1–3 stays as saved, so validation refuses it.
 */
function legacyCoaching(levels: Record<string, unknown>, hiring: unknown) {
  const kept = hiring === undefined ? {} : hiring;
  // A malformed `hiring` stays as saved, so validation refuses it.
  if (!isRecord(kept) || (kept.coaches !== undefined && !isRecord(kept.coaches))) return hiring;
  const coaches: Record<string, unknown> = {};
  for (const [role, level] of Object.entries(levels))
    if (level !== 2) coaches[role] = LEGACY_COACHING[level as number] ?? level;
  const merged = { ...coaches, ...kept.coaches };
  return Object.keys(merged).length ? { ...kept, coaches: merged } : hiring;
}
/**
 * Rules before 1.16 (→SAVE-10): coaching investment levels (`coaching`) become coach criteria,
 * the strategy locks (the yearly `buildYear`, the per-slot `buildChanged`) go, so every card is
 * free, the owner's own training focus (`training`) goes, since the coaches set it, and so does the
 * manager rule (`managerRule`), which no released rules wrote.
 */
function legacyLevers(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const { buildYear, buildChanged, managerRule, coaching, training, ...rest } = input;
  if (
    [buildYear, buildChanged, managerRule, coaching, training].every((value) => value === undefined)
  )
    return input;
  const out: Record<string, unknown> = rest;
  // Rules 1.9's club-wide level is already a record here (legacyMarket).
  if (isRecord(coaching)) {
    const hiring = legacyCoaching(coaching, rest.hiring);
    if (hiring !== undefined) out.hiring = hiring;
  }
  return out;
}
/** The hiring criteria rules 1.16 kept (→STAFF-15, STAFF-18), read only to load them as rows. */
const legacyHiring = z.strictObject({
  manager: managerCriteriaSchema.optional(),
  coaches: z.partialRecord(staffRole, coachCriteriaSchema).optional(),
});
/** 코치 기조 a department's criteria stood for (→SAVE-10). */
function coachStance(c: z.infer<typeof coachCriteriaSchema>) {
  if (c.volunteer) return 'volunteer';
  if (c.minAbility >= 65 || c.priority === 'ability') return 'elite';
  if (c.minAbility <= 45) return 'cheap';
  return 'standard';
}
/**
 * Rules before 1.17 (→SAVE-10): the talk rule (`talkRule`), the hiring criteria (`hiring`) and
 * the manager criteria in it load as the nearest direction rows (`direction`); malformed criteria
 * are refused. 코치 기조 takes the departments' most common stance, ties going to 표준; 재정 기조
 * stays at 표준.
 */
function legacyDirection(input: unknown): unknown {
  if (!isRecord(input) || (!('talkRule' in input) && !('hiring' in input))) return input;
  const { talkRule, hiring, ...rest } = input;
  const direction: Record<string, unknown> = isRecord(rest.direction) ? { ...rest.direction } : {};
  if (talkRule !== undefined) {
    const rule = talkRuleSchema.parse(talkRule);
    const renewal =
      rule.maxPay <= 1
        ? 'frugal'
        : rule.maxAge !== undefined && rule.maxAge <= 30
          ? 'youngFirst'
          : rule.maxPay >= 1.4
            ? 'keepAll'
            : undefined;
    if (renewal) direction.renewal ??= renewal;
  }
  if (hiring !== undefined) {
    const { manager, coaches } = legacyHiring.parse(hiring);
    if (manager) {
      if (manager.schools.length === 1) direction.school ??= manager.schools[0];
      const stance =
        manager.minYouth >= 50
          ? 'developer'
          : manager.poach
            ? 'proven'
            : manager.priority === 'potential'
              ? 'young'
              : manager.priority === 'wage'
                ? 'cheap'
                : undefined;
      if (stance) direction.manager ??= stance;
    }
    const counts = new Map<string, number>([['standard', coachingDepartments.length]]);
    for (const criteria of Object.values(coaches ?? {})) {
      if (!criteria) continue;
      const stance = coachStance(criteria);
      counts.set('standard', counts.get('standard')! - 1);
      counts.set(stance, (counts.get(stance) ?? 0) + 1);
    }
    const [top] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    if (top !== 'standard') direction.coaches ??= top;
  }
  return Object.keys(direction).length ? { ...rest, direction } : rest;
}
/**
 * Rules before 1.18 (→SAVE-10): the 1군 직행 경로 card (`youth: 'pathway'`) went to 데뷔 시점 빠른
 * 데뷔, so a build holding it loads without it and with that row; a strategy reserved by rules
 * 1.13–1.15 (`buildNext`) only drops it, since activation drops the reservation itself.
 */
function legacyPathway(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const build = isRecord(input.build) ? input.build : undefined,
    next = isRecord(input.buildNext) ? input.buildNext : undefined,
    nextBuild = next && isRecord(next.build) ? next.build : undefined;
  if (build?.youth !== 'pathway' && nextBuild?.youth !== 'pathway') return input;
  const out: Record<string, unknown> = { ...input };
  if (build?.youth === 'pathway') {
    const { youth: _youth, ...rest } = build;
    void _youth;
    if (Object.keys(rest).length) out.build = rest;
    else delete out.build;
    const direction = isRecord(input.direction) ? { ...input.direction } : {};
    direction.debut ??= 'early';
    out.direction = direction;
  }
  if (nextBuild?.youth === 'pathway') {
    const { youth: _youth, ...rest } = nextBuild;
    void _youth;
    out.buildNext = { ...next, build: rest };
  }
  return out;
}
/**
 * Rules before 1.19 (→SAVE-10): the marketing dial loads as the same 해외 마케팅 level, and a build
 * holding the 글로벌 브랜드 card (`fans: 'global'`) loads without it.
 */
function legacyMarketing(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const policy = isRecord(input.policy) ? input.policy : undefined,
    build = isRecord(input.build) ? input.build : undefined,
    next = isRecord(input.buildNext) ? input.buildNext : undefined,
    nextBuild = next && isRecord(next.build) ? next.build : undefined;
  if (
    !(policy && 'marketing' in policy) &&
    build?.fans !== 'global' &&
    nextBuild?.fans !== 'global'
  )
    return input;
  const out: Record<string, unknown> = { ...input };
  if (policy && 'marketing' in policy) {
    const { marketing, ...rest } = policy;
    if (marketing !== 1 && rest.globalMarketing === undefined) rest.globalMarketing = marketing;
    out.policy = rest;
  }
  if (build?.fans === 'global') {
    const { fans: _fans, ...rest } = build;
    void _fans;
    if (Object.keys(rest).length) out.build = rest;
    else delete out.build;
  }
  if (nextBuild?.fans === 'global') {
    const { fans: _fans, ...rest } = nextBuild;
    void _fans;
    out.buildNext = { ...next, build: rest };
  }
  return out;
}
/** Capacity of each stadium step (→ECON-32), for loading a single facility level. */
const STADIUM_CAPACITY = [2500, 5000, 10000, 15000, 30000, 40000, 60000, 75000, 90000];
/**
 * One facility level F (`facilities`, up to 30 before rules 1.11) loads as the parts (→ECON-32):
 * the highest stadium step holding at most 2,500 + 5,000F, and a training ground and academy of
 * F/4 rounded, at most 5.
 */
function legacyFacilities(input: unknown): unknown {
  if (!isRecord(input) || !('facilities' in input)) return input;
  const { facilities, ...rest } = input;
  if (typeof facilities !== 'number' || !Number.isInteger(facilities) || facilities < 0)
    return input;
  const seats = 2500 + 5000 * facilities,
    level = Math.min(5, Math.round(facilities / 4));
  rest.stadium ??= STADIUM_CAPACITY.filter((capacity) => capacity <= seats).length - 1;
  rest.trainingGround ??= level;
  rest.academyFacility ??= level;
  return rest;
}
/** The staff switches saves kept before the intervention level (→SAVE-10). */
const legacySwitches = z.strictObject({
  training: z.boolean().optional(),
  academy: z.boolean().optional(),
  transfers: z.boolean().optional(),
  business: z.boolean().optional(),
  contracts: z.boolean().optional(),
  manager: z.boolean().optional(),
  // Rules before 1.16: one coach-hiring switch for every department.
  staff: z.boolean().optional(),
  ...Object.fromEntries(
    coachingDepartments.map((role) => [`coach:${role}`, z.boolean().optional()] as const),
  ),
});
/** Switches only level 4 turned on (→WEB-45). */
const LEVEL_FOUR_SWITCHES = ['transfers', 'business', 'manager', 'staff'];
/**
 * Staff switches (`delegation`) become the intervention level (→SAVE-10): 4 when offers,
 * sponsors, a coaching department or the manager post were delegated, else 2 when any decision
 * was, else 1. A saved level wins; malformed switches are refused.
 */
function legacyIntervention(input: unknown): unknown {
  if (!isRecord(input) || !('delegation' in input)) return input;
  const { delegation, ...rest } = input;
  if (delegation === undefined) return rest;
  const on = Object.entries(legacySwitches.parse(delegation))
    .filter(([, value]) => value)
    .map(([key]) => key);
  if (rest.intervention === undefined)
    rest.intervention = on.some(
      (key) => LEVEL_FOUR_SWITCHES.includes(key) || key.startsWith('coach:'),
    )
      ? 4
      : on.length
        ? 2
        : 1;
  return rest;
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
  if (!catalog) throw new Error('이전 규칙의 후원 계약을 옮길 카탈로그가 없습니다.');
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
  if (!contract.success) throw new Error('후원 계약 손상');
  delete w.sponsor;
  w.sponsors = [...(w.sponsors || []), contract.data];
}

/** `catalog` is needed only for a world from rules before 1.16 that has a sponsor. */
export function validateWorld(input: unknown, catalog?: LoadCatalog): World {
  const w = worldSchema.parse(
    legacyMarketing(
      legacyPathway(
        legacyDirection(
          legacyFacilities(legacyIntervention(legacyLevers(legacyMarket(legacyVision(input))))),
        ),
      ),
    ),
  );
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
  if (w.sponsor) legacySponsor(w, owner.country, catalog);
  if (w.sponsors && new Set(w.sponsors.map((s) => s.slot)).size !== w.sponsors.length)
    throw new Error('후원 계약 손상');
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
  for (const h of w.history) {
    if (h.scorers?.some((scorer) => scorer.club >= w.clubs.length))
      throw new Error('시즌 득점 기록 참조 손상');
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
        throw new Error('대진 기록 참조 손상');
  }
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
    if (!detailConsistent(m, side)) throw new Error('경기 고급 지표 손상');
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
