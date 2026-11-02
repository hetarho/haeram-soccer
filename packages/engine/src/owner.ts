/**
 * The owner's own money and career (→OWNER): the business bet and living costs at each settlement,
 * injections, the season-close dividend, his bankruptcy and the end of a career. The day loop calls
 * these hooks; each returns at once in a career without an owner (a founded club), so founding
 * careers live exactly as before.
 */
import type { CareerDate, Command, World } from '../../contracts/src/types';

/** Refusal of an owner command while the career has no owner state. */
export const OWNER_PENDING_MESSAGE = '구단주 기능은 아직 준비 중입니다';
/** Refusal of every command but reading the inbox once the career has ended (→OWNER-16). */
export const ENDED_MESSAGE = '구단 운영이 끝났어요. 기록을 내보내거나 새 게임을 시작하세요.';

export type OwnerCommand = Extract<
  Command,
  { type: 'owner-stake' | 'owner-inject' | 'owner-dividend' }
>;

/**
 * Whether a club is anyone's yet: false only in the world before the takeover, which nobody owns
 * (→WORLD-13); true in every career, founded or taken over. Own-club branches check this, never
 * `w.playerClub` directly.
 */
export function hasOwner(w: Pick<World, 'playerClub'>) {
  return w.playerClub !== '';
}
/**
 * Whether the career is over (→OWNER-16, ECON-24): the club's bankruptcy, the owner's or 구단주
 * 퇴진. Nothing advances after it and only the inbox can be read.
 */
export function careerEnded(w: Pick<World, 'bankrupt' | 'ended'>) {
  return w.bankrupt !== undefined || w.ended !== undefined;
}

/** The owner's commands: the stake, an injection and the dividend dial (→OWNER-7/9/11). */
export function ownerCommand(w: World, cmd: OwnerCommand) {
  if (!w.owner) throw new Error(OWNER_PENDING_MESSAGE);
  // The stake, injections and the dividend dial do not settle yet: each still waits.
  void cmd;
  throw new Error(OWNER_PENDING_MESSAGE);
}

/** A day's owner business, from `clubDay`: a business settlement on its date (→OWNER-7/8). */
export function ownerDay(w: World) {
  if (!w.owner) return;
}

/**
 * The owner's season close, from `closeSeason` once the season's money is in and before its
 * archive: the close-day settlement, the dividend and the crisis checks (→OWNER-7/8/11/14).
 */
export function ownerClose(w: World) {
  if (!w.owner) return;
}

/**
 * Every settlement on the days a calendar jump skips (the war, →WORLD-14), after `fromDay` up to
 * and including `toDay`, as each would have settled (→OWNER-7/8).
 */
export function ownerSettleGap(w: World, fromDay: CareerDate, toDay: CareerDate) {
  if (!w.owner) return;
  void fromDay;
  void toDay;
}
