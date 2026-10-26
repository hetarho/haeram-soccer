import { describe, expect, it } from 'vitest';
import * as construction from './facilities';
import {
  ACADEMY_FACILITY,
  academyFacilityTerms,
  facilityBuiltUnits,
  facilityUpkeepUnits,
  partCostUnits,
  partLevel,
  partTop,
  STADIUM_STEPS,
  stadiumCapacity,
  stadiumStep,
  TRAINING_GROUND,
  trainingGroundBase,
} from './facility-model';

/** A founded club's completed facts, before any work. */
const founded = { stadium: 0, trainingGround: 0, academyFacility: 0 };
const working = (stadium: number, to: number) => ({
  stadium,
  facilityWorks: { stadium: { to, year: 1950, day: 0 } },
});

describe('completed facility facts (→ECON-32)', () => {
  it('limits the stadium to eight steps and the other parts to five levels', () => {
    expect(partTop('stadium')).toBe(8);
    expect(partTop('training')).toBe(5);
    expect(partTop('academy')).toBe(5);
    expect(STADIUM_STEPS).toHaveLength(9);
    expect(TRAINING_GROUND).toHaveLength(6);
    expect(ACADEMY_FACILITY).toHaveLength(6);
    const w = { stadium: 3, trainingGround: 1, academyFacility: 4 };
    expect([partLevel(w, 'stadium'), partLevel(w, 'training'), partLevel(w, 'academy')]).toEqual([
      3, 1, 4,
    ]);
  });

  it('gives a founded club the base ground, no development base and the base academy', () => {
    expect(stadiumStep(founded)).toMatchObject({ name: '동네 구장', capacity: 2500 });
    expect(stadiumCapacity(founded)).toBe(2500);
    expect(trainingGroundBase(founded)).toBe(0);
    expect(academyFacilityTerms(founded)).toMatchObject({ intake: 0, potential: 0, growth: 1 });
    expect(facilityUpkeepUnits(founded)).toBe(180);
    expect(facilityBuiltUnits(founded)).toBe(0);
  });

  it('closes a tenth of the built ground during an expansion, none during a rebuild', () => {
    expect(stadiumCapacity(working(0, 1))).toBe(2250);
    expect(stadiumCapacity(working(1, 2))).toBe(5000);
    expect(stadiumCapacity(working(4, 5))).toBe(27000);
    expect(stadiumCapacity(working(5, 6))).toBe(40000);
    expect(stadiumCapacity(working(7, 8))).toBe(67500);
    // Training and academy works leave every seat open.
    expect(
      stadiumCapacity({
        stadium: 2,
        facilityWorks: { training: { to: 1, year: 1950, day: 0 } },
      }),
    ).toBe(10000);
  });

  it('reads the training base and academy terms of each completed level', () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((trainingGround) => trainingGroundBase({ trainingGround })),
    ).toEqual([0, 0.06, 0.2, 0.37, 0.53, 0.75]);
    expect(academyFacilityTerms({ academyFacility: 2 })).toEqual({
      cost: 4800,
      intake: 1,
      potential: 2,
      growth: 1.12,
    });
    expect(academyFacilityTerms({ academyFacility: 5 })).toMatchObject({
      potential: 4,
      growth: 1.5,
    });
  });

  it('prices built steps and upkeep in football-index units', () => {
    expect([
      partCostUnits('stadium', 2),
      partCostUnits('training', 2),
      partCostUnits('academy', 2),
    ]).toEqual([1500, 6000, 4800]);
    const w = { stadium: 2, trainingGround: 1, academyFacility: 2 };
    expect(facilityUpkeepUnits(w)).toBe(411.25);
    expect(facilityBuiltUnits(w)).toBe(9600);
    const top = { stadium: 8, trainingGround: 5, academyFacility: 5 };
    expect(facilityUpkeepUnits(top)).toBe(4411.25);
    expect(facilityBuiltUnits(top)).toBe(1530450);
  });

  it('is the one owner that construction re-exports', () => {
    expect(construction.STADIUM_STEPS).toBe(STADIUM_STEPS);
    expect(construction.stadiumCapacity).toBe(stadiumCapacity);
    expect(construction.partTop).toBe(partTop);
    expect(construction.facilityBuiltUnits).toBe(facilityBuiltUnits);
  });
});
