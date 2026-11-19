import type { contractRenewalReads } from './contractRenewals';
import type { Club } from '../../../../packages/contracts/src/types';
import { newsItemSchema } from '../../../../packages/contracts/src/news';
import type { NewsItem } from '../../../../packages/contracts/src/news';
import type { GenerationDigest, WorldMarketPage } from '../../../../packages/contracts/src/types';
import type { worldMarketDetail } from '../../../../packages/engine/src/world-market';
import {
  worldMarketQuerySchema,
  worldMarketTargetSchema,
} from '../../../../packages/contracts/src/schema';
import type { mediationPreview } from '../../../../packages/engine/src/mediation';
import type { PersonCareerDetail } from './personCareer';
import { PORTABLE_FILE_LIMIT } from '../adapters/repository';
import type { StaffRole } from '../../../../packages/contracts/src/types';
import type { staffCandidates } from '../../../../packages/engine/src/staff';
import { z } from 'zod';
z.config({ jitless: true });
import type {
  World,
  Player,
  PlayerProfileRead,
  Manager,
  Fixture,
  MatchPlayback,
  MatchRecord,
  SeasonArchive,
  Event,
} from '../../../../packages/contracts/src/types';
import {
  budgetResponsibilitySchema,
  gameSettingsSchema,
  spendRequestSchema,
  wageStep,
} from '../../../../packages/contracts/src/schema';
import {
  DIVIDEND_SHARES,
  OWNER_TRAIT_IDS,
  OWNER_TRAIT_LIMIT,
  TAKEOVER_DECADES,
  WEALTH_TIER_IDS,
  type ClubListing,
  type ClubProfile,
  type PreOwnerSeason,
} from '../../../../packages/contracts/src/owner';
import {
  designStudioSchema,
  identityColoursSchema,
  kitRoleSchema,
} from '../../../../packages/contracts/src/identitySchema';
import type { SAVE_COMPATIBILITY_CODE } from '../../../../packages/contracts/src/versions';
import type { BackupInfo, SAVE_CORRUPTED_CODE } from './seasonBackup';
import {
  FULL_STATS_KINDS,
  type FullStatsRead,
} from '../../../../packages/contracts/src/match-model';
import type { ManagerHistoryPage } from '../../../../packages/contracts/src/manager-history-view';
import type { clubMilestones } from '../../../../packages/engine/src/goals';
import type { financialBreakdown } from '../../../../packages/engine/src/finance';
import type { OfficeRead } from './officeRead';
import type { TransferLedgerEntry } from '../../../../packages/engine/src/transfer-records';
import type { ClubRecords } from './clubRecords';
import type { HeadToHead } from './headToHead';
import type { Tallies } from './playerTallies';
import type { managerCandidates } from '../../../../packages/engine/src/managerMarket';
import type { transferOffers, sponsorSlots } from '../../../../packages/engine/src/operations';
const index = z.number().int().min(0).max(15);
const staffRole = z.enum([
  'director',
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
]);
const ref = z.string().min(1).max(100);
const term = z.literal([1, 2, 3, 4, 5]);
/** A player contract's term (→CLUB-26): 1–5 seasons in the summer, 0–4 after this one in winter. */
const talkTerm = z.literal([0, 1, 2, 3, 4, 5]);
const inboxKind = z.enum([
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
]);
const command = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('settings'), settings: gameSettingsSchema }),
  z.strictObject({
    type: z.literal('club-policy'),
    key: z.enum([
      'support',
      'recruitment',
      'academy',
      'localInvest',
      'globalMarketing',
      'globalScouting',
      'tour',
    ]),
    level: term,
  }),
  z.strictObject({
    type: z.literal('coaching-investment'),
    choice: z.enum(['volunteer', 'cheap', 'standard', 'elite']),
  }),
  z.strictObject({
    type: z.literal('club-direction'),
    key: z.enum([
      'recruitmentSupport',
      'renewal',
      'school',
      'manager',
      'coaches',
      'youthGoal',
      'debut',
    ]),
    choice: z.string().min(1).max(40),
  }),
  z.strictObject({
    type: z.literal('club-build'),
    slot: z.enum(['youth', 'scouting', 'market', 'revenue', 'fans', 'culture']),
    choice: z.string().min(1).max(40),
  }),
  z.strictObject({ type: z.literal('club-ticket'), price: z.number().finite().min(0.01).max(1) }),
  z.strictObject({
    type: z.literal('delegation-request'),
    responsibility: budgetResponsibilitySchema,
    level: spendRequestSchema,
  }),
  z.strictObject({
    type: z.literal('facility-upgrade'),
    part: z.enum(['training', 'academy', 'stadium']),
    from: z.number().int().min(0).max(8),
    cost: z.string().regex(/^\d{1,40}$/),
  }),
  z.strictObject({ type: z.literal('next-event') }),
  z.object({ type: z.literal('advance'), rounds: z.number().int().min(1).max(46) }),
  z.object({
    type: z.literal('advance-days'),
    days: z.number().int().min(1).max(31),
    // Level 1 stops for every kind (→WEB-45).
    stop: z.array(inboxKind).max(inboxKind.options.length).optional(),
  }),
  z.object({ type: z.literal('next-match') }),
  z.object({ type: z.literal('season'), count: z.literal(1) }),
  z.object({
    type: z.literal('hire-staff'),
    role: staffRole,
    candidate: z.number().int().nonnegative().max(100000),
    candidateId: ref.optional(),
    term: term.optional(),
  }),
  z.object({ type: z.literal('release-staff'), role: staffRole }),
  z.object({ type: z.literal('renew-staff'), role: staffRole, term: term.optional() }),
  z.object({ type: z.literal('promote-youth'), id: ref }),
  z.object({ type: z.literal('release-youth'), id: ref }),
  z
    .strictObject({
      type: z.literal('bid'),
      candidate: index.optional(),
      target: worldMarketTargetSchema.optional(),
      fee: z.string().regex(/^\d{1,40}$/),
      loan: z.boolean().optional(),
      wage: wageStep.optional(),
    })
    .refine(
      (c) => (c.candidate === undefined) !== (c.target === undefined),
      'Choose one recruitment target',
    ),
  z.object({ type: z.literal('respond-bid'), id: ref, accept: z.boolean() }),
  z.object({ type: z.literal('read-inbox'), id: ref.optional() }),
  z.object({
    type: z.literal('resolve-mediation'),
    id: ref,
    support: z.enum(['director', 'balanced', 'manager']),
  }),
  z.object({ type: z.literal('answer-playing-coach'), player: ref, accept: z.boolean() }),
  z.object({ type: z.literal('hire'), id: z.string().min(1).max(100), term: term.optional() }),
  z.object({ type: z.literal('renew-manager'), term: term.optional() }),
  z.object({
    type: z.literal('contract-offer'),
    player: ref,
    wage: z.string().regex(/^\d{1,40}$/),
    term: talkTerm,
  }),
  z.object({ type: z.literal('contract-decline'), player: ref }),
  z.object({
    type: z.literal('sign-sponsor'),
    slot: z.enum(['local', 'kit', 'shirt', 'stadium', 'sleeve']),
    offer: index,
  }),
  z
    .strictObject({
      type: z.literal('recruit'),
      candidate: index.optional(),
      target: worldMarketTargetSchema.optional(),
      loan: z.boolean().optional(),
      wage: wageStep.optional(),
    })
    .refine(
      (c) => (c.candidate === undefined) !== (c.target === undefined),
      'Choose one recruitment target',
    ),
  z.object({
    type: z.literal('transfer-stance'),
    id: ref,
    stance: z.enum(['listed', 'open', 'untouchable']),
  }),
  // The engine's role vocabulary, or null for automatic selection (→KIT-6).
  z.strictObject({ type: z.literal('match-kit'), fixtureId: ref, role: kitRoleSchema.nullable() }),
  z.strictObject({
    type: z.literal('design-commission'),
    studio: designStudioSchema,
    colours: identityColoursSchema,
  }),
  z.strictObject({ type: z.literal('adopt-design'), draft: z.number().int().min(0).max(3) }),
  z.strictObject({ type: z.literal('discard-designs') }),
  z.strictObject({ type: z.literal('redraw-designs') }),
  // The owner's own money (→OWNER-7/9/11): a whole-percent stake, an injection, the dividend dial.
  z.strictObject({ type: z.literal('owner-stake'), percent: z.number().int().min(0).max(100) }),
  z.strictObject({ type: z.literal('owner-inject'), amount: z.string().regex(/^\d{1,40}$/) }),
  z.strictObject({ type: z.literal('owner-dividend'), share: z.literal(DIVIDEND_SHARES) }),
]);
/** A game's ID names its database file, so it is checked before it reaches the pool (→ARCH-11). */
const gameId = z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/);
export const requestSchema = z.object({
  protocol: z.literal(1),
  session: z.string().min(1).max(100),
  requestId: z.string().min(1).max(100),
  expectedRevision: z.number().int().min(-1),
  /** The published view the client holds; a reply then carries only the parts that changed. */
  viewBase: z.number().int().nonnegative().optional(),
  body: z.discriminatedUnion('type', [
    // A new game (→WEB-2, WORLD-13): the world generated to the chosen decade, held by the worker
    // unsaved until one of its clubs is taken over; `replace` starts it beside a game in play.
    z.strictObject({
      type: z.literal('generate'),
      replace: z.boolean().optional(),
      choice: z.strictObject({
        tier: z.enum(WEALTH_TIER_IDS),
        traits: z
          .array(z.enum(OWNER_TRAIT_IDS))
          .max(OWNER_TRAIT_LIMIT)
          .refine((traits) => new Set(traits).size === traits.length),
        decade: z.literal(TAKEOVER_DECADES),
        seed: z.string().min(1).max(80),
      }),
    }),
    // The takeover of a club of the generated world with standard operating defaults (→ECON-38, WEB-15).
    z.strictObject({
      type: z.literal('take-over'),
      replace: z.boolean().optional(),
      clubId: ref,
    }),
    // Any club's profile (→WEB-15, WEB-58): of the career `world` in play, or of the generated
    // world before the takeover when `world` is absent.
    z.strictObject({
      type: z.literal('club-profile'),
      clubId: ref,
      world: z.string().min(1).max(300).optional(),
    }),
    // A first-team player of any club in the career `world`, for his detail (→WEB-59); `clubId`
    // is where he was named, looked at first.
    z.strictObject({
      type: z.literal('player-profile'),
      clubId: ref.optional(),
      playerId: ref,
      world: z.string().min(1).max(300),
    }),
    z.object({ type: z.literal('command'), command, automatic: z.boolean().optional() }),
    // The game in play's database (→SAVE-2, →ARCH-6): `open-game` loads and validates it, then
    // plays it; `create-game` writes every row of the world in play into it after a takeover (or
    // an activated import, `replace`); `save` commits the rows changed since the last save.
    z.strictObject({ type: z.literal('open-game'), gameId }),
    z.strictObject({
      type: z.literal('create-game'),
      gameId,
      replace: z.boolean().optional(),
    }),
    z.object({ type: z.literal('save') }),
    // Slots are database files (→SAVE-14): `close-game` releases the game in play's database after
    // its save, `delete-game` removes a game's file (closing it first when it is in play) and
    // `list-games` answers the game IDs whose files exist (→SAVE-29). `pause` also releases the
    // database pool, so another tab can take the game (→SAVE-6); the pool resumes on its next use.
    z.strictObject({ type: z.literal('close-game'), pause: z.literal(true).optional() }),
    z.strictObject({ type: z.literal('delete-game'), gameId }),
    z.strictObject({ type: z.literal('list-games') }),
    // `restore-backup` copies a game's season backup over its database file and opens it (→SAVE-31);
    // the client asks only after the owner accepted the offer a corrupted open made.
    z.strictObject({ type: z.literal('restore-backup'), gameId }),
    // The portable save file (→SAVE-9): `export-game` answers a game's database as one file
    // (the client has saved the game in play first); `import-game` checks a file whole in a
    // temporary database and only then makes it the game `gameId`'s file and the game in play,
    // after which the file of the game it `replaces` goes. Any failure changes nothing.
    // `memory` exports the game in play as it stands in memory, its unsaved changes written into a
    // copy of its committed file: the progress a failed save leaves exportable (→SAVE-3, →SAVE-10).
    z.strictObject({ type: z.literal('export-game'), gameId, memory: z.boolean().optional() }),
    z.strictObject({
      type: z.literal('import-game'),
      gameId,
      replaces: gameId.optional(),
      file: z.custom<Uint8Array>(
        (bytes) => bytes instanceof Uint8Array && bytes.length <= PORTABLE_FILE_LIMIT,
      ),
    }),
    z.strictObject({
      type: z.literal('news-page'),
      tag: newsItemSchema.shape.tag.optional(),
      world: z.string().min(1).max(300),
      before: z.string().min(1).max(300).optional(),
    }),
    z.object({ type: z.literal('archive'), year: z.number().int().min(1901).max(4000) }),
    // One page of the own managers' tenures and older personnel events (→HIST-18/19, WEB-92):
    // `cursor` is the query's own page position and `world` the career the client shows, so a
    // read answered from another career is refused rather than shown.
    z.strictObject({
      type: z.literal('manager-history'),
      cursor: z.string().min(1).max(2000).optional(),
      world: z.string().min(1).max(300).optional(),
    }),
    z.strictObject({ type: z.literal('world-market'), query: worldMarketQuerySchema }),
    z.strictObject({
      type: z.literal('world-market-detail'),
      target: worldMarketTargetSchema,
      fee: z
        .string()
        .regex(/^\d{1,40}$/)
        .optional(),
      loan: z.boolean().optional(),
    }),
    z.object({ type: z.literal('head-to-head'), club: ref }),
    z.object({ type: z.literal('club-records') }),
    z.object({ type: z.literal('person-career'), person: ref }),
    z.object({ type: z.literal('recruitment-history') }),
    z.object({
      type: z.literal('mediation-preview'),
      id: ref,
      support: z.enum(['director', 'balanced', 'manager']),
    }),
    z.object({
      type: z.literal('league-fixtures'),
      country: z.string().regex(/^[A-Z]{3}$/),
      tier: z.number().int().min(0).max(20),
      group: z.number().int().min(0).max(20),
    }),
    // One competition of the season in progress, its complete statistics (→WEB-89).
    z.strictObject({
      type: z.literal('full-stats'),
      kind: z.enum(FULL_STATS_KINDS),
      groupKey: ref,
    }),
    // The five slow projection parts for the current world (→WEB-119), read without publishing a view.
    z.strictObject({ type: z.literal('stopped-reads'), world: z.string().min(1).max(300) }),
    z.object({ type: z.literal('ack-critical') }),
  ]),
});
export type Request = z.infer<typeof requestSchema>;
export type Body = Request['body'];
/**
 * Daily projection excludes the lifetime person registry and the free-agent pool, and bounds
 * resolved recruitment history. The season's complete statistics come with a `full-stats` read
 * when a view asks (→WEB-89), and the manager-history facts with a `manager-history` read
 * (→HIST-18).
 */
