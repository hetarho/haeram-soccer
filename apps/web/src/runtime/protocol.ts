import type { mediationPreview } from '../../../../packages/engine/src/mediation';
import type { PersonCareerDetail } from './personCareer';
import type { StaffRole } from '../../../../packages/contracts/src/types';
import type { staffCandidates } from '../../../../packages/engine/src/staff';
import type { CareerAssessment } from '../../../../packages/engine/src/career-assessment';
import { z } from 'zod';
z.config({ jitless: true });
import type {
  World,
  Fixture,
  MatchPlayback,
  MatchRecord,
  SeasonArchive,
  Event,
} from '../../../../packages/contracts/src/types';
import type { Envelope } from '../adapters/repository';
import { clubBuildSchema, gameSettingsSchema } from '../../../../packages/contracts/src/schema';
import {
  clubIdentitySchema,
  kitRoleSchema,
} from '../../../../packages/contracts/src/identitySchema';
import { STRATEGY_NAME_LIMIT } from '../../../../packages/contracts/src/build';
import type { SAVE_COMPATIBILITY_CODE } from '../../../../packages/contracts/src/versions';
import {
  assertMatchModelFormat,
  FULL_STATS_KINDS,
  matchModelStateSchema,
  type FullStatsRead,
} from '../../../../packages/contracts/src/match-model';
import type { ManagerHistoryPage } from '../../../../packages/contracts/src/manager-history-view';
import type { clubMilestones } from '../../../../packages/engine/src/goals';
import type { financialBreakdown } from '../../../../packages/engine/src/finance';
import type { NewsItem } from '../../../../packages/engine/src/news';
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
    type: z.literal('tactics'),
    tactic: z.enum(['balanced', 'possession', 'counter', 'press']),
    tone: z.enum(['respect', 'evidence', 'support', 'demand']),
  }),
  z.object({
    type: z.literal('lineup'),
    ids: z.array(z.string().min(1).max(100)).length(11).nullable(),
  }),
  z.object({
    type: z.literal('coach-training'),
    coach: z.enum(['assistant', 'youth']),
    focus: z.enum(['balanced', 'recovery', 'hard', 'fundamentals', 'firstTeam']),
    force: z.boolean().optional(),
    player: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal('policy'),
    key: z.enum([
      'support',
      'recruitment',
      'academy',
      'localInvest',
      'grassroots',
      'globalMarketing',
      'globalScouting',
      'tour',
    ]),
    level: z.literal([1, 2, 3, 4, 5]),
  }),
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
  z.object({
    type: z.literal('care'),
    kind: z.enum([
      'rest-day',
      'recovery',
      'meeting',
      'bonding',
      'camp',
      'backing',
      'win-bonus',
      'owner-visit',
      'friendly',
    ]),
  }),
  z.object({
    type: z.literal('build'),
    build: clubBuildSchema,
    name: z.string().trim().min(1).max(STRATEGY_NAME_LIMIT).optional(),
  }),
  z.object({ type: z.literal('release-youth'), id: ref }),
  z.object({
    type: z.literal('intervention'),
    level: z.literal([1, 2, 3, 4]),
  }),
  z.object({
    type: z.literal('bid'),
    candidate: index,
    fee: z.string().regex(/^\d{1,40}$/),
    loan: z.boolean().optional(),
  }),
  z.object({ type: z.literal('respond-bid'), id: ref, accept: z.boolean() }),
  z.object({ type: z.literal('read-inbox'), id: ref.optional() }),
  z.object({ type: z.literal('encourage-coaching'), player: ref }),
  z.object({
    type: z.literal('resolve-mediation'),
    id: ref,
    support: z.enum(['director', 'balanced', 'manager']),
  }),
  z.object({
    type: z.literal('propose-playing-coach'),
    player: ref,
    years: z.literal([1, 2]),
    term,
  }),
  z.object({ type: z.literal('answer-playing-coach'), player: ref, accept: z.boolean() }),
  z.object({ type: z.literal('hire'), id: z.string().min(1).max(100), term: term.optional() }),
  z.object({ type: z.literal('renew-manager'), term: term.optional() }),
  z.object({
    type: z.literal('direction'),
    key: z.enum([
      'recruitmentSupport',
      'renewal',
      'school',
      'manager',
      'coaches',
      'finance',
      'youthGoal',
      'debut',
    ]),
    option: z.string().min(1).max(40),
  }),
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
  z.object({ type: z.literal('recruit'), candidate: index, loan: z.boolean().optional() }),
  z.object({
    type: z.literal('transfer-stance'),
    id: ref,
    stance: z.enum(['listed', 'open', 'untouchable']),
  }),
  z.object({
    type: z.literal('sponsor'),
    kind: z.enum(['stable', 'performance', 'exclusive', 'indexed']),
  }),
  z.object({ type: z.literal('facility'), part: z.enum(['stadium', 'training', 'academy']) }),
  z.object({ type: z.literal('ticket'), price: z.number().min(0.01).max(0.5) }),
  z.object({ type: z.literal('support') }),
  z.object({ type: z.literal('accept-condition') }),
  // Strict: the own club is implied, so a club target is refused rather than stripped (→KIT-9).
  z.strictObject({ type: z.literal('club-identity'), identity: clubIdentitySchema }),
  // The engine's role vocabulary, or null for automatic selection (→KIT-6).
  z.strictObject({ type: z.literal('match-kit'), fixtureId: ref, role: kitRoleSchema.nullable() }),
]);
export const requestSchema = z.object({
  protocol: z.literal(1),
  session: z.string().min(1).max(100),
  requestId: z.string().min(1).max(100),
  expectedRevision: z.number().int().min(-1),
  generation: z.number().int().positive(),
  parentGeneration: z.number().int().nonnegative(),
  /** The published view the client holds; a reply then carries only the parts that changed. */
  viewBase: z.number().int().nonnegative().optional(),
  body: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('inspect'),
      metadataOnly: z.boolean().optional(),
      activate: z.boolean().optional(),
      upgrade: z.boolean().optional(),
      raw: z.string().max(8 * 1024 * 1024),
    }),
    z.object({
      type: z.literal('found'),
      replace: z.boolean().optional(),
      input: z.object({
        country: z.enum(['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL']),
        name: z.string().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        seed: z.string().max(80),
        level: z.enum(['easy', 'normal', 'hard', 'extreme']),
        preset: z.string().min(1).max(40).optional(),
        // The previewed founding identity (→KIT-14); the engine checks it leads with `color`.
        identity: clubIdentitySchema.optional(),
      }),
    }),
    z.object({ type: z.literal('command'), command }),
    z.object({ type: z.literal('export') }),
    z.object({ type: z.literal('save') }),
    z.object({ type: z.literal('archive'), year: z.number().int().min(1901).max(4000) }),
    // One page of the own managers' tenures and older personnel events (→HIST-18/19, WEB-92):
    // `cursor` is the query's own page position and `world` the career the client shows, so a
    // read answered from another career is refused rather than shown.
    z.strictObject({
      type: z.literal('manager-history'),
      cursor: z.string().min(1).max(2000).optional(),
      world: z.string().min(1).max(300).optional(),
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
    z.object({ type: z.literal('ack-critical') }),
  ]),
});
export type Request = z.infer<typeof requestSchema>;
export type Body = Request['body'];
/**
 * Daily projection excludes the lifetime person registry and bounds resolved recruitment history.
 * The season's complete statistics come with a `full-stats` read when a view asks (→WEB-89), and
 * the manager-history facts with a `manager-history` read (→HIST-18).
 */
