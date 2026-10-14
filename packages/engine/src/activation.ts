import type { World } from '../../contracts/src/types';
import { BUILD_SLOTS } from '../../contracts/src/build';
import { buildPreset, cardOf } from './build';
import { pushInbox } from './inbox';

/** The first rules with the three levers' settings (→SAVE-10). */
const LEVERS_RULES = [1, 16, 0] as const;
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
