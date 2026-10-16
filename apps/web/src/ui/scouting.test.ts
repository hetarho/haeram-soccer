import { describe, expect, it } from 'vitest';
import { createWorld, advanceRound } from '../../../../packages/engine/src/index';
import { scoutOpponent, resultFor } from './scouting';

const input = {
  country: 'ENG' as const,
  name: 'Scouting',
  color: '#24664f',
  seed: 'scout',
  level: 'easy' as const,
};
describe('opponent scouting', () => {
  it('shows no invented form before kickoff and never changes the world', () => {
    const w = createWorld(input);
    const before = JSON.stringify(w);
    expect(scoutOpponent(w)).toMatchObject({ form: [], meetings: [], rank: undefined });
    expect(JSON.stringify(w)).toBe(before);
  });
  it('uses settled own-league scores from the opponent perspective and scopes meetings', () => {
    const w = createWorld(input);
    for (let i = 0; i < 7; i++) advanceRound(w);
    const scout = scoutOpponent(w)!;
    expect(scout.form).toHaveLength(5);
    expect(
      scout.form.every(
        (f) =>
          f.score &&
          f.year === w.year &&
          (f.home === scout.opponent.id || f.away === scout.opponent.id),
      ),
    ).toBe(true);
    const meeting = {
      ...w.ownMatches[0],
      home: scout.opponent.id,
      away: w.playerClub,
      score: { home: 1, away: 3 },
    };
    w.ownMatches = [
      meeting,
      ...Array.from({ length: 30 }, (_, i) => ({
        ...meeting,
        id: `irrelevant-${i}`,
        home: 'unrelated',
      })),
    ];
    expect(scoutOpponent(w)!.meetings).toHaveLength(0);
    w.ownMatches.push(meeting);
    expect(scoutOpponent(w)!.meetings).toHaveLength(1);
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
