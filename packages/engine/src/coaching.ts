import { integer, random } from './primitives';

/**
 * Careers of managers and coaches (→STAFF-16). A coach younger than his prime is still learning:
 * he starts below the level he will reach and closes part of the gap every season, so a young
 * candidate is a bet on his potential. From 60 he fades a little each season.
 */
export interface CoachProspect {
  age: number;
  ability: number;
  potential: number;
}
/**
 * Age, current ability and ceiling of a coach first met this season, from his own stream so his
 * other attributes stay put. `peak` is the level drawn for him; below `prime` the current level
 * sits 0.7 a year under it (unless `learning` is off) and the ceiling rises up to 1.1 a year above.
 */
export function coachProspect(
  key: string,
  peak: number,
  ages: readonly [number, number],
  prime: number,
  learning = true,
): CoachProspect {
  const r = random(key);
  const age = integer(r, ages[0], ages[1]),
    room = Math.max(0, prime - age),
    ability = Math.max(20, Math.round(peak - (learning ? room * 0.7 : 0))),
    potential = Math.min(95, Math.round(peak + room * (0.2 + r() * 0.9)));
  return { age, ability, potential: Math.max(ability, potential) };
}
/** One season of a coach's career: below his ceiling he gains 15–40% of the gap, from 60 he fades. */
export function coachSeason(key: string, ability: number, potential: number, age: number) {
  const r = random(key);
  if (age >= 60) {
    const loss = integer(r, 0, 2);
    return { ability: Math.max(20, ability - loss), potential: Math.max(20, potential - loss) };
  }
  if (ability >= potential) return { ability, potential };
  const gap = potential - ability,
    gain = Math.min(gap, Math.max(1, Math.round(gap * (0.15 + r() * 0.25))));
  return { ability: ability + gain, potential };
}
/** Managers are hired from 32 to 64, reach their prime at 46 and retire at 70. */
export const MANAGER_CAREER = { ages: [32, 64] as const, prime: 46, retire: 70 };
/** Coaches are hired from 25 to 62 and reach their prime at 42. */
export const COACH_CAREER = { ages: [25, 62] as const, prime: 42 };
