import type {
  BudgetResponsibility,
  FacilityPart,
  PolicyKey,
  PolicyLevel,
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
import { departmentEffects, staffEffects } from '../../../../packages/engine/src/staff';
import { delegatePlan, planRevenue } from '../../../../packages/engine/src/delegation';
import { clubBudgets, ownerSeasonFlows } from '../../../../packages/engine/src/club-budget';
import {
  BUDGET_RESPONSIBILITIES,
  SPEND_REQUESTS,
} from '../../../../packages/engine/src/delegation-info';
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
import { effectLedger } from '../../../../packages/engine/src/effect-ledger';
import { activeTrainingFocus, trainingFocusInfo } from '../../../../packages/engine/src/training';
import {
  SCOUT_CONFIG,
  SCOUT_HOME_LABEL,
  scoutReach,
} from '../../../../packages/engine/src/scout-search';

/** Quoted costs and current effects are computed on the worker, then sent as ordinary view data. */
export function officeRead(w: World) {
  const policy = policyOf(w),
    effects = policyEffects(policy),
    build = buildEffects(w);
  const costs = operatingCosts(w),
    revenue = planRevenue(w);
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
  return {
    costs,
    policyCosts,
    /** Every effect in force with its factors (→WEB-116), and the focus name no UI leaf holds. */
    effects: { ...effectLedger(w), focus: trainingFocusInfo[activeTrainingFocus(w)].label },
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
    /** What the youth director's training adds on his own (→WEB-116): his effect, not his pay. */
    youthCoach: departmentEffects(w, 'youth'),
    academy: {
      growth: academyGrowth(w),
      intake: academyIntakeSize(w),
      potential: academyPotentialBonus(w),
      limit: ACADEMY_LIMIT,
    },
    synergy: synergyEffects(w),
    scout: (() => {
      const reach = scoutReach(w);
      return { ...reach, homeLabel: SCOUT_HOME_LABEL[reach.home], youngAge: SCOUT_CONFIG.youngAge };
    })(),
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
    /** The club's books season by season (→`clubBudgets`), read from the whole ledger. */
    budgets: clubBudgets(w),
    /** The owner's money this season so far (→`ownerSeasonFlows`). */
    ownerFlows: ownerSeasonFlows(w),
    /**
     * Each spending responsibility's plan now and, per request, the plan the 단장 would make if
     * asked that (→`delegation.ts`), so the delegation page previews a request before it is sent.
     * All rest on the season's income he plans on (→`planRevenue`).
     */
    delegation: Object.fromEntries(
      BUDGET_RESPONSIBILITIES.map((key) => [
        key,
        {
          plan: delegatePlan(w, key, undefined, revenue),
          previews: SPEND_REQUESTS.map((level) => delegatePlan(w, key, level, revenue)),
        },
      ]),
    ) as Record<
      BudgetResponsibility,
      { plan: ReturnType<typeof delegatePlan>; previews: ReturnType<typeof delegatePlan>[] }
    >,
  };
}
export type OfficeRead = ReturnType<typeof officeRead>;
