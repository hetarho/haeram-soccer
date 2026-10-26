import { describe, expect, it } from 'vitest';
import { FACILITY_KINDS } from './contracts';
import { facilityStage, facilityStageTop } from './facilityImages';

describe('facility artwork stages', () => {
  it('bounds each kind by its completed-facility ladder', () => {
    expect(
      Object.fromEntries(FACILITY_KINDS.map((kind) => [kind, facilityStageTop(kind)])),
    ).toEqual({ stadium: 8, locker: 8, training: 5, manager: 0, staff: 0, academy: 5 });
  });

  it('selects completed facts and ignores construction targets', () => {
    const w = {
      stadium: 1,
      trainingGround: 2,
      academyFacility: 2,
      facilityWorks: {
        stadium: { to: 2, year: 1950, day: 0 },
        training: { to: 3, year: 1950, day: 0 },
        academy: { to: 3, year: 1950, day: 0 },
      },
    };
    expect(
      Object.fromEntries(FACILITY_KINDS.map((kind) => [kind, facilityStage(kind, w)])),
    ).toEqual({ stadium: 1, locker: 1, training: 2, manager: 0, staff: 0, academy: 2 });
  });
});
