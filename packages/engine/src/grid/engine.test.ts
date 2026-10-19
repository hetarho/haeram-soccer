import { describe, expect, it } from 'vitest';
import { createWorld } from '../index';
import { playGrid } from './engine';
import { buildGridSetup } from './setup';

const w = createWorld({
  country: 'ENG',
  name: 'Grid Engine Lab',
  color: '#2a5d8f',
  seed: 'grid-engine',
  level: 'normal',
});
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const fixture = (id: string) => ({ ...w.fixtures[0]!, id, home: home!.id, away: away!.id });
const play = (id: string, observe = false, recordPlayers = true) =>
  playGrid(
    buildGridSetup(w, fixture(id), { observe, recordPlayers, tactics: ['balanced', 'balanced'] }),
  );

describe('grid engine', () => {
  it('plays deterministically for a seed', () => {
    expect(play('seed-a').record).toEqual(play('seed-a').record);
    expect(play('seed-a').record).not.toEqual(play('seed-b').record);
  });

  it('returns the same record whether observed or not', () => {
    const quiet = play('observe-1');
    const watched = play('observe-1', true);
    expect(watched.record).toEqual(quiet.record);
    expect(watched.elapsed).toBe(quiet.elapsed);
  });

  it('keeps the record consistent', () => {
    for (let i = 0; i < 60; i++) {
      const { record } = play(`consistent-${i}`);
      expect(record.players).toHaveLength(22);
      expect(record.lineCounts).toEqual([11, 11]);
      for (const side of [0, 1] as const) {
        const lines = record.players.slice(side * 11, side * 11 + 11);
        const team = record.metrics[side]!;
        expect(lines.reduce((sum, p) => sum + p.metrics[0]!, 0)).toBe(
          side === 0 ? record.score.home : record.score.away,
        );
        expect(team[0]).toBe(side === 0 ? record.score.home : record.score.away);
        for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9])
          expect(
            lines.reduce((sum, p) => sum + p.metrics[m]!, 0),
            `metric ${m}`,
          ).toBe(team[m]);
        expect(team[3]!).toBeLessThanOrEqual(team[2]!);
        expect(team[5]!).toBeLessThanOrEqual(team[4]!);
        expect(team[1]!).toBeLessThanOrEqual(team[0]!);
        expect(lines.every((p) => p.metrics[10] === 90)).toBe(true);
        expect(team[10]).toBe(90);
      }
      expect(record.metrics[0]![11]! + record.metrics[1]![11]!).toBe(90);
      expect(record.detail).toHaveLength(2);
      expect(record.xg![0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('never hands the ball over without an event', () => {
    const switching = new Set([
      'intercepted',
      'tackled',
      'loose',
      'out',
      'foul',
      'offside',
      'shot',
      'held',
    ]);
    for (let i = 0; i < 8; i++) {
      const { trace } = play(`handover-${i}`, true);
      for (let k = 1; k < trace!.length; k++)
        if (trace![k]!.side !== trace![k - 1]!.side && trace![k]!.period === trace![k - 1]!.period)
          expect(
            switching.has(trace![k - 1]!.outcome),
            `${trace![k - 1]!.action} -> ${trace![k - 1]!.outcome}`,
          ).toBe(true);
    }
  });

  it('ends each half after its added time', () => {
    for (let i = 0; i < 20; i++) {
      const result = play(`added-${i}`);
      const added = result.record.added!;
      expect(added).toHaveLength(2);
      expect(added[0]).toBeGreaterThanOrEqual(1);
      expect(added[0]).toBeLessThanOrEqual(6);
      expect(added[1]).toBeGreaterThanOrEqual(2);
      expect(added[1]).toBeLessThanOrEqual(10);
      expect(result.elapsed).toBeGreaterThanOrEqual(5400 + (added[0]! + added[1]!) * 60);
      expect(result.elapsed).toBeLessThan(5400 + (added[0]! + added[1]!) * 60 + 400);
    }
  });

  it('produces plausible football before calibration', () => {
    let goals = 0,
      passes = 0,
      shots = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const { record } = play(`plausible-${i}`, false, false);
      goals += record.score.home + record.score.away;
      passes += record.metrics[0]![2]! + record.metrics[1]![2]!;
      shots += record.metrics[0]![4]! + record.metrics[1]![4]!;
    }
    expect(goals / n).toBeGreaterThan(1.0);
    expect(goals / n).toBeLessThan(5.0);
    expect(passes / n / 2).toBeGreaterThan(250);
    expect(passes / n / 2).toBeLessThan(800);
    expect(shots / n / 2).toBeGreaterThan(5);
    expect(shots / n / 2).toBeLessThan(25);
    for (let i = 0; i < 10; i++)
      for (const e of play(`halves-${i}`, true).trace!)
        if (e.action === 'shot' && e.from)
          expect(e.side === 0 ? e.from[0] : 105 - e.from[0]).toBeGreaterThanOrEqual(52.5);
  });

  it('traces every touch with 22 positions when observed and nothing otherwise', () => {
    expect(play('trace-0').trace).toBeUndefined();
    const { trace } = play('trace-1', true);
    expect(trace!.length).toBeGreaterThan(300);
    for (const e of trace!) {
      expect(e.positions).toHaveLength(44);
      expect(e.positions.every((v) => Number.isFinite(v))).toBe(true);
    }
    expect(trace!.every((e, i) => i === 0 || e.elapsed >= trace![i - 1]!.elapsed)).toBe(true);
  });
});
