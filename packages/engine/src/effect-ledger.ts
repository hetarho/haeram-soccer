/**
 * The owner office's effects in force (→WEB-116): every value the club's choices move, read as the
 * engine applies it, with the factors that make it and where each factor comes from. The office
 * lists the values, opens one into its factors and sends the owner to the control behind a factor;
 * an investment area reads its own controls' share from the same factors. A pure read: it changes
 * nothing.
 */
import { BUILD_SLOTS, type BuildSlot } from '../../contracts/src/build';
import type {
  DirectionKey,
  FacilityPart,
  OwnerTrait,
  PolicyKey,
  StaffRole,
  World,
} from '../../contracts/src/types';
import { ACADEMY_INTAKE, academyGrowth, academyIntakeSize, academyPotentialBonus } from './academy';
import { baseEffects } from './bases';
import {
  BUILD_CARDS,
  EARLY_DEBUT,
  buildEffects,
  buildOf,
  cardOf,
  type BuildCard,
  type BuildEffects,
} from './build';
import { TALK_CONFIG } from './contracts';
import {
  FACILITY_PARTS,
  academyFacilityTerms,
  partUpkeepUnits,
  trainingGroundTerms,
} from './facility-model';
import { gateProjection, operatingCosts, scaleOperatingExpenses } from './finance';
import {
  MORALE_BASELINE_BOUNDS,
  MORALE_START,
  moraleBaseline,
  moraleBaselineTerms,
  moraleOf,
  moraleStrength,
} from './morale';
import { OWNER_TRAITS } from './owner-config';
import {
  askedFeeFactor,
  hasTrait,
  intakePotential,
  sponsorFactor,
  talismanStrength,
  wageDemandFactor,
} from './owner-traits';
import { clubOf } from './player-state';
import { POLICY_DEFAULTS, marketingFanGain, policyEffects, policyOf } from './policy';
import { clamp } from './primitives';
import { EXCLUSIVE_MARKETING, exclusiveSponsor } from './sponsors';
import { DEPARTMENT_ATTRIBUTES, YOUTH_DEVELOPER, departmentEffects, staffEffects } from './staff';
import { staffMember } from './staff-info';
import { managerStyleEffects } from './styles';
import { synergyEffects, synergyStates, type SynergyEffects, type SynergyState } from './synergy';
import { activeTrainingFocus, developmentBase, trainingFocusInfo } from './training';

/** The office's groups, in the order it lists them. */
export const EFFECT_GROUPS = ['squad', 'academy', 'market', 'fans', 'money'] as const;
export type EffectGroup = (typeof EFFECT_GROUPS)[number];
export type EffectId =
  | 'growth'
  | 'youthGrowth'
  | 'skills'
  | 'recovery'
  | 'morale'
  | 'goodwill'
  | 'strength'
  | 'academyGrowth'
  | 'intake'
  | 'intakeAbility'
  | 'intakePotential'
  | 'candidates'
  | 'candidatePotential'
  | 'candidateAbility'
  | 'transferFee'
  | 'bidAcceptance'
  | 'wage'
  | 'incomingBids'
  | 'saleFee'
  | 'attendance'
  | 'winFans'
  | 'marketingFans'
  | 'localBase'
  | 'localBaseRate'
  | 'globalReach'
  | 'localSponsor'
  | 'globalSponsor'
  | 'annualCosts';
/**
 * How a value reads: a multiplier, points added, percent (points), a count, a 0–100 score, money a
 * year, or a range of multipliers one per department.
 */
export type EffectUnit = 'times' | 'plus' | 'percent' | 'count' | 'score' | 'money' | 'range';
/** What the owner reads but sets nowhere directly: a standard start, the squad, the club's name. */
export type EffectFact =
  | 'standard'
  | 'focus'
  | 'leaders'
  | 'morale'
  | 'form'
  | 'reputation'
  | 'supporters'
  | 'fans'
  | 'wages'
  | 'loan'
  | 'sponsor';
