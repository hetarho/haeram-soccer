import type { World } from '../../contracts/src/types';
import { advanceDays } from './season';
import { pendingDecisions, stoppingReasons } from './stopping';
import { settingsOf, validateSettings } from './responsibilities';

export function assertNextEvent(w: World) {
  const settings = validateSettings(settingsOf(w));
  if (settings.mode !== 'manual')
    throw new Error('다음 이벤트는 수동 모드에서만 사용할 수 있어요.');
  if (w.critical || w.bankrupt) throw new Error('중요한 구단 상태를 먼저 확인하세요.');
  if (pendingDecisions(w).length) throw new Error('먼저 대기 중인 결정을 처리하세요.');
}
/** Each yield is a fully settled day, for internal worker responsiveness only. */
export function* nextEventDays(w: World): Generator<void> {
  assertNextEvent(w);
  // An explicit click consumes the current observation, never an outstanding business decision.
  do {
    advanceDays(w, 1, undefined, false);
    yield;
  } while (!w.critical && !w.bankrupt && !stoppingReasons(w).length);
}
export function advanceToNextEvent(w: World) {
  for (const day of nextEventDays(w)) void day;
  return stoppingReasons(w);
}
