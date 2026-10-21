/** Isolated own-club tenure facts. No live world, storage or simulation dependency. */
import { z } from 'zod';
import type { CareerDate, Manager, MatchRecord } from './types';

export type ManagerHistoryIdentity = Pick<Manager, 'id' | 'name' | 'interim' | 'person'> & {
  since?: number;
};
export type ManagerDeparture = 'replaced' | 'resigned' | 'retired' | 'expired';
export interface ManagerTenure {
  id: string;
  manager: string;
  person?: string;
  name: string;
  interim: boolean;
  /** Attribution boundary, distinct from an unknown earlier appointment. */
  trackedFrom: CareerDate;
  appointed?: CareerDate;
  knownSince?: number;
  ended?: CareerDate;
  departure?: ManagerDeparture;
  /** Explicit caller event keys make repeated appointments/departures idempotent. */
  appointmentKey: string;
  departureKey?: string;
}
export interface ManagerDivisionRef {
  country: string;
  tier: number;
  group: number;
}
export const isManagerPromotionMove = (from: ManagerDivisionRef, to: ManagerDivisionRef) =>
  from.country === to.country && to.tier < from.tier;
export type ManagerOutcomeSource =
  | ({ kind: 'league-finish'; year: number } & ManagerDivisionRef)
  | { kind: 'cup-title'; year: number; competition: string }
  | {
      kind: 'promotion';
      year: number;
      club: string;
      from: ManagerDivisionRef;
      to: ManagerDivisionRef;
    };
export interface ManagerOutcome {
  source: ManagerOutcomeSource;
  tenure: string;
  at: CareerDate;
}
export interface ManagerHistoryFacts {
  club: string;
  trackedFrom: CareerDate & { revision: number };
  coverage: 'founding' | 'activation';
  /** Last allocated serial, independent of names, dates and the simulation RNG. */
  serial: number;
  /** Appointment order also orders multiple changes on the same day. */
  tenures: ManagerTenure[];
  /** Settlement order; one entry for each unique outcome source. */
  outcomes: ManagerOutcome[];
}
/** A structural match leaf, compatible with the existing full MatchRecord. */
export type ManagerAttributedMatch = Pick<
  MatchRecord,
  'id' | 'year' | 'kind' | 'home' | 'away' | 'score' | 'regulation' | 'shootout'
> & { managerTenure?: string };

export const managerTenureId = (club: string, serial: number) => `${club}:tenure:${serial}`;
/** JSON tuples avoid collisions in caller-supplied competition/club identifiers. */
export function managerOutcomeSourceKey(source: ManagerOutcomeSource): string {
  switch (source.kind) {
    case 'league-finish':
      return JSON.stringify([source.kind, source.year, source.country, source.tier, source.group]);
    case 'cup-title':
      return JSON.stringify([source.kind, source.year, source.competition]);
    case 'promotion':
      return JSON.stringify([source.kind, source.year, source.club]);
  }
}
export const currentManagerTenure = (facts: ManagerHistoryFacts): ManagerTenure | undefined => {
  const last = facts.tenures.at(-1);
  return last && !last.ended ? last : undefined;
};

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ref = z.string().min(1);
const year = z.number().int().min(1800).max(4000);
export const managerHistoryDateSchema = z.strictObject({ year, day: count.max(365) });
export const managerDivisionSchema = z.strictObject({ country: ref, tier: count, group: count });
export const managerOutcomeSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('league-finish'), year, ...managerDivisionSchema.shape }),
  z.strictObject({ kind: z.literal('cup-title'), year, competition: ref }),
  z.strictObject({
    kind: z.literal('promotion'),
    year,
    club: ref,
    from: managerDivisionSchema,
    to: managerDivisionSchema,
  }),
]);
const tenureSchema = z.strictObject({
  id: ref,
  manager: ref,
  person: ref.optional(),
  name: ref,
  interim: z.boolean(),
  trackedFrom: managerHistoryDateSchema,
  appointed: managerHistoryDateSchema.optional(),
  knownSince: year.optional(),
  ended: managerHistoryDateSchema.optional(),
  departure: z.enum(['replaced', 'resigned', 'retired', 'expired']).optional(),
  appointmentKey: ref,
  departureKey: ref.optional(),
});
export const managerHistoryDateKey = (date: CareerDate) => date.year * 366 + date.day;
/** Strict feature-only validator; checkpoint selection belongs to the later adapter. */
export const managerHistoryFactsSchema = z
  .strictObject({
    club: ref,
    trackedFrom: z.strictObject({ ...managerHistoryDateSchema.shape, revision: count }),
    coverage: z.enum(['founding', 'activation']),
    serial: count.min(1),
    tenures: z.array(tenureSchema).min(1),
    outcomes: z.array(
      z.strictObject({
        source: managerOutcomeSourceSchema,
        tenure: ref,
        at: managerHistoryDateSchema,
      }),
    ),
  })
  .superRefine((facts, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (facts.serial !== facts.tenures.length)
      invalid('Tenure serial must match appointment order.');
    const appointments = new Set<string>();
    facts.tenures.forEach((tenure, index) => {
      if (tenure.id !== managerTenureId(facts.club, index + 1)) invalid('Invalid tenure identity.');
      if (appointments.has(tenure.appointmentKey)) invalid('Duplicate appointment source.');
      appointments.add(tenure.appointmentKey);
      if (managerHistoryDateKey(tenure.trackedFrom) < managerHistoryDateKey(facts.trackedFrom))
        invalid('Tenure predates tracking.');
      if (
        tenure.appointed &&
        managerHistoryDateKey(tenure.appointed) > managerHistoryDateKey(tenure.trackedFrom)
      )
        invalid('Appointment follows its tracking boundary.');
      if (tenure.knownSince !== undefined && tenure.knownSince > tenure.trackedFrom.year)
        invalid('Known service year follows tracking.');
      if (
        tenure.ended &&
        managerHistoryDateKey(tenure.ended) < managerHistoryDateKey(tenure.trackedFrom)
      )
        invalid('Departure precedes tracking.');
      if ((tenure.departure || tenure.departureKey) && !tenure.ended)
        invalid('Departure details require a departure date.');
      const next = facts.tenures[index + 1];
      if (
        next &&
        (!tenure.ended ||
          managerHistoryDateKey(tenure.ended) > managerHistoryDateKey(next.trackedFrom))
      )
        invalid('Tenures overlap or are not in appointment order.');
    });
    const sources = new Set<string>();
    let lastSettlement = managerHistoryDateKey(facts.trackedFrom);
    for (const outcome of facts.outcomes) {
      const key = managerOutcomeSourceKey(outcome.source);
      if (sources.has(key)) invalid('Duplicate outcome source.');
      sources.add(key);
      const tenure = facts.tenures.find((item) => item.id === outcome.tenure);
      if (
        !tenure ||
        managerHistoryDateKey(outcome.at) < managerHistoryDateKey(tenure.trackedFrom) ||
        (tenure.ended && managerHistoryDateKey(outcome.at) > managerHistoryDateKey(tenure.ended))
      )
        invalid('Outcome is outside its responsible tenure.');
      if (managerHistoryDateKey(outcome.at) < lastSettlement)
        invalid('Outcomes are not in settlement order.');
      lastSettlement = managerHistoryDateKey(outcome.at);
      if (
        outcome.source.kind === 'promotion' &&
        (outcome.source.club !== facts.club ||
          !isManagerPromotionMove(outcome.source.from, outcome.source.to))
      )
        invalid('Promotion requires an actual upward division move for this club.');
    }
  });
