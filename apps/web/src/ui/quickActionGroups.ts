import type { TrainingCoach, TrainingFocus, World } from '../../../../packages/contracts/src/types';
import {
  careRequest,
  placeAcademy,
  placeTraining,
  remedies,
  teamStates,
  type Remedy,
  type StateKey,
  type Tone,
} from './teamState';

export type QuickGroupKey = 'morale' | 'fatigue' | 'development';

/** The first team's focus as its small tile can hold it. */
const FOCUS_SHORT: Record<TrainingFocus, string> = {
  balanced: '균형',
  recovery: '회복',
  hard: '하드',
};

/** One topic of the clubhouse's quick actions: its tile's figure and every choice it runs. */
export interface QuickGroup {
  key: QuickGroupKey;
  label: string;
  /** The sheet's title. */
  title: string;
  /** The figure these choices move, as its tile shows it. */
  value: string;
  status: string;
  tone: Tone;
  /** A state these choices answer needs the owner now. */
  warning: boolean;
  /** The current state on the sheet's ticket, and what it means. */
  facts: string;
  text: string;
  /** Requests and commands run where they stand; `coach` opens that coach's training sheet. */
  actions: Remedy[];
}

/** A coach's training sheet over the clubhouse: suggest or force a focus for the next rounds. */
function order(w: World, coach: TrainingCoach): Remedy {
  const plan = placeTraining(w, coach);
  return {
    id: `order-${coach}`,
    label: coach === 'youth' ? '유소년 훈련 방향 제안·강행' : '1군 훈련 방향 제안·강행',
    by: plan.role,
    effect: `지금 ${plan.focus} · 받아들이면 ${plan.duration}라운드 유지 · 강행 시 사임 확률 ${Math.round(plan.risk * 100)}%${plan.wait > 0 ? ` · 재제안 ${plan.wait}라운드 후` : ''}`,
    cost: '무료',
    unavailable: plan.unavailable,
    coach: { coach },
  };
}

/**
 * The clubhouse's quick actions (→WEB-11), grouped by what they move: the dressing room's mood
 * and the manager's standing, the starters' fatigue, and training and youth. Only choices that
 * act on the spot belong here; views and moves to other places live in the owner's office.
 */
export function quickGroups(w: World): QuickGroup[] {
  const states = teamStates(w);
  const state = (key: StateKey) => states.find((item) => item.key === key)!;
  const morale = state('morale'),
    manager = state('manager'),
    fatigue = state('fatigue'),
    squad = state('squad');
  const fatigueChoices = remedies(w, 'fatigue');
  const pick = (choices: Remedy[], id: string) => choices.find((choice) => choice.id === id)!;
  const training = placeTraining(w, 'assistant');
  const ready = placeAcademy(w).players.filter((prospect) => !prospect.promotionUnavailable);
  return [
    {
      key: 'morale',
      label: '분위기',
      title: '분위기·감독 신뢰',
      value: morale.value,
      status: morale.status,
      tone: morale.tone,
      warning: !!(morale.advice || manager.advice),
      facts: `분위기 ${morale.value} · ${morale.status} · 감독 입지 ${manager.value} · ${manager.status}`,
      text:
        [morale.advice?.text, manager.advice?.text].filter(Boolean).join(' ') ||
        '선수단 분위기와 감독 신뢰를 움직이는 요청이에요. 결과는 아래 확률대로 정해져요.',
      actions: [
        careRequest(w, 'meeting'),
        careRequest(w, 'bonding'),
        careRequest(w, 'win-bonus'),
        careRequest(w, 'owner-visit'),
        careRequest(w, 'backing'),
      ],
    },
    {
      key: 'fatigue',
      label: '피로',
      title: '피로 관리',
      value: fatigue.value,
      status: fatigue.status,
      tone: fatigue.tone,
      warning: !!fatigue.advice,
      facts: `선발 평균 피로 ${fatigue.value} · ${fatigue.status}`,
      text: fatigue.advice?.text ?? '선발의 피로를 덜거나, 피로를 감수하고 수입을 버는 선택이에요.',
      actions: [
        pick(fatigueChoices, 'rest-lineup'),
        { ...pick(fatigueChoices, 'recovery-training'), page: undefined },
        careRequest(w, 'rest-day'),
        careRequest(w, 'recovery'),
        careRequest(w, 'camp'),
        careRequest(w, 'friendly'),
      ],
    },
    {
      key: 'development',
      label: '훈련·육성',
      title: '훈련·육성',
      value: FOCUS_SHORT[training.call.focus as TrainingFocus],
      status: `승격 후보 ${ready.length}명`,
      tone: squad.advice ? squad.tone : 'ok',
      warning: !!squad.advice,
      facts: `1군 ${training.focus} · ${training.call.reason} · 승격 후보 ${ready.length}명`,
      text:
        squad.advice?.text ??
        '코치에게 훈련 방향을 제안하거나 강행하고, 준비된 유망주를 1군에 올려요.',
      actions: [order(w, 'assistant'), order(w, 'youth'), pick(remedies(w, 'squad'), 'promote')],
    },
  ];
}
