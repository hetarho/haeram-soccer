import type { FacilityPart, World } from '../../contracts/src/types';
import { SEASON_ROUNDS } from './calendar';
import { gateProjection, operatingCosts } from './finance';
import { FACILITY_PART_LABEL, facilityWork, nextWork, stadiumCapacity } from './facilities';

/** Fixed costs only: future gates, bonuses, sponsorship and other income are excluded. */
export function fixedCostRunway(cash: string, annual: string): number {
  const balance = BigInt(cash),
    cost = BigInt(annual);
  if (balance <= 0n || cost <= 0n) return 0;
  const rounds = (balance * BigInt(SEASON_ROUNDS)) / cost;
  return Number(rounds > 999n ? 999n : rounds);
}

/**
 * What starting the next work on a facility part would do (→ECON-12, ECON-32): its cost and the
 * cash and runway after it, the upkeep it adds once open, the seats before, during and after for
 * the stadium, and the days it takes. A part at its top or with a work in progress has none.
 */
export function facilityInvestmentPreview(w: World, part: FacilityPart) {
  const next = nextWork(w, part),
    working = facilityWork(w, part),
    eligible = !!next && !working,
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
    working,
    cost,
    cashAfter,
    capacityBefore: stadiumCapacity(w),
    capacityDuring:
      part === 'stadium' && next?.kind === 'expansion'
        ? stadiumCapacity({ ...w, facilityWorks: { stadium: { to: next.to, year: 0, day: 0 } } })
        : stadiumCapacity(w),
    capacityAfter: stadiumCapacity(built),
    demand: gateProjection(w).wanted,
    maintenanceBefore: before.maintenance,
    maintenanceAfter: after.maintenance,
    maintenanceIncrease: (BigInt(after.maintenance) - BigInt(before.maintenance)).toString(),
    annualBefore: before.annual,
    annualAfter: after.annual,
    runwayRounds: fixedCostRunway(cashAfter, after.annual),
    affordable,
    eligible,
    reason: working
      ? `${FACILITY_PART_LABEL[part]} 공사가 진행 중이에요 · ${working.left}일 남음`
      : !next
        ? `${FACILITY_PART_LABEL[part]}은(는) 최고 단계예요.`
        : !affordable
          ? '공사에 쓸 보유 자금이 부족합니다.'
          : `공사비를 바로 지출하고 ${next.days}일 뒤 완공되면 연간 유지비가 늘어요.`,
  };
}

/** Ticket drafts share the settlement gate model and never change the canonical ticket price. */
export function ticketInvestmentPreview(w: World, price: number) {
  if (!Number.isFinite(price) || price < 0.01 || price > 0.5)
    throw new Error('티켓 기본가격은 0.01–0.5입니다.');
  const before = gateProjection(w),
    after = gateProjection({ ...w, ticket: price });
  return {
    before,
    after,
    netLow: (BigInt(after.incomeLow) - BigInt(after.costLow)).toString(),
    netHigh: (BigInt(after.incomeHigh) - BigInt(after.costHigh)).toString(),
  };
}
