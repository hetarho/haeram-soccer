import type { World } from '../../contracts/src/types';
import { BUILD_SLOTS } from '../../contracts/src/build';
import { buildPreset, cardOf } from './build';
import { pushInbox } from './inbox';
import { POLICY_INFO, policyOf } from './policy';
import { DIRECTION_INFO, DIRECTION_KEYS, directionOption } from './direction';
import { STAFF_INFO, volunteer } from './staff';

/** The first rules with the three levers' settings (→SAVE-10). */
const LEVERS_RULES = [1, 16, 0] as const;
/** The first rules with the direction rows in place of the staff criteria (→SAVE-10). */
const DIRECTION_RULES = [1, 17, 0] as const;
/** The first rules with the 지역 and 글로벌 rows in place of marketing (→SAVE-10). */
const BASES_RULES = [1, 19, 0] as const;
/** The first rules with the 단장 post (→SAVE-10, →STAFF-20). */
const DIRECTOR_RULES = [1, 22, 0] as const;
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

/**
 * Activation of rules 1.19 (→SAVE-10): a world from before them loaded its marketing level as
 * 해외 마케팅 and lost the 글로벌 브랜드 card; one inbox item names the move and that campaigns are
 * no more. Pure on its input; returns `w` itself when nothing changes.
 */
export function activateBases(w: World, before: string): World {
  if (!older(before, BASES_RULES)) return w;
  const next: World = { ...w };
  const level = policyOf(w).globalMarketing;
  pushInbox(next, {
    kind: 'staff-report',
    title: '마케팅이 지역·글로벌 부문으로 옮겨졌어요',
    detail: `해외 마케팅 ${POLICY_INFO.globalMarketing.levels[level - 1].name} · 주변 투자와 풀뿌리 유망주 투자로 지역 기반을, 해외 마케팅과 해외 스카우트망으로 글로벌 인지도를 키워요. 캠페인은 더 이상 시작하지 않아요. 방향 탭에서 바꿀 수 있어요.`,
    attention: false,
  });
  return next;
}

/**
 * Activation of rules 1.22 (→SAVE-10, →STAFF-20): a club from before them gets its 단장. A
 * negotiator chief scout moves to the post with his id, wage and contract, a volunteer taking the
 * scout's; otherwise an unpaid ability-50 volunteer takes it. One inbox item names who. A world
 * without staff (rules before 1.2) stays neutral without one. Pure on its input; returns `w`
 * itself when nothing changes.
 */
export function activateDirector(w: World, before: string): World {
  if (!older(before, DIRECTOR_RULES) || !w.staff || w.staff.some((s) => s.role === 'director'))
    return w;
  const next: World = { ...w },
    scout = w.staff.find((member) => member.role === 'scout'),
    moved = scout?.trait === 'negotiator';
  const director = moved ? { ...scout, role: 'director' as const } : volunteer(w, 'director');
  next.staff = [
    director,
    ...w.staff.map((member) => (moved && member === scout ? volunteer(w, 'scout') : member)),
  ];
  pushInbox(next, {
    kind: 'staff-report',
    title: `${STAFF_INFO.director.label} ${director.name} 부임`,
    detail: moved
      ? '협상가였던 수석 스카우트가 계약 그대로 단장을 맡고, 수석 스카우트 자리는 무급 코치가 지켜요. 단장은 이적 협상을 맡고, 개입 수준이 맡기면 선수 계약·감독 선임·이적을 결정해요.'
      : '무급 단장(능력 50)이 자리를 맡았어요. 단장은 이적 협상을 맡고, 개입 수준이 맡기면 선수 계약·감독 선임·이적을 결정해요. 코치진에서 단장을 선임할 수 있어요.',
    attention: false,
  });
  return next;
}
