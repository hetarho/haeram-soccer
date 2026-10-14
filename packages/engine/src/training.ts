import type { Player, TrainingFocus, World } from '../../contracts/src/types';
import { ATTRIBUTES, type Attribute } from '../../contracts/src/player';
import {
  adaptationAfter,
  AGEING,
  mainOvr,
  overshootFactor,
  PROFESSIONALISM_RATE,
  TRAINING_GAIN,
  weightsFor,
} from './player';
import { settleRate } from './adaptation';
import { trainingInjuries } from './careers';
import { BUILD_SLOTS } from '../../contracts/src/build';
import { activePlayers, addEvent, overall } from './world';
import { clamp, compareIds, random } from './primitives';
import { POLICY_INFO, policyEffects, policyOf } from './policy';
import {
  autoPlayerFocus,
  autoTrainingFocus,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
  staffEffects,
  staffMember,
} from './staff';
import { developAcademy } from './academy';
import { settleMorale } from './morale';
import { managerStyleEffects, STYLE_INFO } from './styles';
import { buildEffects, buildOf, cardOf } from './build';
import { countDownOrder, countDownPlayerOrders, tidyOrders } from './orders';
import { trainingGroundBase } from './facilities';

export const trainingFocusInfo: Record<
  TrainingFocus,
  { label: string; description: string; recovery: number; developmentMultiplier: number }
> = {
  balanced: {
    label: '균형 훈련',
    description: '성장과 회복을 함께 · 라운드마다 피로 11 회복',
    recovery: 11,
    developmentMultiplier: 1,
  },
  recovery: {
    label: '회복 훈련',
    description: '피로 16 회복 · 성장은 0.4배로 쉬어갑니다',
    recovery: 16,
    developmentMultiplier: 0.4,
  },
  hard: {
    label: '하드 트레이닝',
    description: '성장 1.6배 · 피로 회복은 6',
    recovery: 6,
    developmentMultiplier: 1.6,
  },
};

const hundredths = (value: number) => Math.round(value * 100) / 100;
/**
 * A round's or a season's growth reaches the main OVR at this share: the rest of a player's
 * attributes keep it from running away, as the two trained skills of four did before.
 */
const GROWTH_SHARE = 0.5;
/** Attributes top out at 99 (→PLAYER-2). */
const TOP = 99;

/** Adaptation he needs before he grows past his potential (→PLAYER-16). */
export const OVERSHOOT_ADAPTATION = 0.9;
/**
 * A settled player's round rate never falls below the one he had this far below potential, so he
 * still has a rate to outgrow it by (→PLAYER-16); the curve past potential scales it down.
 */
export const OVERSHOOT_GAP = 2;
/**
 * Spreads `gain` main-OVR points of growth over his attributes by his main position's weights, so
 * primary attributes grow fastest (→PLAYER-15); each attribute × its department's factor. Growth
 * stops at potential, unless he is settled (0.90+), when it goes on past it on a curve that
 * flattens sharply (→PLAYER-16). `only` limits it to the attributes still growing at his age;
 * `share` is how much of `gain` reaches the main OVR (a round's half, a season's whole).
 * Returns the main OVR's actual rise.
 */
export function growAttributes(
  player: Player,
  gain: number,
  factor: (attribute: Attribute) => number = () => 1,
  { only, share = GROWTH_SHARE }: { only?: (a: Attribute) => boolean; share?: number } = {},
) {
  if (gain <= 0) return 0;
  const before = mainOvr(player);
  const excess = before - player.potential;
  const rise =
    excess < 0
      ? Math.min(gain * share, -excess)
      : player.adaptation >= OVERSHOOT_ADAPTATION
        ? gain * share * overshootFactor(excess)
        : 0;
  if (rise <= 0) return 0;
  const weights = weightsFor(player.position);
  let total = 0,
    squares = 0;
  for (const a of ATTRIBUTES) {
    if (only && !only(a)) continue;
    total += weights[a];
    squares += weights[a] ** 2;
  }
  if (!squares) return 0;
  // Each attribute's step ∝ its weight, scaled so the main OVR rises by `rise`.
  const scale = (rise * total) / squares;
  for (const a of ATTRIBUTES) {
    if (!weights[a] || (only && !only(a))) continue;
    const step = hundredths(scale * weights[a] * factor(a));
    player.attrs[a] = hundredths(Math.min(TOP, Math.max(player.attrs[a], player.attrs[a] + step)));
  }
  return Math.max(0, hundredths(mainOvr(player) - before));
}

