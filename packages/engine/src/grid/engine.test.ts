import { describe, expect, it } from 'vitest';
import { createWorld } from '../index';
import { playGrid } from './engine';
import { M } from './record';
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
      const counts = record.lineCounts!;
      expect(record.players).toHaveLength(counts[0] + counts[1]);
      for (const side of [0, 1] as const) {
        const lines = record.players.slice(side * counts[0], side * counts[0] + counts[side]);
        const team = record.metrics[side]!;
        expect(lines.reduce((sum, p) => sum + p.metrics[M.goals]!, 0)).toBe(
          side === 0 ? record.score.home : record.score.away,
        );
        expect(team[M.goals]).toBe(side === 0 ? record.score.home : record.score.away);
        for (let m = M.assists; m < M.minutes; m++)
          expect(
            lines.reduce((sum, p) => sum + p.metrics[m]!, 0),
            `metric ${m}`,
          ).toBe(team[m]);
        expect(team[M.completed]!).toBeLessThanOrEqual(team[M.passes]!);
        expect(team[M.onTarget]!).toBeLessThanOrEqual(team[M.shots]!);
        expect(team[M.assists]!).toBeLessThanOrEqual(team[M.goals]!);
        const left = new Set(
          (record.incidents ?? []).filter((x) => x.kind !== 'yellow').map((x) => x.player),
        );
        expect(
          lines.every((p) =>
            left.has(p.id) ? p.metrics[M.minutes]! <= 90 : p.metrics[M.minutes] === 90,
          ),
        ).toBe(true);
        expect(team[M.minutes]).toBe(90);
      }
      expect(record.metrics[0]![M.possession]! + record.metrics[1]![M.possession]!).toBe(90);
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
      passes += record.metrics[0]![M.passes]! + record.metrics[1]![M.passes]!;
      shots += record.metrics[0]![M.shots]! + record.metrics[1]![M.shots]!;
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
    const { trace, record } = play('trace-1', true);
    expect(trace!.length).toBeGreaterThan(300);
    // A side left short (no substitutes before 1965) has no position for the empty slot.
    const short = (record.incidents ?? []).filter(
      (x) => x.kind === 'red' || x.kind === 'secondYellow' || x.kind === 'injury',
    ).length;
    for (const e of trace!) {
      expect(e.positions).toHaveLength(44);
      const missing = e.positions.filter((v) => !Number.isFinite(v)).length;
      expect(missing % 2).toBe(0);
      expect(missing / 2).toBeLessThanOrEqual(short);
    }
    expect(trace!.every((e, i) => i === 0 || e.elapsed >= trace![i - 1]!.elapsed)).toBe(true);
  });
});
