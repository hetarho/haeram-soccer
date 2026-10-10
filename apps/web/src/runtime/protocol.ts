import { z } from 'zod';
z.config({ jitless: true });
import type {
  World,
  MatchPlayback,
  MatchRecord,
  SeasonArchive,
  Event,
} from '../../../../packages/contracts/src/types';
import type { Envelope } from '../adapters/repository';
import { clubBuildSchema } from '../../../../packages/contracts/src/schema';
import type { SAVE_COMPATIBILITY_CODE } from '../../../../packages/contracts/src/versions';
import type { clubMilestones } from '../../../../packages/engine/src/goals';
import type { financialBreakdown } from '../../../../packages/engine/src/finance';
import type { NewsItem } from '../../../../packages/engine/src/news';
import {
  managerOffers,
  transferOffers,
  sponsorOffers,
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
const inboxKind = z.enum([
  'match',
  'window-open',
  'window-close',
  'bid-response',
  'incoming-bid',
  'youth-intake',
  'staff-report',
  'finance',
]);
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('advance'), rounds: z.number().int().min(1).max(46) }),
  z.object({
    type: z.literal('advance-days'),
    days: z.number().int().min(1).max(31),
    stop: z.array(inboxKind).max(8).optional(),
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
  z.object({ type: z.literal('hire-staff'), role: staffRole, candidate: index }),
  z.object({ type: z.literal('release-staff'), role: staffRole }),
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
  }),
  z.object({ type: z.literal('release-youth'), id: ref }),
  z.object({
    type: z.literal('delegate'),
    key: z.enum(['training', 'academy', 'transfers', 'business']),
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
  z.object({ type: z.literal('hire'), candidate: index }),
  z.object({ type: z.literal('recruit'), candidate: index, loan: z.boolean().optional() }),
  z.object({ type: z.literal('sell'), id: z.string().max(100) }),
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
    z.object({ type: z.literal('archive'), year: z.number().int().min(1901).max(4000) }),
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
  managers: ReturnType<typeof managerOffers>;
  transfers: ReturnType<typeof transferOffers>;
  sponsors: ReturnType<typeof sponsorOffers>;
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
  progress?: number;
  cancelled?: boolean;
}