export function recordDevelopment(player: Player, gain: number) {
  if (gain <= 0) return;
  player.developed = hundredths(Math.min(500, (player.developed || 0) + gain));
}

/**
 * The first team's focus in force: an order or accepted suggestion the assistant holds, else his
 * rule (→CLUB-13, STAFF-19).
 */
export function activeTrainingFocus(w: World): TrainingFocus {
  return w.trainingOrders?.assistant?.focus ?? autoTrainingFocus(w);
}
/**
 * A player's focus this round (→CLUB-11, CLUB-13): an order or accepted suggestion for him, else
 * the assistant's player rule, else the squad's.
 */
export function focusFor(w: World, p: Player, squad = activeTrainingFocus(w)): TrainingFocus {
  return w.trainingOrders?.players?.[p.id]?.focus ?? autoPlayerFocus(w, p) ?? squad;
}

/** The manager's youth work and the training ground, the base a round's growth multiplies (→CLUB-12). */
export function developmentBase(w: World) {
  // Twenty facility levels give the same top bonus thirty used to (→ECON-12).
  return 0.5 + w.manager.youth / 100 + trainingGroundBase(w);
}

function roundGain(
  w: World,
  player: Player,
  policy = policyEffects(policyOf(w)),
  staff = staffEffects(w),
  focus = activeTrainingFocus(w),
) {
  const age = w.year - player.born;
  if (age >= 27 || player.status !== 'active') return 0;
  const gap = Math.max(
    player.potential - mainOvr(player),
    player.adaptation >= OVERSHOOT_ADAPTATION ? OVERSHOOT_GAP : 0,
  );
  const ageWeight = age < 21 ? 1 : age < 24 ? 0.85 : 0.65;
  const base = Math.min(0.12, (gap / 400) * developmentBase(w) * ageWeight);
  const style = managerStyleEffects(w);
  return hundredths(
    base *
      trainingFocusInfo[focus].developmentMultiplier *
      PROFESSIONALISM_RATE[player.personality.professionalism - 1] *
      policy.developmentMultiplier *
      style.growth *
      (age <= 21 ? staff.youthDevelopment * style.youthGrowth * buildEffects(w).youthGrowth : 1),
  );
}
/** The main-OVR rise a round would bring him, read without changing him. */
function actualRoundGain(w: World, player: Player) {
  const staff = staffEffects(w),
    gain = roundGain(w, player, undefined, staff, focusFor(w, player));
  const copy = { ...player, attrs: { ...player.attrs } };
  return growAttributes(copy, gain, (a) => staff.development[a]);
}

