import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { CareerEmployment, World } from '../../contracts/src/types';
import { roundTrip } from '../../../tests/fixtures/save-roundtrip';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
import { historyWorld } from './history';
import { careerDate, compareCareerDates, isCoachingRole } from './person-careers';
import { closeSeason } from './season';
import { toLastRound } from './season.testkit';
import { takeOver } from './takeover';

function forbiddenEmploymentOverlaps(w: World) {
  const today = careerDate(w),
    overlaps: { person: string; jobs: CareerEmployment[] }[] = [];
  for (const person of Object.values(w.people ?? {}))
    for (let a = 0; a < person.employment.length; a++)
      for (let b = a + 1; b < person.employment.length; b++) {
        const left = person.employment[a],
          right = person.employment[b],
          from = compareCareerDates(left.from, right.from) > 0 ? left.from : right.from,
          leftEnd = left.to ?? today,
          rightEnd = right.to ?? today,
          to = compareCareerDates(leftEnd, rightEnd) < 0 ? leftEnd : rightEnd,
          playingCoach =
            left.club === right.club &&
            ((left.role === 'player' && isCoachingRole(right.role)) ||
              (right.role === 'player' && isCoachingRole(left.role)));
        if (compareCareerDates(from, to) < 0 && !playingCoach)
          overlaps.push({ person: person.id, jobs: [left, right] });
      }
  return overlaps;
}

describe('wartime employment at the season close', () => {
  for (const owned of [false, true]) {
    it(`preserves career facts through the ${owned ? 'owned' : 'ownerless'} crossing and checkpoint`, async () => {
      const w = cachedWorld(`wartime-employment-1938-${owned}`, () =>
        toLastRound(
          owned
            ? careerWorld({ seed: 'wartime-employment-owned', year: 1938, cash: '1000000000000' })
            : historyWorld('wartime-employment-ownerless', undefined, 1938),
        ),
      );
      expect(forbiddenEmploymentOverlaps(w)).toEqual([]);
      closeSeason(w);
      expect(w.year).toBe(1946);
      expect(forbiddenEmploymentOverlaps(w)).toEqual([]);
      if (!owned) takeOver(w, 'ENG:3:0:0', { tier: 'oil', traits: [] });
      expect(forbiddenEmploymentOverlaps(w)).toEqual([]);
      validateWorld(w);
      expect(canonical(roundTrip(w))).toBe(canonical(w));
    });
  }
});
