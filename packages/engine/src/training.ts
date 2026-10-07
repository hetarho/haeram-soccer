import type { Player, Role, TrainingFocus, World } from '../../contracts/src/types';
import { activePlayers, addEvent, overall } from './world';
import { clamp, compareIds, random } from './primitives';

export const trainingFocusInfo: Record<
  TrainingFocus,
  { label: string; description: string; recovery: number; developmentMultiplier: number }
> = {
  balanced: {
    label: '균형 훈련',
    description: '성장과 회복을 함께 · 라운드마다 피로 8 회복',
    recovery: 8,
    developmentMultiplier: 1,
  },
  youth: {
    label: '유망주 집중',
    description: '27세 미만 선수 성장 1.8배 · 피로 회복은 4',
    recovery: 4,
    developmentMultiplier: 1.8,
  },
  recovery: {
    label: '회복 집중',
    description: '피로 13 회복 · 라운드 훈련 성장은 쉬어갑니다',
    recovery: 13,
    developmentMultiplier: 0,
  },
};

type Skill = 'attack' | 'passing' | 'defense' | 'keeper' | 'stamina';
const roleSkills: Record<Role, readonly Skill[]> = {
  GK: ['keeper'],
  DEF: ['defense', 'stamina'],
  MID: ['passing', 'stamina'],
  FWD: ['attack', 'stamina'],
};
const hundredths = (value: number) => Math.round(value * 100) / 100;

function skillAfter(player: Player, skill: Skill, change: number) {
  const current = player[skill];
  if (change === 0) return current;
  const next = hundredths(current + hundredths(change));
  return change >= 0
    ? Math.max(current, Math.min(Math.max(current, player.potential), next))
    : clamp(next, 5, 100);
}

function recordDevelopment(player: Player, gain: number) {
  if (gain <= 0) return;
  player.developed = hundredths(Math.min(500, (player.developed || 0) + gain));
}

function roundGain(w: World, player: Player) {
  const age = w.year - player.born;
  if (age >= 27 || player.status !== 'active') return 0;
  const gap = Math.max(0, player.potential - overall(player));
  const ageWeight = age < 21 ? 1 : age < 24 ? 0.85 : 0.65;
  const base = Math.min(
    0.12,
    (gap / 400) * (0.5 + w.manager.youth / 100 + w.facilities / 40) * ageWeight,
  );
  return hundredths(base * trainingFocusInfo[w.training || 'balanced'].developmentMultiplier);
}

function actualRoundGain(w: World, player: Player) {
  const gain = roundGain(w, player),
    skills = roleSkills[player.role];
  return hundredths(
    skills.reduce((sum, skill) => sum + skillAfter(player, skill, gain) - player[skill], 0) /
      skills.length,
  );
}

export function setTrainingFocus(w: World, focus: TrainingFocus) {
  if (!Object.hasOwn(trainingFocusInfo, focus)) throw new Error('훈련 계획을 확인하세요.');
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
  const info = trainingFocusInfo[w.training || 'balanced'];
  for (const player of activePlayers(w)) {
    const gain = roundGain(w, player),
      skills = roleSkills[player.role];
    let actual = 0;
    for (const skill of skills) {
      const next = skillAfter(player, skill, gain);
      actual += next - player[skill];
      player[skill] = next;
    }
    recordDevelopment(player, actual / skills.length);
    player.fatigue = Math.max(0, player.fatigue - info.recovery);
  }
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
}

/** Pure read model; projected gain is not awarded by viewing or selecting a plan. */
export function trainingSummary(w: World) {
  const active = activePlayers(w),
    focus = w.training || 'balanced';
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
