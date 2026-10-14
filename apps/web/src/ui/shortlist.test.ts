import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import {
  createWorld,
  openShortlistWindow,
  seasonDayOf,
  transferOffers,
  transferWindowDays,
} from '../../../../packages/engine/src/index';
import { lineOf } from '../../../../packages/engine/src/player';
import { directorDecisions, requestName, requestStakes, shortlistRows } from './shortlist';

function club(seed = 'shortlist-ui') {
  return createWorld({
    country: 'ENG',
    name: 'Scout Town',
    color: '#224433',
    seed,
    level: 'easy' as const,
  });
}
/** Leaves `count` active goalkeepers, the others sold. */
function oneKeeper(w: World) {
  for (const p of w.players.filter((one) => one.position === 'GK').slice(1)) p.status = 'sold';
}

describe('스카우트 명단 and 감독 요청 on 이적시장 (→WEB-43, CLUB-33)', () => {
  it('groups the shortlist by role against the market list, the pick marked', () => {
    const w = club();
    oneKeeper(w);
    openShortlistWindow(w);
    const offers = transferOffers(w),
      rows = shortlistRows(w, offers);
    expect(rows.map((row) => row.line)).toEqual(['GK', 'DF', 'MF', 'FW']);
    expect(rows.flatMap((row) => row.entries.map(({ offer }) => offer.player.id))).toEqual(
      w.shortlist!.entries.map((entry) => entry.playerId),
    );
    for (const row of rows)
      for (const { index, offer } of row.entries) expect(offers[index]).toBe(offer);
    const keepers = rows[0];
    expect(keepers.request).toMatchObject({ line: 'GK', kind: 'short' });
    expect(
      keepers.entries.filter((entry) => entry.pick).map(({ offer }) => offer.player.id),
    ).toEqual([keepers.request!.pick]);
    // A player who joined drops off, and so does the pick on him.
    const joined = offers.map((offer) =>
      offer.player.id === keepers.request!.pick ? { ...offer, available: false } : offer,
    );
    const after = shortlistRows(w, joined)[0];
    expect(after.entries.some(({ offer }) => offer.player.id === keepers.request!.pick)).toBe(
      false,
    );
    expect(after.request!.pick).toBeUndefined();
    // Before the first draw, or from last season, there is nothing to show.
    expect(shortlistRows({ ...w, shortlist: undefined }, offers)).toEqual([]);
    expect(shortlistRows({ ...w, year: w.year + 1 }, offers)).toEqual([]);
  });

  it("says what the window's requests stand to cost while it is open", () => {
    const w = club();
    oneKeeper(w);
    openShortlistWindow(w);
    const roles = w.shortlist!.window!.requests.map(requestName);
    expect(roles[0]).toBe('골키퍼');
    expect(requestStakes(w)).toBe(
      `이적시장이 닫힐 때까지 ${roles.join('·')} 자리에 아무도 오지 않으면 감독 신뢰 −3`,
    );
    w.shortlist!.window!.met = true;
    expect(requestStakes(w)).toContain('감독 신뢰가 떨어지지 않아요');
    // Outside the window, or with no requests, it says nothing.
    w.calendar = { day: transferWindowDays(w.year).summerClose + 1 };
    expect(requestStakes(w)).toBeUndefined();
    const quiet = club();
    quiet.calendar = { day: seasonDayOf(quiet.year, 8, 2) };
    delete quiet.shortlist;
    expect(requestStakes(quiet)).toBeUndefined();
  });

  it('names what the 단장 decides at each level', () => {
    const at = (intervention: 1 | 2 | 3 | 4) =>
      directorDecisions({ intervention })
        .map(({ label, auto }) => `${label} ${auto ? '맡김' : '직접'}`)
        .join(' · ');
    expect(at(1)).toBe('재계약 협상 직접 · 감독 선임 직접 · 이적 직접');
    expect(at(2)).toBe('재계약 협상 맡김 · 감독 선임 직접 · 이적 직접');
    expect(at(3)).toBe('재계약 협상 맡김 · 감독 선임 맡김 · 이적 직접');
    expect(at(4)).toBe('재계약 협상 맡김 · 감독 선임 맡김 · 이적 맡김');
  });
});

describe('the shortlist by line and slot requests by position (→WEB-43, PLAYER-3)', () => {
  it('by line', () => {
    const w = club('shortlist-lines');
    openShortlistWindow(w);
    const rows = shortlistRows(w, transferOffers(w));
    // Each row holds the candidates whose main position is in its line.
    for (const row of rows)
      for (const { offer } of row.entries) expect(lineOf(offer.player.position)).toBe(row.line);
    expect(rows.reduce((sum, row) => sum + row.entries.length, 0)).toBe(
      w.shortlist!.entries.length,
    );
    // A line request reads as its line, a slot request as its position.
    expect(requestName({ line: 'DF' })).toBe('수비수');
    expect(requestName({ line: 'DF', position: 'CB' })).toBe('센터백');
  });
});
