import { message as sourceMessage } from '../../contracts/src/messages';
import type { World } from '../../contracts/src/types';
import { currentDay, SEASON_END_DAY, seasonDayOf } from './calendar';

export const WINDOW_INFO = {
  summer: {
    name: sourceMessage('copy.transfer_window.7da140dfca'),
    deadline: sourceMessage('copy.transfer_window.818a560979'),
    opening: sourceMessage('copy.transfer_window.da4fa9163f'),
  },
  winter: {
    name: sourceMessage('copy.transfer_window.86410a0228'),
    deadline: sourceMessage('copy.transfer_window.abc1dceb43'),
    opening: sourceMessage('copy.transfer_window.d6954fcad2'),
  },
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
    label: sourceMessage('copy.transfer_window.d747cf5ede', {
      p0: WINDOW_INFO[kind].name,
      p1: WINDOW_INFO[kind].deadline,
      p2: dLabel(until - day),
    }),
    until,
    daysLeft: until - day,
  });
  const closed = (kind: 'summer' | 'winter', until: number): TransferWindowState => ({
    open: false,
    kind,
    label: sourceMessage('copy.transfer_window.866b1c742e', {
      p0: WINDOW_INFO[kind].opening,
      p1: dLabel(until - day),
    }),
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
    throw new Error(sourceMessage('copy.transfer_window.3614ce9700'));
}
