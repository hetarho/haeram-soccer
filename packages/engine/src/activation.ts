import type { World } from '../../contracts/src/types';
import { BUILD_SLOTS } from '../../contracts/src/build';
import { buildPreset, cardOf } from './build';
import { pushInbox } from './inbox';
import { DIRECTION_INFO, DIRECTION_KEYS, directionOption } from './direction';

/** The first rules with the three levers' settings (→SAVE-10). */
const LEVERS_RULES = [1, 16, 0] as const;
/** The first rules with the direction rows in place of the staff criteria (→SAVE-10). */
const DIRECTION_RULES = [1, 17, 0] as const;
/** Whether engine version `version` (major.minor.patch) comes before `than`. */
function older(version: string, than: readonly number[]) {
  const parts = version.split('.').map(Number);
  for (let i = 0; i < than.length; i++) {
    const part = parts[i] ?? 0;
    if (part !== than[i]) return part < than[i];
  }
  return false;
}

/**
 * Activation of rules 1.16 for the owner's levers (→SAVE-10). `before` is the engine version the
 * world had before its rules were upgraded. A world from before 1.16 drops a strategy reserved for
 * the next season (`buildNext`), since strategies now apply at once, with an inbox item naming it.
 * Its staff switches already loaded as an intervention level. Pure on its input; returns `w`
 * itself when nothing changes.
 */
export function activateLevers(w: World, before: string): World {
  const reserved = w.buildNext;
  if (!older(before, LEVERS_RULES) || !reserved) return w;
  const next: World = { ...w };
  delete next.buildNext;
  const cards = BUILD_SLOTS.filter((slot) => reserved.build[slot]).map(
    (slot) => cardOf(reserved.build, slot).label,
  );
  const name =
    reserved.name ?? buildPreset(reserved.build)?.label ?? (cards.join(' · ') || '기본 방향');
  pushInbox(next, {
    kind: 'staff-report',
    title: `예약했던 방향 ‘${name}’ 취소`,
    detail: '방향은 이제 바로 적용돼요. 방향 탭에서 다시 고를 수 있어요.',
    attention: false,
  });
  return next;
}

/**
 * Activation of rules 1.17 (→SAVE-10): a world from before them loaded its talk rule and hiring
 * and manager criteria as the nearest direction rows; one inbox item names the rows it now
 * follows, so the owner can check them on the 방향 board. Pure on its input; returns `w` itself
 * when nothing changes.
 */
export function activateDirection(w: World, before: string): World {
  if (!older(before, DIRECTION_RULES)) return w;
  const next: World = { ...w };
  pushInbox(next, {
    kind: 'staff-report',
    title: '직원 기준이 방향의 줄로 바뀌었어요',
    detail: `${DIRECTION_KEYS.map((key) => `${DIRECTION_INFO[key].label} ${directionOption(w, key).name}`).join(' · ')} · 방향 탭에서 바꿀 수 있어요. 개입 3단계부터 후원·감독·코치진도 스태프가 맡아요.`,
    attention: false,
  });
  return next;
}
