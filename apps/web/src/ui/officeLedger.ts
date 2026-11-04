import type { SourceMessageId } from '../../../../packages/contracts/src/messages';
import type {
  FacilityPart,
  ResponsibilityKey,
  World,
} from '../../../../packages/contracts/src/types';
import type {
  EffectFactor,
  EffectGroup,
  EffectId,
  EffectSource,
  EffectUnit,
  LedgerEffect,
} from '../../../../packages/engine/src/effect-ledger';
import { BUILD_SLOT_INFO, buildOf, cardOf } from '../../../../packages/engine/src/build';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import { FACILITY_PART_LABEL, STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { OWNER_TRAITS } from '../../../../packages/engine/src/owner-config';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { STAFF_INFO, staffMember } from '../../../../packages/engine/src/staff-info';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { displayMessage, localizeValue } from '../presentation/text';
import type { OfficeRead } from '../runtime/officeRead';
import {
  DECISION_BUILDS,
  DECISION_DIRECTIONS,
  DECISION_POLICIES,
  PASSIVE_BUILDS,
  PASSIVE_POLICIES,
} from './clubControls';
import { decimal, number, signed } from './format';
import type { InvestmentArea } from './investmentAreas';
import { openControl, openDecisionSettings, openInvestment, openTeam, openTraining } from './state';

/** The office's effects in force (→WEB-116), read from `OfficeRead.effects`. */
export type OfficeEffectsRead = OfficeRead['effects'];

export const GROUP_NAMES: Record<EffectGroup, SourceMessageId> = {
  squad: 'office.group.squad',
  academy: 'office.group.academy',
  market: 'office.group.market',
  fans: 'office.group.fans',
  money: 'office.group.money',
};
export const EFFECT_NAMES: Record<EffectId, SourceMessageId> = {
  growth: 'office.effect.growth',
  youthGrowth: 'office.effect.youthGrowth',
  skills: 'office.effect.skills',
  recovery: 'office.effect.recovery',
  morale: 'office.effect.morale',
  goodwill: 'office.effect.goodwill',
  strength: 'office.effect.strength',
  academyGrowth: 'office.effect.academyGrowth',
  intake: 'office.effect.intake',
  intakeAbility: 'office.effect.intakeAbility',
  intakePotential: 'office.effect.intakePotential',
  scoutPerLine: 'office.effect.scoutPerLine',
  scoutAbroad: 'office.effect.scoutAbroad',
  scoutAbility: 'office.effect.scoutAbility',
  transferFee: 'office.effect.transferFee',
  bidAcceptance: 'office.effect.bidAcceptance',
  wage: 'office.effect.wage',
  incomingBids: 'office.effect.incomingBids',
  saleFee: 'office.effect.saleFee',
  attendance: 'office.effect.attendance',
  winFans: 'office.effect.winFans',
  marketingFans: 'office.effect.marketingFans',
  localBase: 'office.effect.localBase',
  localBaseRate: 'office.effect.localBaseRate',
  globalReach: 'office.effect.globalReach',
  localSponsor: 'office.effect.localSponsor',
  globalSponsor: 'office.effect.globalSponsor',
  annualCosts: 'office.effect.annualCosts',
};
/** What each value does, one line under its name in the breakdown. */
export const EFFECT_NOTES: Record<EffectId, SourceMessageId> = {
  growth: 'office.effect.growth.note',
  youthGrowth: 'office.effect.youthGrowth.note',
  skills: 'office.effect.skills.note',
  recovery: 'office.effect.recovery.note',
  morale: 'office.effect.morale.note',
  goodwill: 'office.effect.goodwill.note',
  strength: 'office.effect.strength.note',
  academyGrowth: 'office.effect.academyGrowth.note',
  intake: 'office.effect.intake.note',
  intakeAbility: 'office.effect.intakeAbility.note',
  intakePotential: 'office.effect.intakePotential.note',
  scoutPerLine: 'office.effect.scoutPerLine.note',
  scoutAbroad: 'office.effect.scoutAbroad.note',
  scoutAbility: 'office.effect.scoutAbility.note',
  transferFee: 'office.effect.transferFee.note',
  bidAcceptance: 'office.effect.bidAcceptance.note',
  wage: 'office.effect.wage.note',
  incomingBids: 'office.effect.incomingBids.note',
  saleFee: 'office.effect.saleFee.note',
  attendance: 'office.effect.attendance.note',
  winFans: 'office.effect.winFans.note',
  marketingFans: 'office.effect.marketingFans.note',
  localBase: 'office.effect.localBase.note',
  localBaseRate: 'office.effect.localBaseRate.note',
  globalReach: 'office.effect.globalReach.note',
  localSponsor: 'office.effect.localSponsor.note',
  globalSponsor: 'office.effect.globalSponsor.note',
  annualCosts: 'office.effect.annualCosts.note',
};

/** The groups in the ledger's order. */
export const effectGroups = (effects: readonly LedgerEffect[]) => [
  ...new Set(effects.map((effect) => effect.group)),
];

const IDENTITY: Partial<Record<EffectUnit, number>> = { times: 1, range: 1 };
/** A factor that changes nothing: ×1, or +0. */
export function neutralFactor(effect: LedgerEffect, factor: EffectFactor) {
  if (effect.unit === 'money') return factor.amount === '0';
  const unit = factor.unit ?? effect.unit;
  if (unit === 'count' && factor.unit) return false;
  return Math.abs(factor.value - (IDENTITY[unit] ?? 0)) < 1e-9;
}

const times = (value: number) => `×${decimal(value, 2)}`;
const plain = (value: number) => decimal(value, Number.isInteger(value) ? 0 : 1);
const plus = (value: number) => signed(value, Number.isInteger(value) ? 0 : 1);
const people = (count: string) => displayMessage('office.value.people', { count });
/** A count as its effect counts: countries for the scout's reach abroad, people otherwise. */
const counted = (effect: LedgerEffect, count: string) =>
  effect.id === 'scoutAbroad' ? displayMessage('office.value.countries', { count }) : people(count);

/** A value as the office lists it; money effects render their `amount` instead. */
export function effectValueText(effect: LedgerEffect, value = effect.value): string {
  switch (effect.unit) {
    case 'times':
      return times(value);
    case 'range': {
      const values = effect.factors.map((factor) => factor.value);
      return `${times(Math.min(...values))}–${times(Math.max(...values))}`;
    }
    case 'percent':
      return effect.id === 'bidAcceptance'
        ? displayMessage('office.value.percentPoint', { value: plus(Number(value.toFixed(1))) })
        : `${plus(Number(value.toFixed(1)))}%`;
    case 'count':
      return effect.id === 'marketingFans'
        ? displayMessage('office.value.perRound', { count: number(value) })
        : counted(effect, number(value));
    case 'score':
      return effect.current === undefined
        ? plain(value)
        : displayMessage('office.value.target', {
            target: plain(value),
            current: plain(Number(effect.current.toFixed(1))),
          });
    default:
      return plus(value);
  }
}

/** A factor's share, in its own unit; the standard start reads as a level, not an addition. */
export function factorValueText(effect: LedgerEffect, factor: EffectFactor): string {
  const unit = factor.unit ?? effect.unit;
  const standard = factor.source.kind === 'fact' && factor.source.term === 'standard';
  switch (unit) {
    case 'times':
    case 'range':
      return times(factor.value);
    case 'percent':
      return effect.id === 'bidAcceptance'
        ? displayMessage('office.value.percentPoint', {
            value: plus(Number(factor.value.toFixed(1))),
          })
        : `${plus(Number(factor.value.toFixed(2)))}%`;
    case 'count':
      return counted(effect, standard || factor.unit ? number(factor.value) : signed(factor.value));
    default:
      return standard ? plain(factor.value) : plus(Number(factor.value.toFixed(2)));
  }
}

/** A share of the value: an addition reads signed even where the value reads as a level. */
export function contributionText(effect: LedgerEffect, value: number): string {
  switch (effect.unit) {
    case 'times':
      return times(value);
    case 'percent':
      return effectValueText(effect, value);
    case 'count':
      return counted(effect, signed(value));
    default:
      return plus(Number(value.toFixed(2)));
  }
}

const levelName = (key: keyof typeof POLICY_INFO, w: World) =>
  POLICY_INFO[key].levels[policyOf(w)[key] - 1].name;
const member = (name: string, ability: number) =>
  displayMessage('office.source.member', { name, ability });

/** A factor's source in the owner's terms: what it is, and what it is set to now. */
export function sourceText(
  source: EffectSource,
  w: World,
  read: OfficeEffectsRead,
): { name: string; detail?: string } {
  switch (source.kind) {
    case 'policy':
      return {
        name: localizeValue(POLICY_INFO[source.key].label),
        detail: localizeValue(levelName(source.key, w)),
      };
    case 'build':
      return {
        name: localizeValue(BUILD_SLOT_INFO[source.slot].label),
        detail: localizeValue(cardOf(buildOf(w), source.slot).label),
      };
    case 'direction': {
      const info = DIRECTION_INFO[source.key],
        choice = info.options.find((option) => option.id === directionOf(w, source.key));
      return { name: localizeValue(info.label), detail: localizeValue(choice?.name) };
    }
    case 'facility':
      return {
        name: localizeValue(FACILITY_PART_LABEL[source.part]),
        detail:
          source.part === 'stadium'
            ? localizeValue(STADIUM_STEPS[w.stadium].name)
            : displayMessage('office.source.level', {
                level: source.part === 'training' ? w.trainingGround : w.academyFacility,
              }),
      };
    case 'ticket':
      return { name: displayMessage('office.source.ticket') };
    case 'staff': {
      if (!source.role) return { name: displayMessage('office.source.staffWages') };
      const coach = staffMember(w, source.role);
      return {
        name: localizeValue(STAFF_INFO[source.role].label),
        detail: coach ? member(coach.name, coach.ability) : displayMessage('office.source.vacant'),
      };
    }
    case 'manager': {
      const { manager } = w;
      switch (source.term) {
        case 'style':
          return {
            name: displayMessage('office.source.managerStyle'),
            detail: manager.interim
              ? displayMessage('office.source.interim')
              : manager.style
                ? localizeValue(STYLE_INFO[manager.style].label)
                : displayMessage('office.source.basicStyle'),
          };
        case 'ability':
          return {
            name: displayMessage('office.source.managerAbility'),
            detail: member(manager.name, manager.ability),
          };
        case 'youth':
          return {
            name: displayMessage('office.source.managerYouth'),
            detail: number(manager.youth),
          };
        case 'trust':
          return {
            name: displayMessage('office.source.managerTrust'),
            detail: number(manager.trust),
          };
        default:
          return { name: displayMessage('office.source.managerWage'), detail: manager.name };
      }
    }
    case 'synergy': {
      const synergy = read.synergies.find((item) => item.id === source.id);
      const met = synergy?.conditions.filter((condition) => condition.met).length ?? 0;
      return {
        name: localizeValue(synergy?.label ?? source.id),
        detail: synergy?.active
          ? displayMessage('office.source.synergyActive')
          : displayMessage('office.source.synergyWaiting', {
              met,
              total: synergy?.conditions.length ?? 0,
            }),
      };
    }
    case 'owner':
      return {
        name: localizeValue(OWNER_TRAITS[source.trait].label),
        detail: displayMessage('office.source.ownerTrait'),
      };
    case 'base':
      return source.which === 'local'
        ? {
            name: displayMessage('office.source.localBase'),
            detail: plain(Number((w.localBase ?? 0).toFixed(1))),
          }
        : {
            name: displayMessage('office.source.globalReach'),
            detail: plain(Number((w.globalReach ?? 0).toFixed(1))),
          };
    case 'fact':
      switch (source.term) {
        case 'focus':
          return {
            name: displayMessage('office.source.focus'),
            detail: displayMessage('office.source.focusDetail', { focus: read.focus }),
          };
        case 'reputation':
          return {
            name: displayMessage('office.source.reputation'),
            detail: number(clubOf(w).reputation),
          };
        default:
          return { name: displayMessage(FACT_NAMES[source.term]) };
      }
  }
}
const FACT_NAMES: Record<
  Exclude<Extract<EffectSource, { kind: 'fact' }>['term'], 'focus' | 'reputation'>,
  SourceMessageId
> = {
  standard: 'office.source.standard',
  leaders: 'office.source.leaders',
  morale: 'office.source.morale',
  form: 'office.source.form',
  supporters: 'office.source.supporters',
  fans: 'office.source.fans',
  wages: 'office.source.wages',
  loan: 'office.source.loan',
  sponsor: 'office.source.sponsor',
};
export const ONLY_NAMES: Record<NonNullable<EffectFactor['only']>, SourceMessageId> = {
  star: 'office.source.onlyStar',
  home: 'office.source.onlyHome',
};

/** Where an area's facility is built. */
const FACILITY_AREA: Record<FacilityPart, InvestmentArea> = {
  training: 'firstTeam',
  academy: 'youth',
  stadium: 'stadium',
};
function homeOf<K extends string, H extends string>(
  table: Record<H, readonly K[]>,
  key: K,
): H | undefined {
  return (Object.keys(table) as H[]).find((home) => table[home].includes(key));
}
/** The investment area whose controls set a source, if one does. */
export function areaOfSource(source: EffectSource): InvestmentArea | undefined {
  switch (source.kind) {
    case 'policy':
      return homeOf<string, InvestmentArea>(PASSIVE_POLICIES, source.key);
    case 'build':
      return homeOf<string, InvestmentArea>(PASSIVE_BUILDS, source.slot);
    case 'facility':
      return FACILITY_AREA[source.part];
    case 'ticket':
      return 'stadium';
    case 'staff':
      return 'coaches';
    case 'base':
      return 'community';
    default:
      return undefined;
  }
}

/** Where the owner changes a source: an investment control, a decision rule or a squad list. */
export type EffectDestination =
  | { kind: 'investment'; area: InvestmentArea; control?: string }
  | { kind: 'decision'; key: ResponsibilityKey }
  | { kind: 'team' }
  | { kind: 'training' };
export function effectDestination(source: EffectSource): EffectDestination | undefined {
  switch (source.kind) {
    case 'policy': {
      const area = areaOfSource(source);
      if (area) return { kind: 'investment', area, control: `policy:${source.key}` };
      const key = homeOf<string, ResponsibilityKey>(DECISION_POLICIES, source.key);
      return key && { kind: 'decision', key };
    }
    case 'build': {
      const area = areaOfSource(source);
      if (area) return { kind: 'investment', area, control: `build:${source.slot}` };
      const key = homeOf<string, ResponsibilityKey>(DECISION_BUILDS, source.slot);
      return key && { kind: 'decision', key };
    }
    case 'direction': {
      const key = homeOf<string, ResponsibilityKey>(DECISION_DIRECTIONS, source.key);
      return key && { kind: 'decision', key };
    }
    case 'facility':
      return {
        kind: 'investment',
        area: FACILITY_AREA[source.part],
        control: `investment-facility-${source.part}`,
      };
    case 'ticket':
      return { kind: 'investment', area: 'stadium', control: 'ticket' };
    case 'staff':
      return { kind: 'investment', area: 'coaches' };
    case 'manager':
      return { kind: 'decision', key: 'manager' };
    case 'base':
      return {
        kind: 'investment',
        area: 'community',
        control: source.which === 'local' ? 'policy:localInvest' : 'policy:globalMarketing',
      };
    case 'fact':
      switch (source.term) {
        case 'focus':
          return { kind: 'training' };
        case 'leaders':
        case 'wages':
          return { kind: 'team' };
        case 'supporters':
        case 'fans':
          return { kind: 'investment', area: 'community' };
        case 'loan':
          return { kind: 'investment', area: 'finance' };
        case 'sponsor':
          return { kind: 'decision', key: 'sponsors' };
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}
export function openEffectDestination(destination: EffectDestination) {
  switch (destination.kind) {
    case 'investment':
      if (destination.control) openControl(destination.area, destination.control);
      else openInvestment(destination.area);
      return;
    case 'decision':
      openDecisionSettings(destination.key);
      return;
    case 'team':
      openTeam('players');
      return;
    case 'training':
      openTraining('training');
  }
}

/** The effects an area always lists, its main dials' work, even while they change nothing. */
const AREA_EFFECTS: Record<InvestmentArea, readonly EffectId[]> = {
  firstTeam: ['growth', 'recovery', 'goodwill', 'morale'],
  youth: ['academyGrowth', 'intake', 'intakePotential', 'intakeAbility'],
  coaches: ['skills', 'youthGrowth', 'recovery', 'academyGrowth', 'scoutPerLine', 'transferFee'],
  stadium: [],
  scouting: ['scoutPerLine', 'scoutAbroad'],
  community: ['localBase', 'globalReach'],
  finance: ['localSponsor', 'wage'],
  identity: [],
};
export type AreaRow =
  /** This area's share of a value; `whole` when the area sets every factor of it. */
  | { kind: 'share'; effect: LedgerEffect; value: number; whole: boolean }
  /** One factor of a value no product or sum makes, read alone. */
  | { kind: 'factor'; effect: LedgerEffect; factor: EffectFactor };
/**
 * What an area's own controls do now (→WEB-116): each value its factors move, combined from those
 * factors alone. Costs and the area's facts are its card's own rows.
 */
export function areaRows(effects: readonly LedgerEffect[], area: InvestmentArea): AreaRow[] {
  const rows: AreaRow[] = [];
  for (const effect of effects) {
    if (effect.unit === 'money') continue;
    const own = effect.factors.filter(
      (factor) => !factor.only && areaOfSource(factor.source) === area,
    );
    if (!own.length) continue;
    const listed = AREA_EFFECTS[area].includes(effect.id);
    if (effect.unit === 'range') {
      rows.push({ kind: 'share', effect, value: effect.value, whole: true });
      continue;
    }
    if (effect.op === 'none') {
      for (const factor of own)
        if (factor.unit !== 'count' && !neutralFactor(effect, factor))
          rows.push({ kind: 'factor', effect, factor });
      continue;
    }
    const value = own.reduce(
      (all, factor) => (effect.op === 'times' ? all * factor.value : all + factor.value),
      effect.op === 'times' ? 1 : 0,
    );
    const changes = Math.abs(value - (effect.op === 'times' ? 1 : 0)) > 1e-9;
    // An area that sets the whole value reads it as the engine bounds it.
    const whole = own.length === effect.factors.filter((factor) => !factor.only).length;
    if (changes || listed)
      rows.push({ kind: 'share', effect, value: whole ? effect.value : value, whole });
  }
  return rows;
}