/** Where a factor comes from: the control that sets it, or a fact the office only reads. */
export type EffectSource =
  | { kind: 'policy'; key: PolicyKey }
  | { kind: 'build'; slot: BuildSlot }
  | { kind: 'direction'; key: DirectionKey }
  | { kind: 'facility'; part: FacilityPart }
  | { kind: 'ticket' }
  /** A coaching department, or every coach's wages together. */
  | { kind: 'staff'; role?: StaffRole }
  | { kind: 'manager'; term: 'style' | 'ability' | 'youth' | 'trust' | 'wage' }
  | { kind: 'synergy'; id: string }
  | { kind: 'owner'; trait: OwnerTrait }
  | { kind: 'base'; which: 'local' | 'global' }
  | { kind: 'fact'; term: EffectFact };
export interface EffectFactor {
  source: EffectSource;
  /** Its share in the effect's unit (or its own `unit`): 1 or 0 when the control sets nothing. */
  value: number;
  /** Money factors: the amount a year, in the club's currency. */
  amount?: string;
  /** A factor read in its own unit, where the effect is no product or sum of its factors. */
  unit?: EffectUnit;
  /** Applies to OVR 70+ players or home matches only, so the value leaves it out. */
  only?: 'star' | 'home';
}
export interface LedgerEffect {
  id: EffectId;
  group: EffectGroup;
  unit: EffectUnit;
  /** How the factors combine into the value; `none` where caps and floors decide it. */
  op: 'times' | 'plus' | 'none';
  /** The value in force as the engine applies it; money effects read `amount` instead. */
  value: number;
  amount?: string;
  /** A base's level now, beside the target `value` it moves toward. */
  current?: number;
  /** The engine keeps the combined value within these bounds. */
  bounds?: readonly [number, number];
  factors: EffectFactor[];
}
export interface EffectLedger {
  effects: LedgerEffect[];
  /** Every synergy with its conditions, for the factors that name one. */
  synergies: SynergyState[];
}

type Op = 'times' | 'plus';
const neutral = (op: Op) => (op === 'times' ? 1 : 0);
const policy = (key: PolicyKey): EffectSource => ({ kind: 'policy', key });
const fact = (term: EffectFact): EffectSource => ({ kind: 'fact', term });
const manager = (term: Extract<EffectSource, { kind: 'manager' }>['term']): EffectSource => ({
  kind: 'manager',
  term,
});

/** Every build slot one of whose cards moves `key`, with the card in force. */
function buildFactors(w: World, key: keyof BuildEffects, op: Op): EffectFactor[] {
  const build = buildOf(w);
  return BUILD_SLOTS.filter((slot) =>
    Object.values(BUILD_CARDS[slot] as Record<string, BuildCard>).some(
      (card) => card.effects[key] !== undefined,
    ),
  ).map((slot) => ({
    source: { kind: 'build', slot },
    value: cardOf(build, slot).effects[key] ?? neutral(op),
  }));
}
/** Every synergy that moves `key`, adding its bonus only while active. */
function synergyFactors(states: SynergyState[], key: keyof SynergyEffects, op: Op): EffectFactor[] {
  return states
    .filter((state) => state.effects[key] !== undefined)
    .map((state) => ({
      source: { kind: 'synergy', id: state.id },
      value: state.active ? state.effects[key]! : neutral(op),
    }));
}
/** An owner trait's factor, only for an owner who took it. */
function traitFactor(w: World, trait: OwnerTrait, value: number): EffectFactor[] {
  return hasTrait(w, trait) ? [{ source: { kind: 'owner', trait }, value }] : [];
}
/** Splits `total` by `weights`, the remainder to the last weighted part, so the parts add up. */
function shares(total: string, weights: readonly number[]): string[] {
  const all = BigInt(total),
    scaled = weights.map((weight) => BigInt(Math.round(weight * 1000))),
    sum = scaled.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return weights.map(() => '0');
  const parts = scaled.map((weight) => (all * weight) / sum);
  let last = scaled.length - 1;
  while (scaled[last] === 0n) last--;
  parts[last] += all - parts.reduce((a, b) => a + b, 0n);
  return parts.map(String);
}

