import type { World } from '../../contracts/src/types';
import { SEASON_ROUNDS } from './calendar';
import { gateProjection, operatingCosts } from './finance';
import { clubOf, quote } from './world';

/** Fixed costs only: future gates, bonuses, sponsorship and other income are excluded. */
export function fixedCostRunway(cash: string, annual: string): number {
  const balance = BigInt(cash),
    cost = BigInt(annual);
  if (balance <= 0n || cost <= 0n) return 0;
  const rounds = (balance * BigInt(SEASON_ROUNDS)) / cost;
  return Number(rounds > 999n ? 999n : rounds);
}

/** Hypothetical cost/read model; capped facilities have no further spend or improvement. */
export function facilityInvestmentPreview(w: World) {
  const eligible = w.facilities < 30,
    cost = eligible ? quote(clubOf(w).country, w.year, 200 * (w.facilities + 1) ** 1.5) : '0',
    facilitiesAfter = eligible ? w.facilities + 1 : w.facilities,
    draft = { ...w, facilities: facilitiesAfter },
    before = operatingCosts(w),
    after = operatingCosts(draft),
    cashAfter = (BigInt(w.cash) - BigInt(cost)).toString(),
    affordable = BigInt(w.cash) >= BigInt(cost);
  return {
    cost,
    cashAfter,
    facilitiesBefore: w.facilities,
    facilitiesAfter,
    capacityBefore: gateProjection(w).capacity,
    capacityAfter: gateProjection(draft).capacity,
    maintenanceBefore: before.maintenance,
    maintenanceAfter: after.maintenance,
    maintenanceIncrease: (BigInt(after.maintenance) - BigInt(before.maintenance)).toString(),
    annualBefore: before.annual,
    annualAfter: after.annual,
    nextRoundBefore: before.nextRound,
    nextRoundAfter: after.nextRound,
    runwayRounds: fixedCostRunway(cashAfter, after.annual),
    affordable,
    eligible,
    reason: !eligible
      ? '시설은 최대 30단계입니다.'
      : !affordable
        ? '시설 확장에 쓸 보유 자금이 부족합니다.'
        : '확장 비용을 즉시 지출하며 연간 유지비가 늘어납니다.',
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
