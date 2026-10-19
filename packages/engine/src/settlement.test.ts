import { describe, expect, it } from 'vitest';
import { createWorld, gateProjection, simulateMatch } from './index';
import { gate, gateDetail, readGateDetail } from './settlement';

describe('gate ledger detail', () => {
  it('gateDetail and readGateDetail round-trip with and without the league scale', () => {
    expect(gateDetail(1234, 1, '1950-r1-a-b')).toBe('관중 1234명 · 티켓과 구단 상품 · 1950-r1-a-b');
    expect(gateDetail(1234, 1.5, '1950-r1-a-b')).toBe(
      '관중 1234명 · 티켓과 구단 상품 · 시즌 46경기 기준 ×1.50 · 1950-r1-a-b',
    );
    for (const scale of [1, 0.75, 1.5, 46 / 38, 2])
      for (const attendance of [0, 7, 987, 45000])
        expect(readGateDetail(gateDetail(attendance, scale, 'cup:1950:2:x'))).toEqual({
          attendance,
          matchId: 'cup:1950:2:x',
        });
    // The hosting cost's detail and other texts are not a gate's.
    expect(readGateDetail('관중 1234명 · 1950-r1-a-b')).toBeUndefined();
    expect(readGateDetail('관중 많음 · 티켓과 구단 상품 · m')).toBeUndefined();
    expect(readGateDetail('')).toBeUndefined();
  });

  it('gate() writes a detail readGateDetail reads', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Gate United',
      color: '#224433',
      seed: 'gate-detail',
      level: 'normal',
    });
    const fixture = w.fixtures.find((match) => match.home === w.playerClub)!,
      match = simulateMatch(w, fixture, false, true).record,
      scale = gateProjection(w, match.id, match.away).leagueFactor,
      before = w.events.length;
    gate(w, match);
    const event = w.events.slice(before).find((e) => e.kind === 'gate')!,
      read = readGateDetail(event.detail);
    expect(read).toEqual({ attendance: expect.any(Number), matchId: match.id });
    expect(read!.attendance).toBeGreaterThan(0);
    expect(event.detail).toBe(gateDetail(read!.attendance, scale, match.id));
  });
});