/** A domestic boundary settles growth and recovery once, even after changing focus or reloading. */
export function settleTraining(w: World) {
  if (w.round <= 0) return;
  const at = `${w.year}:${w.round}`;
  if (w.trainingAt === at) return;
  // Decided once per round: recovering earlier players must not flip later players' focus.
  const squad = activeTrainingFocus(w),
    policy = policyEffects(policyOf(w)),
    staff = staffEffects(w),
    focuses = new Map(activePlayers(w).map((player) => [player.id, focusFor(w, player, squad)]));
  for (const player of activePlayers(w)) {
    const focus = focuses.get(player.id)!,
      info = trainingFocusInfo[focus],
      recovery = Math.max(0, info.recovery + policy.recoveryBonus + staff.recoveryBonus);
    const gain = roundGain(w, player, policy, staff, focus);
    recordDevelopment(
      player,
      growAttributes(player, gain, (a) => staff.development[a]),
    );
    // Training settles him too, but alone never past 0.80 (→PLAYER-12).
    player.adaptation = adaptationAfter(
      player.adaptation,
      TRAINING_GAIN[focus] * settleRate(w, player),
      { trainingOnly: true },
    );
    player.fatigue = Math.max(0, player.fatigue - recovery);
  }
  // 하드 트레이닝 can hurt: the draw comes before fatigue eases, from each player's own stream.
  trainingInjuries(
    w,
    activePlayers(w).filter((player) => focuses.get(player.id) === 'hard'),
  );
  const orders = (w.trainingOrders ||= {});
  if (squad === 'hard') orders.hardStreak = (orders.hardStreak ?? 0) + 1;
  else delete orders.hardStreak;
  countDownOrder(w, 'assistant');
  countDownPlayerOrders(w);
  developAcademy(w);
  settleMorale(w);
  tidyOrders(w);
  w.trainingAt = at;
}

/**
 * A season's development and ageing (→PLAYER-15, PLAYER-17): attributes still in their growing
 * years take the season's growth by the main position's weights; those past it hold; those past
 * their decline age fall by their group's amount. Every change carries noise of ±0.5.
 */
export function developAnnually(w: World, player: Player) {
  const age = w.year - player.born,
    gap = Math.max(0, player.potential - mainOvr(player)),
    variation = random(`${w.seed}:growth:${player.id}:${w.year}`);
  const growth =
    age < 27
      ? Math.min(3, gap / 20 + w.manager.youth / 100 + (trainingGroundBase(w) * 27) / 4)
      : age <= 30
        ? 0.3
        : 0;
  const growing = (a: Attribute) => age <= AGEING[a].growUntil;
  const before = mainOvr(player);
  // A season's growth reaches the main OVR whole. Under 27 its noise rides inside it, so it never
  // carries him past his potential; later every attribute takes its own.
  const young = age < 27;
  growAttributes(player, Math.max(0, growth + (young ? variation() - 0.5 : 0)), undefined, {
    only: growing,
    share: 1,
  });
  for (const a of ATTRIBUTES) {
    if (young && growing(a)) continue;
    const decline = age >= AGEING[a].declineFrom ? AGEING[a].perSeason : 0;
    player.attrs[a] = hundredths(clamp(player.attrs[a] + variation() - 0.5 - decline, 5, TOP));
  }
  recordDevelopment(player, hundredths(mainOvr(player) - before));
  revisePotential(w, player);
}

/**
 * Young players' ceilings are not fixed (→CLUB-12): each summer a player aged 23 or younger may
 * break through (5%: potential +5 to +9) or stall (5%: −4 to −7); the rest move by at most two.
 */
export const POTENTIAL_REVISION = {
  maxAge: 23,
  breakthrough: { chance: 0.05, min: 5, max: 9 },
  stall: { chance: 0.05, min: 4, max: 7 },
  drift: 2,
} as const;
export function revisePotential(w: World, player: Player) {
  const age = w.year - player.born;
  if (age > POTENTIAL_REVISION.maxAge || player.status !== 'active') return;
  const r = random(`${w.seed}:potential:${player.id}:${w.year}`);
  const u = r(),
    c = POTENTIAL_REVISION;
  const change =
    u < c.breakthrough.chance
      ? Math.round(c.breakthrough.min + r() * (c.breakthrough.max - c.breakthrough.min))
      : u < c.breakthrough.chance + c.stall.chance
        ? -Math.round(c.stall.min + r() * (c.stall.max - c.stall.min))
        : Math.round((r() * 2 - 1) * c.drift);
  if (!change) return;
  const next = clamp(player.potential + change, overall(player), 99);
  if (next === player.potential) return;
  const before = player.potential;
  player.potential = next;
  if (Math.abs(change) >= c.stall.min)
    addEvent(
      w,
      change > 0 ? 'potential-breakthrough' : 'potential-stall',
      change > 0 ? `${player.name} 잠재력 폭발` : `${player.name} 성장 정체`,
      `${age}세 · 잠재력 ${Math.round(before)} → ${Math.round(next)}`,
    );
}