export type ProjectedWorld = Omit<
  World,
  | 'people'
  | 'npcSeason'
  | 'managerHistory'
  | 'newsJournal'
  | 'careerReads'
  | 'freeAgents'
  | 'squads'
  | 'playerRecords'
  | 'npcMarketAt'
  | 'npcGrowthAt'
  | 'npcRetirementAt'
  | 'npcSummerAt'
  | 'clubs'
> & {
  people?: never;
  squads?: never;
  /** Always supplied by the worker; optional for earlier prepared views. */
  clubs: (Club & { rating?: number })[];
  disciplineNames?: Record<string, { name: string; club: string }>;
  /** Bounded own-talk facts computed with the worker's retained bid/stint history. */
  renewalChances?: ReturnType<typeof contractRenewalReads>;
  /**
   * The next opponent's actual eligible XI and its manager, resolved on the worker: the person
   * registry names the XI, and the manager market (orchestration, →ARCH-4) names the manager.
   */
  nextOpponentLineup?: {
    fixture: string;
    club: string;
    players: Pick<Player, 'id' | 'name'>[];
    manager: Pick<Manager, 'name' | 'style'>;
  };
};
export interface View {
  world: ProjectedWorld;
  coaches?: Partial<Record<StaffRole, ReturnType<typeof staffCandidates>>>;
  totalMatches: number;
  milestones: ReturnType<typeof clubMilestones>;
  /** The manager market (→STAFF-17): free agents, then other clubs' managers. */
  managers?: ReturnType<typeof managerCandidates>;
  transfers?: ReturnType<typeof transferOffers>;
  /** Every sponsor slot with its contract or offers (→WEB-39). */
  sponsors: ReturnType<typeof sponsorSlots>;
  annualCost: string;
  coefficient: number;
  finance?: ReturnType<typeof financialBreakdown>;
  office?: OfficeRead;
  /** Club news derived from the full career; the projected world keeps only recent records. */
  news: NewsItem[];
  newsTotal?: number;
  /** Appearances and cards from every own match (→HIST-13, HIST-16). */
  tallies: Tallies;
  /**
   * Changes whenever the `manager-history` read would answer differently: the facts, a settled own
   * match, a closed season, the manager in charge or this season's provisional place. The records
   * room reads the history again on it, never on the date alone (→HIST-18, WEB-92).
   */
  managerHistoryKey?: string;
  /**
   * The older career's fee ledger entries (→HIST-20), which the projected world's recent events
   * cannot rank; absent from views made before it.
   */
  transferLedger?: TransferLedgerEntry[];
  /**
   * The bought club's seasons before the takeover (→HIST-21), read from the archived standings and
   * brackets the projected world leaves out; absent in a founded career.
   */
  preOwner?: PreOwnerSeason[];
}
/**
 * The view parts that cost the most to compute each day (→WEB-119): the manager and staff markets,
 * the transfer offers, the discipline table's player names and the office's previews, as a read
 * answers them for one world revision; the projection carries the same five.
 */
