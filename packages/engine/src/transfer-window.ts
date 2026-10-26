import type { World } from '../../contracts/src/types';
import { currentDay, SEASON_END_DAY, seasonDayOf } from './calendar';

export const WINDOW_INFO = {
  summer: { name: '여름 이적시장', deadline: '9월 1일', opening: '시즌 종료 직후' },
  winter: { name: '겨울 이적시장', deadline: '2월 1일', opening: '1월 1일' },
} as const;

export interface TransferWindowState {
  open: boolean;
  /** The current window while open, or the next window to open while closed. */
  kind?: 'summer' | 'winter';
  label: string;
  /** Season day of the deadline while open, or of the next opening while closed. */
  until?: number;
  daysLeft?: number;
}
/** Season days of each window boundary; no window spans the season rollover. */
export function transferWindowDays(year: number) {
  return {
    /** The summer window opens on the first day of the season that follows the final round. */
    summerOpen: 0,
    summerClose: seasonDayOf(year, 9, 1),
    winterOpen: seasonDayOf(year, 1, 1),
    winterClose: seasonDayOf(year, 2, 1),
    /** The day this season closes, when the next summer window opens. */
    seasonClose: SEASON_END_DAY + 1,
  };
}
const dLabel = (days: number) => (days === 0 ? 'D-day' : `D-${days}`);
/** Summer from the season close to 1 September and winter 1 January–1 February. */
export function transferWindow(w: World, day = currentDay(w)): TransferWindowState {
  const d = transferWindowDays(w.year);
  const open = (kind: 'summer' | 'winter', until: number): TransferWindowState => ({
    open: true,
    kind,
    label: `${WINDOW_INFO[kind].name} · ${WINDOW_INFO[kind].deadline} 마감 · ${dLabel(until - day)}`,
    until,
    daysLeft: until - day,
  });
  const closed = (kind: 'summer' | 'winter', until: number): TransferWindowState => ({
    open: false,
    kind,
    label: `이적시장 닫힘 · ${WINDOW_INFO[kind].opening} 개장 · ${dLabel(until - day)}`,
    until,
    daysLeft: until - day,
  });
  if (day <= d.summerClose) return open('summer', d.summerClose);
  if (day < d.winterOpen) return closed('winter', d.winterOpen);
  if (day <= d.winterClose) return open('winter', d.winterClose);
  // Season orchestration rolls the world to next-year day 0 before summer opens.
  return closed('summer', Math.max(day, d.seasonClose));
}
/** Fee-bearing moves need an open window; free agents sign at any time. */
export function assertTransferWindow(w: World, freeAgent = false): void {
  if (!freeAgent && !transferWindow(w).open)
    throw new Error('이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.');
}
