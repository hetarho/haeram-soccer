import {
  currentManagerTenure,
  managerHistoryDateKey as dateKey,
  managerHistoryDateSchema,
  managerHistoryFactsSchema,
  managerOutcomeSourceKey,
  managerOutcomeSourceSchema,
  managerTenureId,
  type ManagerAttributedMatch,
  type ManagerDeparture,
  type ManagerHistoryFacts,
  type ManagerHistoryIdentity,
  type ManagerOutcomeSource,
  type ManagerTenure,
} from '../../contracts/src/manager-history';
import type { CareerDate } from '../../contracts/src/types';

const copyDate = (date: CareerDate): CareerDate => ({ year: date.year, day: date.day });
function assertDate(at: CareerDate, from: CareerDate) {
  managerHistoryDateSchema.parse(at);
  if (dateKey(at) < dateKey(from)) throw new Error('Manager-history operation predates tracking.');
}
function newTenure(
  club: string,
  serial: number,
  manager: ManagerHistoryIdentity,
  at: CareerDate,
  appointmentKey: string,
  appointed?: CareerDate,
): ManagerTenure {
  return {
    id: managerTenureId(club, serial),
    manager: manager.id,
    ...(manager.person ? { person: manager.person } : {}),
    name: manager.name,
    interim: manager.interim,
    trackedFrom: copyDate(at),
    ...(appointed ? { appointed: copyDate(appointed) } : {}),
    ...(manager.since !== undefined ? { knownSince: manager.since } : {}),
    appointmentKey,
  };
}
export interface CreateManagerHistoryInput {
  club: string;
  at: CareerDate & { revision: number };
  coverage: 'founding' | 'activation';
  manager: ManagerHistoryIdentity;
  /** Only supply this if the exact appointment was actually recorded. */
  appointed?: CareerDate;
}
export function createManagerHistoryFacts(input: CreateManagerHistoryInput): ManagerHistoryFacts {
  const appointed = input.appointed ?? (input.coverage === 'founding' ? input.at : undefined);
  return managerHistoryFactsSchema.parse({
    club: input.club,
    trackedFrom: { ...copyDate(input.at), revision: input.at.revision },
    coverage: input.coverage,
    serial: 1,
    tenures: [newTenure(input.club, 1, input.manager, input.at, 'tracking-start', appointed)],
    outcomes: [],
  });
}
export type ManagerTenureChange =
  | { kind: 'renewal'; manager: string; at: CareerDate }
  | { kind: 'tactics'; manager: string; at: CareerDate }
  | {
      kind: 'appointment';
      key: string;
      at: CareerDate;
      manager: ManagerHistoryIdentity;
      departure?: ManagerDeparture;
    }
  | { kind: 'departure'; key: string; at: CareerDate; departure: ManagerDeparture };

/** Returns new facts; the input facts and any caller-owned identity/date stay untouched. */
export function recordManagerTenureChange(
  facts: ManagerHistoryFacts,
  change: ManagerTenureChange,
): ManagerHistoryFacts {
  if (change.kind === 'renewal' || change.kind === 'tactics') {
    const current = currentManagerTenure(facts);
    if (!current || current.manager !== change.manager)
      throw new Error('A renewal or tactic change requires the current manager.');
    assertDate(change.at, current.trackedFrom);
    return facts;
  }
  if (!change.key || change.key === 'tracking-start')
    throw new Error('A unique change key is required.');
  if (
    facts.tenures.some((tenure) =>
      change.kind === 'appointment'
        ? tenure.appointmentKey === change.key
        : tenure.departureKey === change.key,
    )
  )
    return facts;
  const last = facts.tenures.at(-1)!;
  assertDate(change.at, last.ended ?? last.trackedFrom);
  const latestOutcome = facts.outcomes.at(-1);
  if (latestOutcome) assertDate(change.at, latestOutcome.at);
  const current = currentManagerTenure(facts);
  if (change.kind === 'departure' && !current)
    throw new Error('There is no open manager tenure to close.');
  const tenures = facts.tenures.map((tenure) =>
    tenure === current
      ? {
          ...tenure,
          ended: copyDate(change.at),
          departure: change.departure ?? 'replaced',
          departureKey: change.key,
        }
      : tenure,
  );
  const serial = facts.serial + (change.kind === 'appointment' ? 1 : 0);
  if (change.kind === 'appointment')
    tenures.push(newTenure(facts.club, serial, change.manager, change.at, change.key, change.at));
  return managerHistoryFactsSchema.parse({ ...facts, serial, tenures });
}

/** Freeze a newly settled own match; an existing attribution is never reassigned on retry. */
export function attributeManagerMatch<T extends ManagerAttributedMatch>(
  facts: ManagerHistoryFacts,
  match: T,
  context: { at: CareerDate },
): T & { managerTenure?: string } {
  if (match.home !== facts.club && match.away !== facts.club) return match;
  if (match.managerTenure !== undefined) return match;
  assertDate(context.at, facts.trackedFrom);
  if (context.at.year !== match.year) throw new Error('Match settlement season does not match.');
  const current = currentManagerTenure(facts);
  if (!current) return match;
  assertDate(context.at, current.trackedFrom);
  return { ...match, managerTenure: current.id };
}

/** Freeze the responsible current tenure at settlement, independently of future appointments. */
export function attributeManagerOutcome(
  facts: ManagerHistoryFacts,
  source: ManagerOutcomeSource,
  context: { at: CareerDate },
): ManagerHistoryFacts {
  managerOutcomeSourceSchema.parse(source);
  const key = managerOutcomeSourceKey(source);
  if (facts.outcomes.some((outcome) => managerOutcomeSourceKey(outcome.source) === key))
    return facts;
  assertDate(context.at, facts.outcomes.at(-1)?.at ?? facts.trackedFrom);
  const current = currentManagerTenure(facts);
  if (!current) return facts;
  assertDate(context.at, current.trackedFrom);
  return managerHistoryFactsSchema.parse({
    ...facts,
    outcomes: [...facts.outcomes, { source, tenure: current.id, at: copyDate(context.at) }],
  });
}