export type ProjectedWorld = Omit<World, 'people' | 'npcSeason' | 'managerHistory'> & {
  people?: never;
};
export interface View {
  world: ProjectedWorld;
  careers: Record<string, CareerAssessment>;
  coaches: Partial<Record<StaffRole, ReturnType<typeof staffCandidates>>>;
  totalMatches: number;
  supportUsed: number;
  milestones: ReturnType<typeof clubMilestones>;
  /** The manager market (→STAFF-17): free agents, then other clubs' managers. */
  managers: ReturnType<typeof managerCandidates>;
  transfers: ReturnType<typeof transferOffers>;
  /** Every sponsor slot with its contract or offers (→WEB-39). */
  sponsors: ReturnType<typeof sponsorSlots>;
  annualCost: string;
  coefficient: number;
  finance?: ReturnType<typeof financialBreakdown>;
  /** Club news derived from the full career; the projected world keeps only recent records. */
  news: NewsItem[];
  /** Appearances, cards and this season's heat maps from every own match (→HIST-13, HIST-16). */
  tallies: Tallies;
  /**
   * Changes whenever the `manager-history` read would answer differently: the facts, a settled own
   * match, a closed season, the manager in charge or this season's provisional place. The records
   * room reads the history again on it, never on the date alone (→HIST-18, WEB-92).
   */
  managerHistoryKey?: string;
}
/**
 * Published views each side keeps, so a reply can still name the base a client holds after a
 * request whose view it does not take (an export or a save inspection).
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
}
/**
 * The changes inside one view part: a whole value, an object's changed keys and removed keys, or
 * an array's changed indices with its new length.
 */