export interface StoppedReads {
  world: string;
  revision: number;
  coaches: NonNullable<View['coaches']>;
  managers: NonNullable<View['managers']>;
  transfers: NonNullable<View['transfers']>;
  disciplineNames: NonNullable<ProjectedWorld['disciplineNames']>;
  office: OfficeRead;
}
/**
 * Published views each side keeps, so a reply can still name the base a client holds after a
 * request whose view it does not take (a game file's export or import).
 */
export const PUBLISHED_VIEWS = 2;
/**
 * The view parts that changed since the client's `viewBase` (→ARCH-6): changed top-level parts,
 * changed keys of the projected world and the keys either no longer has.
 */
export interface ViewDelta {
  base: number;
  parts: Partial<Omit<View, 'world'>>;
  world: Partial<ProjectedWorld>;
  /** Removed keys; projected world keys are named `world.<key>`. */
  dropped: string[];
  /** Large changed parts as the changes inside them, keyed as `dropped` names them. */
  patches?: Record<string, ViewPatch>;
  /**
   * `patches` as the JSON the publisher already wrote to size them, the form a worker posts: one
   * string copies across in a fraction of the time thousands of small patch objects take.
   */
  patchText?: string;
}
/**
 * The changes inside one view part: a whole value, an object's changed keys and removed keys, or
 * an array's changed indices with its new length.
 */
