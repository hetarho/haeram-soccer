import { message as sourceMessage } from '../../contracts/src/messages';
import type {
  Player,
  TrainingCoach,
  TrainingFocus,
  World,
  YouthFocus,
} from '../../contracts/src/types';
import { autoPlayerFocus, autoTrainingAdvice } from './staff';
import { activeTrainingFocus, trainingFocusInfo } from './training';
import { YOUTH_FOCUS_INFO, youthAdvice } from './academy';

type Focus = TrainingFocus | YouthFocus;

/** A focus's name for the coach who sets it. */
export function focusLabel(coach: TrainingCoach, focus: Focus) {
  return coach === 'assistant'
    ? trainingFocusInfo[focus as TrainingFocus].label
    : YOUTH_FOCUS_INFO[focus as YouthFocus].label;
}
/**
 * The focus the coach sets by his rule for the first team (assistant) or the academy (youth
 * director), and why (→CLUB-13, CLUB-31).
 */
export function trainingCall(w: World, coach: TrainingCoach): { focus: Focus; reason: string } {
  return coach === 'assistant' ? autoTrainingAdvice(w) : youthAdvice(w);
}
/**
 * One first-team player's focus and why (→CLUB-11, CLUB-13): his player rule, else the squad's
 * focus, `own` when the rule takes him off it; `squad` is the squad's focus when the caller already
 * has it.
 */
export function playerTrainingCall(
  w: World,
  p: Player,
  squad?: TrainingFocus,
): { focus: TrainingFocus; own: boolean; reason: string } {
  const own = autoPlayerFocus(w, p);
  if (own)
    return {
      focus: own,
      own: true,
      reason: sourceMessage('copy.coach_training.210696eb93', { p0: Math.round(p.fatigue) }),
    };
  squad ??= activeTrainingFocus(w);
  return {
    focus: squad,
    own: false,
    reason: sourceMessage('copy.coach_training.9b087192fc', { p0: trainingFocusInfo[squad].label }),
  };
}