export type ViewPatch =
  | { v: unknown }
  | { o: Record<string, ViewPatch>; d?: string[] }
  | { a: [number, ViewPatch][]; n: number };
/** `base` with `patch` applied; objects off the changed paths keep their identity. */
export function applyViewPatch(base: unknown, patch: ViewPatch): unknown {
  if ('v' in patch) return patch.v;
  if ('o' in patch) {
    const out = { ...(base as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(patch.o)) out[key] = applyViewPatch(out[key], sub);
    for (const key of patch.d ?? []) delete out[key];
    return out;
  }
  const out = (base as unknown[]).slice(0, patch.n);
  for (const [index, sub] of patch.a) out[index] = applyViewPatch(out[index], sub);
  return out;
}
/** The whole view a delta describes, rebuilt on the base view it names. */
export function applyViewDelta(base: View, delta: ViewDelta): View {
  const view = { ...base, ...delta.parts, world: { ...base.world, ...delta.world } } as View;
  for (const key of delta.dropped)
    if (key.startsWith('world.')) delete (view.world as Record<string, unknown>)[key.slice(6)];
    else delete (view as unknown as Record<string, unknown>)[key];
  for (const [key, patch] of Object.entries(delta.patches ?? {}))
    if (key.startsWith('world.')) {
      const part = key.slice(6) as keyof ProjectedWorld;
      (view.world as Record<string, unknown>)[part] = applyViewPatch(base.world[part], patch);
    } else {
      const part = key as keyof Omit<View, 'world'>;
      (view as unknown as Record<string, unknown>)[part] = applyViewPatch(base[part], patch);
    }
  return view;
}
/** What a metadata-only inspection reports: identity, revision and any persisted match model. */
export type WorldMetadata = Pick<World, 'id' | 'revision' | 'matchModel'>;
/**
 * A checkpoint world's metadata (→SAVE-23): a future model revision is a typed compatibility
 * failure, a supported one is carried as a validated copy. It neither activates the world nor
 * changes any of its facts.
 */
export function worldMetadataOf(w: World): WorldMetadata {
  assertMatchModelFormat(w);
  return {
    id: w.id,
    revision: w.revision,
    ...(w.matchModel ? { matchModel: matchModelStateSchema.parse(w.matchModel) } : {}),
  };
}
export interface Reply {
  requestId: string;
  ok: boolean;
  error?: string;
  errorCode?: typeof SAVE_COMPATIBILITY_CODE;
  upgraded?: boolean;
  view?: View;
  /** Names the view this reply publishes, whole or as a delta, for later requests' `viewBase`. */
  viewSeq?: number;
  /** Sent instead of `view` when the request's `viewBase` is a view the host still remembers. */
  viewDelta?: ViewDelta;
  playback?: MatchPlayback;
  raw?: string;
  envelope?: Envelope;
  candidate?: World;
  worldMetadata?: WorldMetadata;
  archive?: { season?: SeasonArchive; matches: MatchRecord[]; events: Event[]; managers: Event[] };
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
  progress?: number;
  cancelled?: boolean;
  /** A save request handed this world revision to the codec worker; its checkpoint follows there. */
  saving?: { worldId: string; revision: number };
}
/** A snapshot the engine worker posts straight to the codec worker (→ARCH-13). */
export interface CodecJob {
  /** The save request's ID, which the client waits on for the checkpoint. */
  id: string;
  world: World;
  generation: number;
  parentGeneration: number;
}
/** The codec's validated checkpoint for the client, or why none was built; nothing is written. */
export type CodecResult =
  | { id: string; ok: true; revision: number; raw: string; envelope: Envelope }
  | { id: string; ok: false; error: string; errorCode?: typeof SAVE_COMPATIBILITY_CODE };
