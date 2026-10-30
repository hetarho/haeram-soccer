import { describe, expect, it } from 'vitest';
import { createWorld, advanceRound } from '../../../../packages/engine/src/index';
import { matchBriefing, resultFor } from './scouting';

const input = {
  country: 'ENG' as const,
  name: 'Scouting',
  color: '#24664f',
  seed: 'scout',
  level: 'easy' as const,
};
describe('match briefing', () => {
  it('shows no invented results before kickoff and never changes the world', () => {
    const w = createWorld(input);
    const before = JSON.stringify(w);
    expect(matchBriefing(w)).toMatchObject({ ownRecent: [], theirRecent: [], meetings: [] });
    expect(JSON.stringify(w)).toBe(before);
  });
  it("reads both sides' last ten settled results and our last ten meetings", () => {
    const w = createWorld(input);
    for (let i = 0; i < 16; i++) advanceRound(w);
    const brief = matchBriefing(w)!;
    for (const [club, recent] of [
      [w.playerClub, brief.ownRecent],
      [brief.opponent.id, brief.theirRecent],
    ] as const) {
      expect(recent.length, club).toBe(10);
      expect(recent.every((f) => resultFor(f, club))).toBe(true);
    }
    const meeting = {
      ...w.ownMatches[0]!,
      home: brief.opponent.id,
      away: w.playerClub,
      score: { home: 1, away: 3 },
    };
    w.ownMatches = Array.from({ length: 12 }, (_, i) => ({ ...meeting, id: `meeting-${i}` }));
    w.ownMatches.push({ ...meeting, id: 'elsewhere', home: 'unrelated' });
    const meetings = matchBriefing(w)!.meetings;
    expect(meetings.map((f) => f.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `meeting-${i + 2}`),
    );
    expect(resultFor(meeting, w.playerClub)).toEqual({ own: 3, other: 1, result: '승' });
    expect(resultFor(meeting, 'unrelated')).toBeUndefined();
  });
});

describe('aptitude display scouting', () => {
  it('keeps qualitative estimates distinct from numeric playing ability', async () => {
    const { aptitudeLabel } = await import('./scouting');
    expect(aptitudeLabel(4, false, 59)).toBe('낮음~매우 높음');
    expect(aptitudeLabel(4, false, 60)).toBe('보통~매우 높음');
    expect(aptitudeLabel(4, false, 79)).toBe('보통~매우 높음');
    expect(aptitudeLabel(4, false, 80)).toBe('높음');
    expect(aptitudeLabel(4, true, 59)).toBe('높음');
  });
});