/** Pure read model; projected gain is not awarded by viewing or selecting a plan. */
export function trainingSummary(w: World) {
  const active = activePlayers(w),
    focus = activeTrainingFocus(w);
  const promising = active.filter(
    (player) => w.year - player.born < 27 && player.potential > mainOvr(player),
  );
  return {
    focus,
    eligible: promising.length,
    averageFatigue: Math.round(
      active.reduce((sum, player) => sum + player.fatigue, 0) / (active.length || 1),
    ),
    developed: hundredths(active.reduce((sum, player) => sum + (player.developed || 0), 0)),
    players: [...promising]
      .sort(
        (a, b) => b.potential - overall(b) - (a.potential - overall(a)) || compareIds(a.id, b.id),
      )
      .slice(0, 6)
      .map((player) => ({
        player,
        ability: overall(player),
        potential: player.potential,
        developed: player.developed || 0,
        nextGain: actualRoundGain(w, player),
        focus: focusFor(w, player, focus),
      })),
    /** Players on a focus of their own this round, and who set it (→CLUB-11, CLUB-13). */
    own: active.flatMap((player) => {
      const order = w.trainingOrders?.players?.[player.id],
        own = focusFor(w, player, focus);
      if (!order && own === focus) return [];
      const by = order ? (order.forced ? 'order' : 'suggestion') : 'rule';
      return [
        {
          player,
          focus: own,
          by: by as 'order' | 'suggestion' | 'rule',
          rounds: order?.rounds ?? 0,
        },
      ];
    }),
  };
}

/** Where a development term is set (→WEB-71), as `<page>/<tab>`. */
export type DevelopmentHome =
  | 'training/training'
  | 'business/strategy'
  | 'people/manager'
  | 'people/coaches'
  | 'business/facility';
export interface DevelopmentFactor {
  key: 'focus' | 'investment' | 'base' | 'style' | 'style-youth' | 'coaches-youth' | 'build-youth';
  label: string;
  /** What the term multiplies a settled round's growth by. */
  value: number;
  /** Every player still growing (under 27), or only those aged 21 or under. */
  applies: 'all' | 'u21';
  home: DevelopmentHome;
  /** What sets the value now, in the owner's terms. */
  detail: string;
}
export interface GrowingPlayer {
  player: Player;
  age: number;
  ability: number;
  potential: number;
  /** Potential less ability: the room he has left. */
  gap: number;
  /** Growth he has earned so far (→CLUB-12). */
  developed: number;
}
/** Players listed as still growing are this age or younger (→WEB-70). */
export const GROWING_AGE = 23;
/**
 * What drives development now (→WEB-70): the focus in force, the terms `roundGain` multiplies a
 * player's base growth by, each coach's per-skill multiplier and the players still growing. A
 * pure read model: viewing it grants nothing.
 */
