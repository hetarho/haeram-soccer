import type { Player, Role, TrainingFocus, World } from '../../contracts/src/types';
import { activePlayers, addEvent, overall } from './world';
import { clamp, compareIds, random } from './primitives';
import { policyEffects, policyOf } from './policy';
import { autoTrainingFocus, staffEffects } from './staff';
import { developAcademy } from './academy';
import { settleMorale } from './morale';
import { managerStyleEffects } from './styles';
import { buildEffects } from './build';

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
  youth: {
    label: '유망주 집중',
    description: '27세 미만 선수 성장 1.8배 · 피로 회복은 7',
    recovery: 7,
    developmentMultiplier: 1.8,
  },
  recovery: {
    label: '회복 집중',
    description: '피로 16 회복 · 라운드 훈련 성장은 쉬어갑니다',
    recovery: 16,
    developmentMultiplier: 0,
  },
};

type Skill = 'attack' | 'passing' | 'defense' | 'keeper' | 'stamina';
/** Skills each role trains; the academy grows prospects the same way. */
export const roleSkills: Record<Role, readonly Skill[]> = {
  GK: ['keeper'],
  DEF: ['defense', 'stamina'],
  MID: ['passing', 'stamina'],
  FWD: ['attack', 'stamina'],
};
const hundredths = (value: number) => Math.round(value * 100) / 100;

export function skillAfter(player: Player, skill: Skill, change: number) {
  const current = player[skill];
  if (change === 0) return current;
  const next = hundredths(current + hundredths(change));
  return change >= 0
    ? Math.max(current, Math.min(Math.max(current, player.potential), next))
    : clamp(next, 5, 100);
}

export function recordDevelopment(player: Player, gain: number) {
  if (gain <= 0) return;
  player.developed = hundredths(Math.min(500, (player.developed || 0) + gain));
}

/** The focus in force: the assistant's choice while training is delegated, else the owner's. */
export function activeTrainingFocus(w: World): TrainingFocus {
  return w.delegation?.training ? autoTrainingFocus(w) : w.training || 'balanced';
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
  const gap = Math.max(0, player.potential - overall(player));
  const ageWeight = age < 21 ? 1 : age < 24 ? 0.85 : 0.65;
  const base = Math.min(
    0.12,
    // Twenty facility levels give the same top bonus thirty used to (→ECON-12).
    (gap / 400) * (0.5 + w.manager.youth / 100 + w.facilities / 27) * ageWeight,
  );
  const style = managerStyleEffects(w);
  return hundredths(
    base *
      trainingFocusInfo[focus].developmentMultiplier *
      policy.developmentMultiplier *
      style.growth *
      (age <= 21 ? staff.youthDevelopment * style.youthGrowth * buildEffects(w).youthGrowth : 1),
  );
}
/** Each coach scales growth of the skills they own. */
function skillGain(gain: number, skill: Skill, staff: ReturnType<typeof staffEffects>) {
  return staff.development[skill] === 1 ? gain : hundredths(gain * staff.development[skill]);
}

function actualRoundGain(w: World, player: Player) {
  const staff = staffEffects(w),
    gain = roundGain(w, player, undefined, staff),
    skills = roleSkills[player.role];
  return hundredths(
    skills.reduce(
      (sum, skill) =>
        sum + skillAfter(player, skill, skillGain(gain, skill, staff)) - player[skill],
      0,
    ) / skills.length,
  );
}

export function setTrainingFocus(w: World, focus: TrainingFocus) {
  if (!Object.hasOwn(trainingFocusInfo, focus)) throw new Error('훈련 계획을 확인하세요.');
  // An explicit owner choice takes training back from the staff.
  if (w.delegation?.training) w.delegation = { ...w.delegation, training: false };
  if (w.training === focus) return;
  w.training = focus;
  addEvent(
    w,
    'training-focus',
    `${trainingFocusInfo[focus].label} 시작`,
    '다음 라운드부터 적용 · 선택만으로 선수 능력이나 피로가 바뀌지 않습니다.',
  );
}

/** A domestic boundary settles growth and recovery once, even after changing focus or reloading. */
export function settleTraining(w: World) {
  if (w.round <= 0) return;
  const at = `${w.year}:${w.round}`;
  if (w.trainingAt === at) return;
  // Decided once per round: recovering earlier players must not flip later players' focus.
  const focus = activeTrainingFocus(w),
    info = trainingFocusInfo[focus],
    policy = policyEffects(policyOf(w)),
    staff = staffEffects(w),
    recovery = Math.max(0, info.recovery + policy.recoveryBonus + staff.recoveryBonus);
  for (const player of activePlayers(w)) {
    const gain = roundGain(w, player, policy, staff, focus),
      skills = roleSkills[player.role];
    let actual = 0;
    for (const skill of skills) {
      const next = skillAfter(player, skill, skillGain(gain, skill, staff));
      actual += next - player[skill];
      player[skill] = next;
    }
    recordDevelopment(player, actual / skills.length);
    player.fatigue = Math.max(0, player.fatigue - recovery);
  }
  developAcademy(w);
  settleMorale(w);
  w.trainingAt = at;
}

/** Annual progression retains seeded variation/aging but uses the player's own potential gap. */
export function developAnnually(w: World, player: Player) {
  const age = w.year - player.born,
    gap = Math.max(0, player.potential - overall(player)),
    variation = random(`${w.seed}:growth:${player.id}:${w.year}`);
  const growth =
    age < 27
      ? Math.min(3, gap / 20 + w.manager.youth / 100 + w.facilities / 4)
      : age > 30
        ? -1.5
        : 0.3;
  let actual = 0;
  for (const skill of ['attack', 'passing', 'defense', 'keeper', 'stamina'] as const) {
    const change = growth + variation() - 0.5;
    const next = skillAfter(player, skill, age < 27 ? Math.max(0, change) : change);
    if (roleSkills[player.role].includes(skill)) actual += Math.max(0, next - player[skill]);
    player[skill] = next;
  }
  recordDevelopment(player, actual / roleSkills[player.role].length);
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
    (player) =>
      w.year - player.born < 27 &&
      player.potential > overall(player) &&
      roleSkills[player.role].some((skill) => player[skill] < player.potential),
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
      })),
  };
}