export type ViewPatch =
  | { v: unknown }
  | { o: Record<string, ViewPatch>; d?: string[] }
  | { a: [number, ViewPatch][]; n: number };
/**
 * Gives a value sent whole the references of its base where they are equal (the client's
 * `shareValue`), so a view rebuilt with it needs no second walk over the whole view.
 */
export type ShareValue = (before: unknown, after: unknown) => unknown;
const keep: ShareValue = (_before, after) => after;
/** `base` with `patch` applied; objects off the changed paths keep their identity. */
export function applyViewPatch(base: unknown, patch: ViewPatch, share: ShareValue = keep): unknown {
  if ('v' in patch) return share(base, patch.v);
  // `{ v: undefined }` read back from `patchText`.
  if (!('o' in patch) && !('a' in patch)) return undefined;
  if ('o' in patch) {
    const out = { ...(base as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(patch.o))
      out[key] = applyViewPatch(out[key], sub, share);
    for (const key of patch.d ?? []) delete out[key];
    return out;
  }
  const out = (base as unknown[]).slice(0, patch.n);
  for (const [index, sub] of patch.a) out[index] = applyViewPatch(out[index], sub, share);
  return out;
}
/**
 * The whole view a delta describes, rebuilt on the base view it names, with its patches sent as
 * objects or as `patchText`. With `share`, every value the delta carries regains the base's equal
 * references, and a delta that changes nothing is the base itself.
 */
export function applyViewDelta(base: View, delta: ViewDelta, share: ShareValue = keep): View {
  const patches =
    delta.patches ??
    (delta.patchText ? (JSON.parse(delta.patchText) as Record<string, ViewPatch>) : {});
  if (
    share !== keep &&
    !delta.dropped.length &&
    !Object.keys(delta.parts).length &&
    !Object.keys(delta.world).length &&
    !Object.keys(patches).length
  )
    return base;
  const view = { ...base, world: { ...base.world } } as View;
  const top = view as unknown as Record<string, unknown>,
    world = view.world as Record<string, unknown>;
  for (const [key, value] of Object.entries(delta.parts))
    top[key] = share(base[key as keyof Omit<View, 'world'>], value);
  for (const [key, value] of Object.entries(delta.world))
    world[key] = share(base.world[key as keyof ProjectedWorld], value);
  for (const key of delta.dropped)
    if (key.startsWith('world.')) delete world[key.slice(6)];
    else delete top[key];
  for (const [key, patch] of Object.entries(patches))
    if (key.startsWith('world.')) {
      const part = key.slice(6) as keyof ProjectedWorld;
      world[part] = applyViewPatch(base.world[part], patch, share);
    } else {
      const part = key as keyof Omit<View, 'world'>;
      top[part] = applyViewPatch(base[part], patch, share);
    }
  return view;
}
export interface Reply {
  requestId: string;
  ok: boolean;
  error?: string;
  errorCode?: typeof SAVE_COMPATIBILITY_CODE | typeof SAVE_CORRUPTED_CODE;
  upgraded?: boolean;
  view?: View;
  /** Names the view this reply publishes, whole or as a delta, for later requests' `viewBase`. */
  viewSeq?: number;
  /** Sent instead of `view` when the request's `viewBase` is a view the host still remembers. */
  viewDelta?: ViewDelta;
  playback?: MatchPlayback;
  archive?: { season?: SeasonArchive; matches: MatchRecord[]; events: Event[]; managers: Event[] };
  newsPage?: { world: string; items: NewsItem[]; next?: string };
  headToHead?: HeadToHead;
  /** Our match records over every own match (→WEB-54); the view keeps only recent matches. */
  clubRecords?: ClubRecords;
  personCareer?: PersonCareerDetail;
  mediationPreview?: ReturnType<typeof mediationPreview>;
  recruitmentHistory?: {
    mediations: NonNullable<World['mediations']>;
    promises: NonNullable<World['promises']>;
  };
  /** Another league's fixtures this season; the view carries only the own league's (→WEB-65). */
  leagueFixtures?: Fixture[];
  /** A competition's complete statistics this season; absent while the season keeps none. */
  fullStats?: FullStatsRead;
  /** One page of the manager history, summarised from every retained own match (→HIST-18/19). */
  managerHistory?: ManagerHistoryPage;
  worldMarket?: WorldMarketPage;
  worldMarketDetail?: ReturnType<typeof worldMarketDetail>;
  /** The slow projection parts of the current world, answered by a `stopped-reads` read. */
  stoppedReads?: StoppedReads;
  progress?: number;
  /** The season a world's generation has reached, with `progress` (→WEB-15, WORLD-13). */
  season?: number;
  /** That season's history for the start's view (→WEB-115); absent before the first close. */
  digest?: GenerationDigest;
  /** The generated world's clubs on sale and the chosen tier's fortune in pounds (→ECON-37). */
  start?: { listings: ClubListing[]; fortune: string };
  clubProfile?: ClubProfile;
  playerProfile?: PlayerProfileRead;
  cancelled?: boolean;
  /**
   * A committed save of the game in play (→SAVE-3): the revision its transaction committed. Only a
   * committed save is answered so; a failed write is an error reply.
   */
  saved?: {
    gameId: string;
    worldId: string;
    revision: number;
    /** The season backup this save wrote after a season close (→SAVE-31), the slot index's to keep. */
    backup?: BackupInfo;
  };
  /**
   * `open-game`'s answer: the game it opened at the revision its database holds, or `found: false`
   * when the game has no database file, an empty slot (→SAVE-29).
   */
  opened?: { gameId: string; found: boolean; revision?: number; backup?: BackupInfo };
  /** `list-games`' answer: the IDs of the games whose database files exist (→SAVE-29). */
  games?: string[];
  /** `export-game`'s answer: the game's database as a portable `.haeram-save` file (→SAVE-9). */
  file?: Uint8Array;
}