export function developmentOutlook(w: World) {
  const focus = activeTrainingFocus(w),
    info = trainingFocusInfo[focus],
    order = w.trainingOrders?.assistant,
    by = order ? (order.forced ? ('order' as const) : ('suggestion' as const)) : ('rule' as const),
    policy = policyOf(w),
    effects = policyEffects(policy),
    staff = staffEffects(w),
    style = managerStyleEffects(w),
    build = buildOf(w);
  const school = w.manager.interim
      ? '임시 감독 · 학파 효과 없음'
      : `${w.manager.name} · ${w.manager.style ? STYLE_INFO[w.manager.style].label : '기본형'}`,
    developers = STAFF_ROLES.filter((role) => staffMember(w, role)?.trait === 'developer').map(
      (role) => STAFF_INFO[role].label,
    ),
    youthCards = BUILD_SLOTS.map((slot) => cardOf(build, slot))
      .filter((card) => card.effects.youthGrowth !== undefined)
      .map((card) => card.label);
  const factors: DevelopmentFactor[] = [
    {
      key: 'focus',
      label: '훈련 방향',
      value: info.developmentMultiplier,
      applies: 'all',
      home: 'training/training',
      detail: `${info.label} · ${by === 'rule' ? '수석코치가 정함' : by === 'order' ? '구단주 지시' : '구단주 제안'}`,
    },
    {
      key: 'investment',
      label: '선수단 투자',
      value: effects.developmentMultiplier,
      applies: 'all',
      home: 'business/strategy',
      detail: POLICY_INFO.support.levels[policy.support - 1].name,
    },
    {
      key: 'base',
      label: '감독 육성·훈련장',
      value: developmentBase(w),
      applies: 'all',
      home: 'business/facility',
      detail: `감독 육성 ${Math.round(w.manager.youth)} · 훈련장 ${w.trainingGround}단계`,
    },
    {
      key: 'style',
      label: '감독 학파',
      value: style.growth,
      applies: 'all',
      home: 'people/manager',
      detail: school,
    },
    {
      key: 'style-youth',
      label: '감독 학파',
      value: style.youthGrowth,
      applies: 'u21',
      home: 'people/manager',
      detail: school,
    },
    {
      key: 'coaches-youth',
      label: '코치진',
      value: staff.youthDevelopment,
      applies: 'u21',
      home: 'people/coaches',
      detail: developers.length
        ? `${STAFF_TRAIT_INFO.developer.label} ${developers.join('·')}`
        : `${STAFF_TRAIT_INFO.developer.label} 코치 없음`,
    },
    {
      key: 'build-youth',
      label: '방향',
      value: buildEffects(w).youthGrowth,
      applies: 'u21',
      home: 'business/strategy',
      // 데뷔 시점 빠른 데뷔 lifts the same growth (→CLUB-32).
      detail:
        [...youthCards, ...(w.direction?.debut === 'early' ? ['데뷔 시점 빠른 데뷔'] : [])].join(
          ' · ',
        ) || '21세 이하 성장 카드 없음',
    },
  ];
  const growing: GrowingPlayer[] = activePlayers(w)
    .map((player) => {
      const ability = overall(player),
        potential = Math.round(player.potential);
      return {
        player,
        age: w.year - player.born,
        ability,
        potential,
        gap: potential - ability,
        developed: player.developed || 0,
      };
    })
    .filter((entry) => entry.age <= GROWING_AGE && entry.gap > 0)
    .sort((a, b) => b.gap - a.gap || compareIds(a.player.id, b.player.id));
  // One number for the owner: what a young player's base growth is multiplied by this round,
  // before each coach's per-skill multiplier.
  const combined = (applies: 'all' | 'u21') =>
    Math.round(
      factors
        .filter((factor) => factor.applies === 'all' || factor.applies === applies)
        .reduce((product, factor) => product * factor.value, 1) * 100,
    ) / 100;
  return {
    /** The growth factor in force for players aged 21 or under and for older ones (→WEB-70). */
    combined: { u21: combined('u21'), senior: combined('all') },
    focus: {
      focus,
      label: info.label,
      /** Who set it (→STAFF-19) and how many settled rounds an order or suggestion still holds. */
      by,
      rounds: order?.rounds ?? 0,
      developmentMultiplier: info.developmentMultiplier,
      /** Fatigue recovered at the next settled round, staff and policy bonuses included. */
      recovery: Math.max(0, info.recovery + effects.recoveryBonus + staff.recoveryBonus),
      /** What the squad investment and the fitness coach add to every focus's recovery. */
      recoveryBonus: effects.recoveryBonus + staff.recoveryBonus,
    },
    factors,
    /** Each coach's multiplier on the skills he owns, applied after the factors. */
    skills: { ...staff.development },
    growing,
  };
}
