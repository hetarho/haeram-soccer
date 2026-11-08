import { describe, expect, it } from 'vitest';
import { holdRows, staffAuthority } from '../../../../../../packages/engine/src/testing';
import type { World } from '../../../../../../packages/contracts/src/types';
import {
  openShortlistWindow,
  seasonDayOf,
  transferOffers,
  transferWindowDays,
} from '../../../../../../packages/engine/src/index';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { lineOf } from '../../../../../../packages/engine/src/player';
import {
  candidateOrigin,
  directorDecisions,
  requestName,
  requestStakes,
  shortlistRows,
} from './shortlist';

function club(seed = 'shortlist-ui') {
  return careerWorld({ country: 'ENG', seed });
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

  it('names what the 단장 decides under the settings in force', () => {
    const at = (step: 1 | 2 | 3 | 4) =>
      directorDecisions({ settings: staffAuthority(step) })
        .map(({ label, auto }) => `${label} ${auto ? '맡김' : '직접'}`)
        .join(' · ');
    expect(at(1)).toBe('재계약 협상 직접 · 감독 선임 직접 · 선수 영입 직접 · 선수 매각 직접');
    expect(at(2)).toBe('재계약 협상 맡김 · 감독 선임 직접 · 선수 영입 직접 · 선수 매각 직접');
    expect(at(3)).toBe('재계약 협상 맡김 · 감독 선임 맡김 · 선수 영입 직접 · 선수 매각 직접');
    expect(at(4)).toBe('재계약 협상 맡김 · 감독 선임 맡김 · 선수 영입 맡김 · 선수 매각 맡김');
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

describe('where a market candidate is (→CLUB-50, CLUB-51)', () => {
  it("reads a scout's find: a free agent with no fee, or his club at its asking fee", () => {
    expect(candidateOrigin({ source: { kind: 'free' }, fee: '0', foreign: false })).toEqual({
      kind: 'free',
      abroad: false,
    });
    expect(
      candidateOrigin({ source: { kind: 'club', club: 'ESP-0-0-3' }, fee: '1200', foreign: true }),
    ).toEqual({ kind: 'club', club: 'ESP-0-0-3', fee: '1200', abroad: true });
  });

  it('reads a world-market row the same way: his club, or none for a free agent', () => {
    expect(candidateOrigin({ source: undefined, fee: '0', foreign: true })).toEqual({
      kind: 'free',
      abroad: true,
    });
    const source = { club: 'ENG-1-0-7', name: 'Club', country: 'ENG', tier: 1, group: 0 };
    expect(candidateOrigin({ source, fee: '500', foreign: false })).toEqual({
      kind: 'club',
      club: 'ENG-1-0-7',
      fee: '500',
      abroad: false,
    });
  });

  it('names where each shortlisted player is, free or at his club, those abroad marked', () => {
    const w = club('shortlist-sources');
    // 해외 스카우트망 3 looks at two top flights abroad and keeps a place per line for them.
    holdRows(w, { policy: { globalScouting: 3 } });
    openShortlistWindow(w);
    const entries = shortlistRows(w, transferOffers(w)).flatMap((row) => row.entries);
    expect(entries.length).toBeGreaterThan(0);
    for (const { offer, origin } of entries) {
      expect(origin).toEqual(candidateOrigin(offer));
      expect(origin.kind).toBe(offer.source.kind);
      expect(origin.abroad).toBe(offer.foreign);
      if (origin.kind === 'club') expect(origin.fee).toBe(offer.fee);
    }
    expect(entries.some(({ origin }) => origin.kind === 'club' && origin.abroad)).toBe(true);
    expect(entries.some(({ origin }) => !origin.abroad)).toBe(true);
    expect(entries.some(({ origin }) => origin.kind === 'free')).toBe(true);
  });
});
