import { describe, expect, it } from 'vitest';
import {
  managerHistoryFactsSchema,
  managerOutcomeSourceKey,
  managerTenureId,
  type ManagerHistoryFacts,
} from './manager-history';

/** Synthetic contract facts, without a generated world. */
function facts(): ManagerHistoryFacts {
  return {
    club: 'our-club',
    trackedFrom: { year: 2030, day: 50, revision: 17 },
    coverage: 'activation',
    serial: 1,
    tenures: [
      {
        id: managerTenureId('our-club', 1),
        manager: 'manager-a',
        person: 'person-a',
        name: 'Synthetic Manager',
        interim: false,
        trackedFrom: { year: 2030, day: 50 },
        knownSince: 2028,
        appointmentKey: 'tracking-start',
      },
    ],
    outcomes: [],
  };
}
describe('isolated manager-history fact contracts', () => {
  it('preserves exact tracking and an earlier known service year without inventing an appointment', () => {
    const parsed = managerHistoryFactsSchema.parse(facts());
    expect(parsed.tenures[0]).toMatchObject({
      knownSince: 2028,
      person: 'person-a',
      trackedFrom: { year: 2030, day: 50 },
    });
    expect(parsed.tenures[0].appointed).toBeUndefined();
    expect(parsed.trackedFrom.revision).toBe(17);
    expect(parsed).toEqual(facts());
  });

  it('refuses unknown feature fields, invalid tenure IDs and serials, or overlapping tenures', () => {
    expect(managerHistoryFactsSchema.safeParse({ ...facts(), future: 1 }).success).toBe(false);
    const wrongId = facts();
    wrongId.tenures[0].id = 'a-name-instead-of-an-id';
    expect(managerHistoryFactsSchema.safeParse(wrongId).success).toBe(false);
    expect(managerHistoryFactsSchema.safeParse({ ...facts(), serial: 2 }).success).toBe(false);
    const overlap = facts();
    overlap.serial = 2;
    overlap.tenures.push({
      ...overlap.tenures[0],
      id: managerTenureId(overlap.club, 2),
      appointmentKey: 'second-appointment',
    });
    expect(managerHistoryFactsSchema.safeParse(overlap).success).toBe(false);
    overlap.tenures[0].ended = { year: 2030, day: 50 };
    expect(managerHistoryFactsSchema.safeParse(overlap).success).toBe(true);
  });

  it('refuses duplicate outcome keys, unknown tenure references and outcomes before tracking', () => {
    const value = facts();
    value.outcomes.push({
      source: { kind: 'cup-title', year: 2030, competition: 'cup:ENG' },
      tenure: value.tenures[0].id,
      at: { year: 2030, day: 200 },
    });
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(true);
    const repeated = structuredClone(value);
    repeated.outcomes.push(structuredClone(repeated.outcomes[0]));
    expect(managerHistoryFactsSchema.safeParse(repeated).success).toBe(false);
    value.outcomes[0].tenure = 'unknown';
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(false);
    value.outcomes[0].tenure = value.tenures[0].id;
    value.outcomes[0].at.day = 49;
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(false);
  });

  it('requires promotion to move this club upward within its country', () => {
    const value = facts();
    value.outcomes.push({
      source: {
        kind: 'promotion',
        year: 2030,
        club: value.club,
        from: { country: 'ENG', tier: 2, group: 0 },
        to: { country: 'ENG', tier: 2, group: 1 },
      },
      tenure: value.tenures[0].id,
      at: { year: 2030, day: 300 },
    });
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(false);
    const source = value.outcomes[0].source;
    if (source.kind !== 'promotion') throw new Error('Synthetic promotion expected.');
    source.to.tier = 1;
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(true);
    source.club = 'other-club';
    expect(managerHistoryFactsSchema.safeParse(value).success).toBe(false);
  });

  it('keys sources by their actual scope without delimiter collisions or duplicated promotion credit', () => {
    expect(
      managerOutcomeSourceKey({ kind: 'cup-title', year: 2030, competition: 'cup:ENG' }),
    ).not.toBe(managerOutcomeSourceKey({ kind: 'cup-title', year: 2030, competition: 'cup:ESP' }));
    expect(
      managerOutcomeSourceKey({
        kind: 'league-finish',
        year: 2030,
        country: 'ENG',
        tier: 1,
        group: 0,
      }),
    ).not.toBe(
      managerOutcomeSourceKey({
        kind: 'league-finish',
        year: 2030,
        country: 'ENG',
        tier: 0,
        group: 0,
      }),
    );
    const base = {
      kind: 'promotion' as const,
      year: 2030,
      club: 'our:club',
      from: { country: 'ENG', tier: 2, group: 0 },
    };
    expect(managerOutcomeSourceKey({ ...base, to: { country: 'ENG', tier: 1, group: 0 } })).toBe(
      managerOutcomeSourceKey({ ...base, to: { country: 'ENG', tier: 1, group: 1 } }),
    );
  });
});
