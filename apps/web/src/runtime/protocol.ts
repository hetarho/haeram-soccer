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
import { clubBuildSchema } from '../../../../packages/contracts/src/schema';
import { STRATEGY_NAME_LIMIT } from '../../../../packages/contracts/src/build';
import type { SAVE_COMPATIBILITY_CODE } from '../../../../packages/contracts/src/versions';
import type { clubMilestones } from '../../../../packages/engine/src/goals';
import type { financialBreakdown } from '../../../../packages/engine/src/finance';
import type { NewsItem } from '../../../../packages/engine/src/news';
import type { HeadToHead } from './headToHead';
import type { managerCandidates } from '../../../../packages/engine/src/managerMarket';
import {
  transferOffers,
  sponsorSlots,
  campaignOffers,
} from '../../../../packages/engine/src/operations';
const index = z.number().int().min(0).max(15);
const staffRole = z.enum([
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
  z.object({ type: z.literal('advance'), rounds: z.number().int().min(1).max(46) }),
  z.object({
    type: z.literal('advance-days'),
    days: z.number().int().min(1).max(31),
    stop: z.array(inboxKind).max(10).optional(),
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
  z.object({ type: z.literal('training'), focus: z.enum(['balanced', 'youth', 'recovery']) }),
  z.object({
    type: z.literal('policy'),
    key: z.enum(['support', 'recruitment', 'marketing', 'academy']),
    level: z.literal([1, 2, 3, 4, 5]),
  }),
  z.object({
    type: z.literal('hire-staff'),
    role: staffRole,
    candidate: index,
    term: term.optional(),
  }),
  z.object({ type: z.literal('release-staff'), role: staffRole }),
  z.object({ type: z.literal('renew-staff'), role: staffRole, term: term.optional() }),
  z.object({ type: z.literal('coaching'), role: staffRole, level: z.literal([1, 2, 3]) }),
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
    next: z.boolean().optional(),
  }),
  z.object({ type: z.literal('release-youth'), id: ref }),
  z.object({
    type: z.literal('delegate'),
    key: z.enum(['training', 'academy', 'transfers', 'business', 'staff', 'contracts', 'manager']),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal('bid'),
    candidate: index,
    fee: z.string().regex(/^\d{1,40}$/),
    loan: z.boolean().optional(),
  }),
  z.object({ type: z.literal('respond-bid'), id: ref, accept: z.boolean() }),
  z.object({ type: z.literal('read-inbox'), id: ref.optional() }),
  z.object({ type: z.literal('hire'), id: z.string().min(1).max(100), term: term.optional() }),
  z.object({ type: z.literal('renew-manager'), term: term.optional() }),
  z.object({ type: z.literal('manager-rule'), rule: z.enum(['school', 'best', 'strategy']) }),
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
    type: z.literal('campaign'),
    kind: z.enum(['outreach', 'tickets', 'merchandise', 'player']),
  }),
  z.object({
    type: z.literal('sponsor'),
    kind: z.enum(['stable', 'performance', 'exclusive', 'indexed']),
  }),
  z.object({ type: z.literal('facility') }),
  z.object({ type: z.literal('ticket'), price: z.number().min(0.01).max(0.5) }),
  z.object({ type: z.literal('support') }),
  z.object({ type: z.literal('accept-condition') }),
]);
export const requestSchema = z.object({
  protocol: z.literal(1),
  session: z.string().min(1).max(100),
  requestId: z.string().min(1).max(100),
  expectedRevision: z.number().int().min(-1),
  generation: z.number().int().positive(),
  parentGeneration: z.number().int().nonnegative(),
  body: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('inspect'),
      activate: z.boolean().optional(),
      upgrade: z.boolean().optional(),
      raw: z.string().max(4 * 1024 * 1024),
    }),
    z.object({
      type: z.literal('found'),
      replace: z.boolean().optional(),
      input: z.object({
        country: z.enum(['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL']),
        name: z.string().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        seed: z.string().max(80),
        difficulty: z.union([z.literal(0.5), z.literal(1), z.literal(2)]),
      }),
    }),
    z.object({ type: z.literal('command'), command }),
    z.object({ type: z.literal('export') }),
    z.object({ type: z.literal('save') }),
    z.object({ type: z.literal('archive'), year: z.number().int().min(1901).max(4000) }),
    z.object({ type: z.literal('head-to-head'), club: ref }),
    z.object({
      type: z.literal('league-fixtures'),
      country: z.string().regex(/^[A-Z]{3}$/),
      tier: z.number().int().min(0).max(20),
      group: z.number().int().min(0).max(20),
    }),
    z.object({ type: z.literal('ack-critical') }),
  ]),
});
export type Request = z.infer<typeof requestSchema>;
export type Body = Request['body'];
export interface View {
  world: World;
  totalMatches: number;
  supportUsed: number;
  milestones: ReturnType<typeof clubMilestones>;
  /** The manager market (→STAFF-17): free agents, then other clubs' managers. */
  managers: ReturnType<typeof managerCandidates>;
  transfers: ReturnType<typeof transferOffers>;
  /** Every sponsor slot with its contract or offers (→WEB-39). */
  sponsors: ReturnType<typeof sponsorSlots>;
  campaigns: ReturnType<typeof campaignOffers>;
  annualCost: string;
  coefficient: number;
  finance?: ReturnType<typeof financialBreakdown>;
  /** Club news derived from the full career; the projected world keeps only recent records. */
  news: NewsItem[];
}
export interface Reply {
  requestId: string;
  ok: boolean;
  error?: string;
  errorCode?: typeof SAVE_COMPATIBILITY_CODE;
  upgraded?: boolean;
  view?: View;
  playback?: MatchPlayback;
  raw?: string;
  envelope?: Envelope;
  candidate?: World;
  archive?: { season?: SeasonArchive; matches: MatchRecord[]; events: Event[]; managers: Event[] };
  headToHead?: HeadToHead;
  /** Another league's fixtures this season; the view carries only the own league's (→WEB-65). */
  leagueFixtures?: Fixture[];
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
