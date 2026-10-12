import { describe, expect, it } from 'vitest';
import type { Fixture } from '../../contracts/src/types';
import { createWorld, simulateMatch } from './index';
import { MATCH_MOTION_CONFIG } from './motion';

const w = createWorld({
  country: 'ENG',
  name: 'Duel Laboratory',
  color: '#2a5d8f',
  seed: 'duel-chain',
  difficulty: 1,
});
const own = w.fixtures.find((f) => f.home === w.playerClub)!;
const npc = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0);
const neutral: Fixture = { ...own, id: 'neutral', home: npc[0].id, away: npc[1].id };

describe('player duel chain', () => {
  it('credits every counted action to a named player of the right side', () => {
    for (let i = 0; i < 12; i++) {
      const { record } = simulateMatch(w, { ...own, id: `credit:${i}` }, false, true);
      const sides = [record.players.slice(0, 11), record.players.slice(11)];
      for (const side of [0, 1])
        for (const metric of [0, 2, 3, 4, 5, 6, 7, 8, 9])
          expect(
            sides[side].reduce((sum, player) => sum + player.metrics[metric], 0),
            `side ${side} metric ${metric}`,
          ).toBe(record.metrics[side][metric]);
      for (const side of [0, 1]) {
        expect(record.metrics[side][1]).toBeLessThanOrEqual(record.metrics[side][0]);
        expect(record.metrics[side][3]).toBeLessThanOrEqual(record.metrics[side][2]);
        expect(record.metrics[side][5]).toBeLessThanOrEqual(record.metrics[side][4]);
      }
      expect(record.metrics[0][11] + record.metrics[1][11]).toBe(90);
    }
  });

  it('chains each minute through the players who actually received the ball', () => {
    const { frames, record } = simulateMatch(w, own, true, true);
    let shots = 0;
    for (const frame of frames) {
      const events = frame.events!;
      expect(events.length).toBeGreaterThan(0);
      for (let i = 1; i < events.length; i++) {
        const previous = events[i - 1],
          event = events[i];
        expect(event.t).toBeGreaterThan(previous.t);
        expect(previous.lost).not.toBe(true);
        if (previous.kind === 'pass') expect(event.actor).toBe(previous.receiver);
        if (previous.kind === 'dribble' || previous.kind === 'restart')
          expect(event.actor).toBe(previous.actor);
        expect(event.kind).not.toBe('restart');
      }
      for (const event of events) {
        expect(event.t).toBeGreaterThan(0);
        expect(event.t).toBeLessThan(60);
        if (event.kind === 'shot') {
          shots++;
          expect(event.outcome).toBeDefined();
          expect(event.xg).toBeGreaterThan(0);
          expect(event.actor).toBeGreaterThan(0);
        }
      }
    }
    expect(shots).toBe(record.metrics[0][4] + record.metrics[1][4]);
  });

  it('opens a minute with a restart exactly when the ball changes sides without a duel', () => {
    const { frames, record } = simulateMatch(w, own, true, true);
    // Who holds the ball as each minute ends; nobody after a goal (a kickoff follows).
    let holder: 0 | 1 | undefined;
    const kinds = new Set<string>();
    for (const frame of frames) {
      const first = frame.events![0];
      const changed = holder !== undefined && holder !== first.side;
      expect(first.kind === 'restart', `minute ${frame.minute}`).toBe(changed);
      if (first.kind === 'restart') {
        kinds.add(first.restart!);
        expect(first.opponent).toBeDefined();
        // Out of play off the side that had it: corners are taken high up, goal kicks deep.
        if (first.restart === 'corner') expect(first.zone).toBe(2);
        if (first.restart === 'goalKick') expect(first.zone).toBe(0);
      }
      const last = frame.events!.at(-1)!;
      const other = last.side === 0 ? 1 : 0;
      holder =
        last.kind === 'shot'
          ? last.outcome === 'goal'
            ? undefined
            : other
          : last.lost
            ? other
            : last.side;
    }
    expect(kinds).toEqual(new Set(['throwIn', 'goalKick', 'corner']));
    // Restarts only describe the play; the record is the one an unwatched run settles.
    expect(simulateMatch(w, own, false, true).record).toEqual(record);
  });

  it('accumulates expected goals from the recorded shots only', () => {
    const { frames } = simulateMatch(w, own, true, true);
    const { secondsPerMinute, stepSeconds } = MATCH_MOTION_CONFIG.integration;
    let previous: [number, number] = [0, 0];
    for (const frame of frames) {
      expect(frame.xg![0]).toBeGreaterThanOrEqual(previous[0]);
      expect(frame.xg![1]).toBeGreaterThanOrEqual(previous[1]);
      const added = [0, 1].map((side) =>
        frame
          .events!.filter((event) => event.kind === 'shot' && event.side === side)
          .reduce((sum, event) => sum + event.xg!, 0),
      );
      expect(frame.xg![0] - previous[0]).toBeCloseTo(added[0], 1);
      expect(frame.xg![1] - previous[1]).toBeCloseTo(added[1], 1);
      previous = frame.xg!;
      // One ball position (x, y, height) per motion step: 80 steps of 0.1 s per minute.
      expect(frame.ballTrack).toHaveLength(Math.round(secondsPerMinute / stepSeconds));
      expect(frame.ballTrack!.every((point) => point.length === 3)).toBe(true);
    }
  });

  it('resolves unrecorded fixtures between other clubs at team level without frames', () => {
    const fast = simulateMatch(w, neutral);
    expect(fast.record.players).toEqual([]);
    expect(fast.frames).toEqual([]);
    const detailed = simulateMatch(w, neutral, false, true);
    expect(detailed.record.players).toHaveLength(22);
    expect(simulateMatch(w, neutral).record).toEqual(fast.record);
  });

  it('keeps duel and team-level scoring on the same scale', () => {
    const goals = (keep: boolean) =>
      Array.from({ length: 300 }, (_, i) => {
        const score = simulateMatch(
          w,
          { ...neutral, id: `scale:${i}`, home: npc[i % 10].id, away: npc[10 + (i % 10)].id },
          false,
          keep,
        ).record.score;
        return score.home + score.away;
      }).reduce((sum, n) => sum + n, 0) / 300;
    const duel = goals(true),
      summary = goals(false);
    expect(duel).toBeGreaterThan(summary * 0.8);
    expect(duel).toBeLessThan(summary * 1.25);
  });
});