export function effectLedger(w: World): EffectLedger {
  const club = clubOf(w),
    levels = policyOf(w),
    terms = policyEffects(levels),
    // One row's effects alone: each row moves its own fields, so these read its share.
    only = (key: PolicyKey) => policyEffects({ ...POLICY_DEFAULTS, [key]: levels[key] }),
    build = buildEffects(w),
    staff = staffEffects(w),
    style = managerStyleEffects(w),
    synergy = synergyEffects(w),
    synergies = synergyStates(w),
    bases = baseEffects(w),
    ground = trainingGroundTerms(w),
    academyFacility = academyFacilityTerms(w),
    focus = trainingFocusInfo[activeTrainingFocus(w)],
    department = (role: StaffRole) => departmentEffects(w, role),
    debut = w.direction?.debut === 'early',
    gate = gateProjection(w),
    costs = operatingCosts(w);
  const effects: LedgerEffect[] = [];
  const add = (effect: Omit<LedgerEffect, 'op'> & { op?: LedgerEffect['op'] }) =>
    effects.push({ op: 'none', ...effect });

  // 선수단: what a settled round multiplies growth by (as `developmentOutlook`), and the rest.
  add({
    id: 'growth',
    group: 'squad',
    unit: 'times',
    op: 'times',
    value:
      focus.developmentMultiplier *
      terms.developmentMultiplier *
      developmentBase(w) *
      ground.growth *
      style.growth,
    factors: [
      { source: fact('focus'), value: focus.developmentMultiplier },
      { source: policy('support'), value: terms.developmentMultiplier },
      { source: manager('youth'), value: developmentBase(w) },
      { source: { kind: 'facility', part: 'training' }, value: ground.growth },
      { source: manager('style'), value: style.growth },
    ],
  });
  add({
    id: 'youthGrowth',
    group: 'squad',
    unit: 'times',
    op: 'times',
    value: staff.youthDevelopment * style.youthGrowth * build.youthGrowth,
    factors: [
      { source: manager('style'), value: style.youthGrowth },
      ...(Object.keys(YOUTH_DEVELOPER) as StaffRole[]).map((role) => ({
        source: { kind: 'staff', role } as const,
        value: department(role).youthDevelopment,
      })),
      ...buildFactors(w, 'youthGrowth', 'times'),
      {
        source: { kind: 'direction', key: 'debut' },
        value: debut ? EARLY_DEBUT.youthGrowth : 1,
      },
    ],
  });
  const skills = (Object.keys(DEPARTMENT_ATTRIBUTES) as StaffRole[]).map((role) => ({
    source: { kind: 'staff', role } as const,
    value: department(role).development[DEPARTMENT_ATTRIBUTES[role]![0]],
  }));
  add({
    id: 'skills',
    group: 'squad',
    unit: 'range',
    value: Math.min(...skills.map((factor) => factor.value)),
    factors: skills,
  });
  add({
    id: 'recovery',
    group: 'squad',
    unit: 'plus',
    op: 'plus',
    value: Math.max(
      0,
      focus.recovery + terms.recoveryBonus + staff.recoveryBonus + ground.recoveryBonus,
    ),
    bounds: [0, Infinity],
    factors: [
      { source: fact('focus'), value: focus.recovery },
      { source: policy('support'), value: terms.recoveryBonus },
      { source: { kind: 'staff', role: 'fitness' }, value: department('fitness').recoveryBonus },
      { source: { kind: 'facility', part: 'training' }, value: ground.recoveryBonus },
    ],
  });
  const morale = moraleBaselineTerms(w);
  add({
    id: 'morale',
    group: 'squad',
    unit: 'score',
    op: 'plus',
    value: moraleBaseline(w),
    bounds: MORALE_BASELINE_BOUNDS,
    factors: [
      { source: fact('standard'), value: morale.standard },
      { source: fact('leaders'), value: morale.leaders },
      { source: policy('support'), value: morale.support },
      { source: manager('trust'), value: morale.trust },
      { source: manager('style'), value: morale.style },
      ...buildFactors(w, 'moraleBaseline', 'plus'),
      {
        source: { kind: 'direction', key: 'debut' },
        value: debut ? EARLY_DEBUT.moraleBaseline : 0,
      },
      ...synergyFactors(synergies, 'moraleBaseline', 'plus'),
    ],
  });
  // As `talkGoodwill` reads a player below OVR 70; 스타 대우 adds its share above.
  const culture = buildOf(w).culture,
    moraleGoodwill = (moraleOf(w) - MORALE_START) / 4,
    goodwillParts = [
      terms.goodwill,
      ground.goodwill,
      culture === 'family' ? 5 : culture === 'meritocracy' ? -5 : 0,
      buildOf(w).revenue === 'frugal' ? -5 : 0,
      moraleGoodwill,
    ];
  add({
    id: 'goodwill',
    group: 'squad',
    unit: 'percent',
    op: 'plus',
    value: clamp(
      goodwillParts.reduce((sum, part) => sum + part, 0),
      ...TALK_CONFIG.goodwill,
    ),
    bounds: TALK_CONFIG.goodwill,
    factors: [
      { source: policy('support'), value: terms.goodwill },
      { source: { kind: 'facility', part: 'training' }, value: ground.goodwill },
      { source: { kind: 'build', slot: 'culture' }, value: goodwillParts[2] },
      ...(culture === 'stars'
        ? [
            {
              source: { kind: 'build', slot: 'culture' } as const,
              value: 10,
              only: 'star' as const,
            },
          ]
        : []),
      { source: { kind: 'build', slot: 'revenue' }, value: goodwillParts[3] },
      { source: fact('morale'), value: moraleGoodwill },
    ],
  });
  // As the match reads the own club's strength points (match.ts), home only where it says so.
  add({
    id: 'strength',
    group: 'squad',
    unit: 'plus',
    op: 'plus',
    value: (w.manager.ability - 50) / 4 + moraleStrength(w) + style.strength + talismanStrength(w),
    factors: [
      { source: manager('ability'), value: (w.manager.ability - 50) / 4 },
      { source: fact('morale'), value: moraleStrength(w) },
      { source: manager('style'), value: style.strength },
      ...traitFactor(w, 'talisman', talismanStrength(w)),
      ...buildFactors(w, 'homeStrength', 'plus').map((factor) => ({
        ...factor,
        only: 'home' as const,
      })),
    ],
  });

  // 유소년: the academy's growth and the next intake.
  const director = department('youth');
  add({
    id: 'academyGrowth',
    group: 'academy',
    unit: 'times',
    op: 'times',
    value: academyGrowth(w),
    factors: [
      { source: { kind: 'staff', role: 'youth' }, value: director.academyGrowth },
      { source: { kind: 'facility', part: 'academy' }, value: academyFacility.growth },
      { source: policy('academy'), value: terms.academyGrowth },
      ...synergyFactors(synergies, 'academyGrowth', 'times'),
    ],
  });
  const youthDirector = staffMember(w, 'youth');
  add({
    id: 'intake',
    group: 'academy',
    unit: 'count',
    op: 'plus',
    value: academyIntakeSize(w),
    factors: [
      { source: fact('standard'), value: ACADEMY_INTAKE.standard },
      {
        source: { kind: 'staff', role: 'youth' },
        value:
          youthDirector && youthDirector.ability >= ACADEMY_INTAKE.director.ability
            ? ACADEMY_INTAKE.director.extra
            : 0,
      },
      { source: { kind: 'facility', part: 'academy' }, value: academyFacility.intake },
      { source: policy('academy'), value: terms.academyIntake },
      ...buildFactors(w, 'academyIntake', 'plus'),
      { source: { kind: 'base', which: 'local' }, value: bases.intake },
    ],
  });
  add({
    id: 'intakeAbility',
    group: 'academy',
    unit: 'plus',
    op: 'plus',
    value: academyFacility.potential + Math.round(staff.academyQuality / 4),
    factors: [
      { source: { kind: 'facility', part: 'academy' }, value: academyFacility.potential },
      { source: { kind: 'staff', role: 'youth' }, value: Math.round(staff.academyQuality / 4) },
    ],
  });
  const youthCard = buildOf(w).youth;
  add({
    id: 'intakePotential',
    group: 'academy',
    unit: 'plus',
    op: 'plus',
    value: staff.academyQuality + academyPotentialBonus(w),
    factors: [
      { source: { kind: 'staff', role: 'youth' }, value: staff.academyQuality },
      { source: policy('academy'), value: terms.academyPotential },
      ...buildFactors(w, 'academyPotential', 'plus'),
      ...synergyFactors(synergies, 'academyPotential', 'plus'),
      {
        source: { kind: 'base', which: youthCard === 'worldwide' ? 'global' : 'local' },
        value: bases.intakePotential,
      },
      ...traitFactor(w, 'talentSpotter', intakePotential(w)),
    ],
  });

  // 이적시장: the season's candidate list (as `transferOffers`), bids and wages.
  const scout = department('scout'),
    neutralScout = departmentEffects({ ...w, staff: undefined }, 'scout').scoutCandidates;
  add({
    id: 'candidates',
    group: 'market',
    unit: 'count',
    op: 'plus',
    value: Math.max(4, staff.scoutCandidates + build.marketCandidates + terms.scoutCandidates),
    bounds: [4, Infinity],
    factors: [
      { source: fact('standard'), value: neutralScout },
      { source: { kind: 'staff', role: 'scout' }, value: scout.scoutCandidates - neutralScout },
      ...buildFactors(w, 'marketCandidates', 'plus'),
      { source: policy('globalScouting'), value: terms.scoutCandidates },
    ],
  });
  add({
    id: 'candidatePotential',
    group: 'market',
    unit: 'plus',
    op: 'plus',
    value:
      terms.offer.potentialBonus +
      staff.scoutPotential +
      build.marketPotential +
      synergy.marketPotential +
      terms.scoutPotential,
    factors: [
      { source: policy('recruitment'), value: terms.offer.potentialBonus },
      { source: { kind: 'staff', role: 'scout' }, value: scout.scoutPotential },
      ...buildFactors(w, 'marketPotential', 'plus'),
      ...synergyFactors(synergies, 'marketPotential', 'plus'),
      { source: policy('globalScouting'), value: terms.scoutPotential },
    ],
  });
  add({
    id: 'candidateAbility',
    group: 'market',
    unit: 'plus',
    op: 'plus',
    value: build.marketAbility,
    factors: buildFactors(w, 'marketAbility', 'plus'),
  });
  add({
    id: 'transferFee',
    group: 'market',
    unit: 'times',
    op: 'times',
    value: staff.feeMultiplier * synergy.feeMultiplier * askedFeeFactor(w),
    factors: [
      { source: { kind: 'staff', role: 'director' }, value: department('director').feeMultiplier },
      ...synergyFactors(synergies, 'feeMultiplier', 'times'),
      ...traitFactor(w, 'negotiator', askedFeeFactor(w)),
    ],
  });
  // As `acceptanceChance` adds them to a bid's chance, in percentage points.
  const reputation = ((club.reputation - 40) / 400) * 100;
  add({
    id: 'bidAcceptance',
    group: 'market',
    unit: 'percent',
    op: 'plus',
    value: (staff.bidAcceptance + style.bidAcceptance) * 100 + reputation,
    factors: [
      {
        source: { kind: 'staff', role: 'director' },
        value: department('director').bidAcceptance * 100,
      },
      { source: manager('style'), value: style.bidAcceptance * 100 },
      { source: fact('reputation'), value: reputation },
    ],
  });
  add({
    id: 'wage',
    group: 'market',
    unit: 'times',
    op: 'times',
    value: build.wage * wageDemandFactor(w),
    factors: [
      ...buildFactors(w, 'wage', 'times'),
      ...traitFactor(w, 'negotiator', wageDemandFactor(w)),
    ],
  });
  add({
    id: 'incomingBids',
    group: 'market',
    unit: 'times',
    op: 'times',
    value: build.incomingBids,
    factors: buildFactors(w, 'incomingBids', 'times'),
  });
  add({
    id: 'saleFee',
    group: 'market',
    unit: 'times',
    op: 'times',
    value: build.saleFee,
    factors: buildFactors(w, 'saleFee', 'times'),
  });

  // 팬·관중: a league home gate against an even opponent (as `gateProjection`), and the bases.
  add({
    id: 'attendance',
    group: 'fans',
    unit: 'count',
    value: gate.attendanceHigh,
    factors: [
      { source: fact('supporters'), value: gate.supporters, unit: 'count' },
      { source: { kind: 'ticket' }, value: gate.demand, unit: 'times' },
      { source: fact('form'), value: gate.formDemand, unit: 'times' },
      {
        source: policy('localInvest'),
        value: only('localInvest').gateBoost * 100,
        unit: 'percent',
      },
      { source: { kind: 'base', which: 'local' }, value: bases.gate * 100, unit: 'percent' },
      ...buildFactors(w, 'gateDemand', 'plus').map((factor) => ({
        ...factor,
        value: factor.value * 100,
        unit: 'percent' as const,
      })),
      { source: { kind: 'facility', part: 'stadium' }, value: gate.capacity, unit: 'count' },
    ],
  });
  add({
    id: 'winFans',
    group: 'fans',
    unit: 'times',
    op: 'times',
    value: build.winFans,
    factors: buildFactors(w, 'winFans', 'times'),
  });
  const exclusive = exclusiveSponsor(w) ? EXCLUSIVE_MARKETING : 1;
  add({
    id: 'marketingFans',
    group: 'fans',
    unit: 'count',
    value: marketingFanGain(club.fans, terms.fanGrowth * build.marketingFans * exclusive),
    factors: [
      { source: fact('fans'), value: club.fans, unit: 'count' },
      { source: policy('globalMarketing'), value: terms.fanGrowth * 100, unit: 'percent' },
      ...buildFactors(w, 'marketingFans', 'times').map((factor) => ({
        ...factor,
        unit: 'times' as const,
      })),
      ...(exclusive === 1
        ? []
        : [{ source: fact('sponsor'), value: exclusive, unit: 'times' as const }]),
    ],
  });
  add({
    id: 'localBase',
    group: 'fans',
    unit: 'score',
    op: 'plus',
    value: terms.baseTargets.local,
    current: w.localBase ?? 0,
    factors: [{ source: policy('localInvest'), value: only('localInvest').baseTargets.local }],
  });
  add({
    id: 'localBaseRate',
    group: 'fans',
    unit: 'times',
    op: 'times',
    value: build.localBaseRate,
    factors: buildFactors(w, 'localBaseRate', 'times'),
  });
  add({
    id: 'globalReach',
    group: 'fans',
    unit: 'score',
    op: 'plus',
    value: terms.baseTargets.global,
    current: w.globalReach ?? 0,
    bounds: [0, 100],
    factors: [
      { source: policy('globalMarketing'), value: only('globalMarketing').baseTargets.global },
      { source: policy('globalScouting'), value: only('globalScouting').baseTargets.global },
    ],
  });

  // 수입·지출: what multiplies sponsor offers (as `sponsorOffers`), and the year's fixed costs.
  const sponsorParts = (which: 'local' | 'global'): EffectFactor[] => [
    {
      source: { kind: 'base', which },
      value: which === 'local' ? bases.localSponsor : bases.globalSponsor,
    },
    ...buildFactors(w, 'sponsor', 'times'),
    ...synergyFactors(synergies, 'sponsor', 'times'),
    ...traitFactor(w, 'marketer', sponsorFactor(w)),
  ];
  for (const which of ['local', 'global'] as const)
    add({
      id: which === 'local' ? 'localSponsor' : 'globalSponsor',
      group: 'money',
      unit: 'times',
      op: 'times',
      value:
        (which === 'local' ? bases.localSponsor : bases.globalSponsor) *
        build.sponsor *
        synergy.sponsor *
        sponsorFactor(w),
      factors: sponsorParts(which),
    });
  const invested = scaleOperatingExpenses(costs.seasonExpenses, costs.operatingFactor),
    rows = ['localInvest', 'globalMarketing', 'globalScouting'] as const,
    rowShares = shares(
      costs.investment,
      rows.map((key) => only(key).investUnits),
    ),
    upkeep = shares(
      costs.maintenance,
      FACILITY_PARTS.map((part) => partUpkeepUnits(w, part)),
    );
  add({
    id: 'annualCosts',
    group: 'money',
    unit: 'money',
    op: 'plus',
    value: 0,
    amount: costs.annual,
    factors: [
      { source: fact('wages'), value: 0, amount: costs.playerWages },
      { source: manager('wage'), value: 0, amount: costs.managerWage },
      { source: { kind: 'staff' }, value: 0, amount: costs.staffWages },
      { source: policy('support'), value: 0, amount: invested },
      ...(hasTrait(w, 'politician')
        ? [
            {
              source: { kind: 'owner', trait: 'politician' } as const,
              value: OWNER_TRAITS.politician.operating,
              amount: (BigInt(costs.expenses) - BigInt(invested)).toString(),
            },
          ]
        : []),
      { source: policy('academy'), value: 0, amount: costs.academy },
      ...rows.map((key, index) => ({ source: policy(key), value: 0, amount: rowShares[index] })),
      ...FACILITY_PARTS.map((part, index) => ({
        source: { kind: 'facility', part } as const,
        value: 0,
        amount: upkeep[index],
      })),
      ...(costs.loan === '0' ? [] : [{ source: fact('loan'), value: 0, amount: costs.loan }]),
    ],
  });
  return { effects, synergies };
}
