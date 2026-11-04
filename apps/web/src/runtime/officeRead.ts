import type {
  FacilityPart,
  PolicyKey,
  PolicyLevel,
  WageResponsibility,
  World,
} from '../../../../packages/contracts/src/types';
import {
  POLICY_INFO,
  POLICY_KEYS,
  marketingFanGain,
  policyEffects,
  policyOf,
} from '../../../../packages/engine/src/policy';
import { operatingCosts, gateProjection } from '../../../../packages/engine/src/finance';
import { facilityInvestmentPreview } from '../../../../packages/engine/src/investment';
import {
  academyGrowth,
  academyIntakeSize,
  academyPotentialBonus,
  ACADEMY_LIMIT,
} from '../../../../packages/engine/src/academy';
import { coachWage, staffEffects, staffQuote } from '../../../../packages/engine/src/staff';
import { marketWage } from '../../../../packages/engine/src/market-prices';
import { synergyEffects } from '../../../../packages/engine/src/synergy';
import { baseEffects, tourTerms } from '../../../../packages/engine/src/bases';
import { localSupporters } from '../../../../packages/engine/src/fans';
import { moraleBaseline } from '../../../../packages/engine/src/morale';
import { exclusiveSponsor, EXCLUSIVE_MARKETING } from '../../../../packages/engine/src/sponsors';
import {
  managerCriteriaOf,
  coachCriteriaOf,
  talkRuleOf,
} from '../../../../packages/engine/src/hiring';
import { buildEffects } from '../../../../packages/engine/src/build';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { TICKET_LEVELS } from '../../../../packages/engine/src/tickets';

/** Quoted costs and current effects are computed on the worker, then sent as ordinary view data. */
export function officeRead(w: World) {
  const policy = policyOf(w),
    effects = policyEffects(policy),
    build = buildEffects(w);
  const costs = operatingCosts(w);
  const policyCosts = Object.fromEntries(
    POLICY_KEYS.map((key) => [
      key,
      Object.fromEntries(
        POLICY_INFO[key].levels.map(({ level }) => [
          level,
          operatingCosts({ ...w, policy: { ...policy, [key]: level } }),
        ]),
      ),
    ]),
  ) as Record<PolicyKey, Partial<Record<PolicyLevel, ReturnType<typeof operatingCosts>>>>;
  const reference = (responsibility: WageResponsibility) => {
    if (responsibility === 'manager') return staffQuote(w, 200);
    if (responsibility === 'staff') return coachWage(w, 70);
    const people =
      responsibility === 'academy'
        ? (w.academy?.players ?? [])
        : w.players.filter((player) => player.status === 'active');
    const sum = people.reduce(
      (sum, player) =>
        sum + BigInt(responsibility === 'academy' ? marketWage(w, player) : player.wage),
      0n,
    );
    return sum > 0n ? (sum / BigInt(people.length)).toString() : staffQuote(w, 60);
  };
  return {
    costs,
    policyCosts,
    facilities: Object.fromEntries(
      (['training', 'academy', 'stadium'] as const).map((part) => [
        part,
        facilityInvestmentPreview(w, part),
      ]),
    ) as Record<FacilityPart, ReturnType<typeof facilityInvestmentPreview>>,
    gate: gateProjection(w),
    ticketGates: Object.fromEntries(
      [...new Set([w.ticket, ...TICKET_LEVELS.map((level) => level.price)])].map((ticket) => [
        String(ticket),
        gateProjection({ ...w, ticket }),
      ]),
    ),
    staff: staffEffects(w),
    academy: {
      growth: academyGrowth(w),
      intake: academyIntakeSize(w),
      potential: academyPotentialBonus(w),
      limit: ACADEMY_LIMIT,
    },
    synergy: synergyEffects(w),
    bases: baseEffects(w),
    localSupporters: localSupporters(w),
    moraleBaseline: moraleBaseline(w),
    tour: tourTerms(w, effects.tour),
    marketingFans: marketingFanGain(
      clubOf(w).fans,
      effects.fanGrowth * build.marketingFans * (exclusiveSponsor(w) ? EXCLUSIVE_MARKETING : 1),
    ),
    managerCriteria: managerCriteriaOf(w),
    coachCriteria: coachCriteriaOf(w),
    talkRule: talkRuleOf(w),
    wageReference: Object.fromEntries(
      (['manager', 'staff', 'contracts', 'recruitment', 'academy'] as const).map((key) => [
        key,
        reference(key),
      ]),
    ) as Record<WageResponsibility, string>,
  };
}
export type OfficeRead = ReturnType<typeof officeRead>;
