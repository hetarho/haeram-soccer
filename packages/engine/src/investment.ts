import type { FacilityPart, World } from '../../contracts/src/types';
import { SEASON_ROUNDS } from './calendar';
import { operatingCosts } from './finance';
import { facilityWork, nextWork, stadiumCapacity } from './facilities';

/** Fixed costs only: future gates, bonuses, sponsorship and other income are excluded. */
export function fixedCostRunway(cash: string, annual: string): number {
  const balance = BigInt(cash),
    cost = BigInt(annual);
  if (balance <= 0n || cost <= 0n) return 0;
  const rounds = (balance * BigInt(SEASON_ROUNDS)) / cost;
  return Number(rounds > 999n ? 999n : rounds);
}

/**
 * What starting the next work on a facility part would do (→ECON-32): its cost and the cash and
 * runway after it, the upkeep it adds once open, the seats before, during and after for the
 * stadium, and the days it takes. A part at its top or with a work in progress cannot start
 * another work. The owner's investment screen uses this preview before confirming construction.
 */
export function facilityInvestmentPreview(w: World, part: FacilityPart) {
  const next = nextWork(w, part),
    eligible = !!next && !facilityWork(w, part),
    cost = eligible ? next.cost : '0',
    built: World = next
      ? {
          ...w,
          ...(part === 'stadium'
            ? { stadium: next.to }
            : part === 'training'
              ? { trainingGround: next.to }
              : { academyFacility: next.to }),
          facilityWorks: undefined,
        }
      : w,
    before = operatingCosts(w),
    after = operatingCosts(built),
    cashAfter = (BigInt(w.cash) - BigInt(cost)).toString(),
    affordable = BigInt(w.cash) >= BigInt(cost);
  return {
    part,
    next,
    cost,
    cashAfter,
    capacityBefore: stadiumCapacity(w),
    capacityDuring:
      part === 'stadium' && next?.kind === 'expansion'
        ? stadiumCapacity({ ...w, facilityWorks: { stadium: { to: next.to, year: 0, day: 0 } } })
        : stadiumCapacity(w),
    capacityAfter: stadiumCapacity(built),
    maintenanceAfter: after.maintenance,
    maintenanceIncrease: (BigInt(after.maintenance) - BigInt(before.maintenance)).toString(),
    annualBefore: before.annual,
    annualAfter: after.annual,
    runwayRounds: fixedCostRunway(cashAfter, after.annual),
    affordable,
    eligible,
  };
}
