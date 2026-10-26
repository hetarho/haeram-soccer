import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { dayCountedFrom, daysInSeason, seasonDayLabel } from './calendar';
import { assertTransferWindow, transferWindow, transferWindowDays } from './transfer-window';

/** Window queries need only the season and clock, with no generated clubs or players. */
const world = (year = 1950, day = 0) => ({ year, round: 0, calendar: { day } }) as World;

describe('transfer window calendar', () => {
  it('keeps the summer and winter boundaries on their existing season days', () => {
    expect(transferWindowDays(1950)).toEqual({
      summerOpen: 0,
      summerClose: 31,
      winterOpen: 153,
      winterClose: 184,
      seasonClose: 323,
    });
  });

  it.each([
    [0, true, 'summer', 31, 31, '여름 이적시장 · 9월 1일 마감 · D-31'],
    [31, true, 'summer', 31, 0, '여름 이적시장 · 9월 1일 마감 · D-day'],
    [32, false, 'winter', 153, 121, '이적시장 닫힘 · 1월 1일 개장 · D-121'],
    [152, false, 'winter', 153, 1, '이적시장 닫힘 · 1월 1일 개장 · D-1'],
    [153, true, 'winter', 184, 31, '겨울 이적시장 · 2월 1일 마감 · D-31'],
    [184, true, 'winter', 184, 0, '겨울 이적시장 · 2월 1일 마감 · D-day'],
    [185, false, 'summer', 323, 138, '이적시장 닫힘 · 시즌 종료 직후 개장 · D-138'],
    [322, false, 'summer', 323, 1, '이적시장 닫힘 · 시즌 종료 직후 개장 · D-1'],
    [323, false, 'summer', 323, 0, '이적시장 닫힘 · 시즌 종료 직후 개장 · D-day'],
    [324, false, 'summer', 324, 0, '이적시장 닫힘 · 시즌 종료 직후 개장 · D-day'],
  ] as const)(
    'reports the inclusive deadline or next opening on season day %s',
    (day, open, kind, until, daysLeft, label) => {
      expect(transferWindow(world(), day)).toEqual({ open, kind, until, daysLeft, label });
    },
  );

  it('reads the calendar by default, falls back to rounds and honors an explicit day', () => {
    const w = world(1950, 153);
    w.round = 10;
    expect(transferWindow(w)).toEqual(transferWindow(w, 153));
    expect(transferWindow(w, 31).label).toBe('여름 이적시장 · 9월 1일 마감 · D-day');
    delete w.calendar;
    expect(transferWindow(w)).toEqual({
      open: false,
      kind: 'winter',
      label: '이적시장 닫힘 · 1월 1일 개장 · D-83',
      until: 153,
      daysLeft: 83,
    });
  });

  it.each([0, 31, 32, 152, 153, 184, 185, 322, 323])(
    'allows free agents on day %s and requires an open window for fee-bearing moves',
    (day) => {
      const w = world(1950, day);
      const before = structuredClone(w);
      expect(() => assertTransferWindow(w, true)).not.toThrow();
      if (day <= 31 || (day >= 153 && day <= 184)) {
        expect(() => assertTransferWindow(w)).not.toThrow();
        expect(() => assertTransferWindow(w, false)).not.toThrow();
      } else {
        const closed = '이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.';
        expect(() => assertTransferWindow(w)).toThrow(closed);
        expect(() => assertTransferWindow(w, false)).toThrow(closed);
      }
      expect(w).toEqual(before);
    },
  );

  it.each([
    [1902, 365, '1903년 6월 20일'],
    [1903, 366, '1904년 6월 19일'],
    [1999, 366, '2000년 6월 19일'],
    [2099, 365, '2100년 6월 20일'],
  ] as const)(
    'preserves the Gregorian dates and bid day offsets across season %s',
    (year, length, closingDate) => {
      const d = transferWindowDays(year);
      expect(daysInSeason(year)).toBe(length);
      expect(d).toEqual({
        summerOpen: 0,
        summerClose: 31,
        winterOpen: 153,
        winterClose: 184,
        seasonClose: 323,
      });
      expect(seasonDayLabel(year, d.summerOpen)).toBe(`${year}년 8월 1일`);
      expect(seasonDayLabel(year, d.summerClose)).toBe(`${year}년 9월 1일`);
      expect(seasonDayLabel(year, d.winterOpen)).toBe(`${year + 1}년 1월 1일`);
      expect(seasonDayLabel(year, d.winterClose)).toBe(`${year + 1}년 2월 1일`);
      expect(seasonDayLabel(year, d.seasonClose)).toBe(closingDate);
      expect(transferWindow(world(year, d.winterClose)).open).toBe(true);
      expect(transferWindow(world(year, d.winterClose + 1)).open).toBe(false);
      expect(transferWindow(world(year, d.seasonClose - 1))).toMatchObject({
        open: false,
        kind: 'summer',
        daysLeft: 1,
      });
      expect(transferWindow(world(year, d.seasonClose))).toMatchObject({
        open: false,
        daysLeft: 0,
      });
      const next = world(year + 1);
      expect(transferWindow(next)).toMatchObject({ open: true, kind: 'summer', daysLeft: 31 });
      expect(dayCountedFrom(next, year)).toBe(length);
      next.calendar!.day = 3;
      expect(dayCountedFrom(next, year)).toBe(length + 3);
      expect(dayCountedFrom(next, year + 1)).toBe(3);
    },
  );

  it('counts bid days across multiple seasons with the shared calendar helper', () => {
    const w = world(1905, 7);
    expect(dayCountedFrom(w, 1902)).toBe(365 + 366 + 365 + 7);
    delete w.calendar;
    w.round = 2;
    expect(dayCountedFrom(w, 1902)).toBe(365 + 366 + 365 + 14);
  });
});
