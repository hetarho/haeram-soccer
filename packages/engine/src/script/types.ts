import type { ScriptBeat } from '../../../contracts/src/match-script';
export type {
  ScriptBeat as Beat,
  ScriptBeatKind as BeatKind,
  ScriptBeatOutcome as BeatOutcome,
  ScriptPhase as Phase,
  ScriptSide as TeamId,
  ScriptPoint as Vec,
  MatchScript as Script,
} from '../../../contracts/src/match-script';
export const PASS_KINDS = ['kickOff', 'pass', 'throwIn', 'goalKick', 'corner', 'freeKick'] as const;
export const RESTART_KINDS = ['kickOff', 'throwIn', 'goalKick', 'corner', 'freeKick'] as const;
export const isRestartKind = (k: ScriptBeat['kind']) => RESTART_KINDS.some((x) => x === k);
export const isPassLike = (k: ScriptBeat['kind']) => PASS_KINDS.some((x) => x === k);
