import { describe, expect, it } from 'vitest';
import { country } from '../../catalogs/src/index';
import { clubOf } from './index';
import { FAN_MOOD } from './owner-config';
import { fanMoodAfter } from './fan-mood-read';
import { closeLowest, lastRound } from './season.testkit';

describe('the last professional division relegates nobody (→LEAGUE-16)', () => {
  it('keeps its bottom clubs, sends its promotion places up and takes the relegated from above', () => {
    const w = lastRound('ENG');
    const year = w.year,
      own = w.playerClub;
    const { last, mood, up, down, bottom } = closeLowest(w);
    // Its promotion places go up, and the division above relegates as many into it.
    expect(up).toHaveLength(country('ENG').moves[last - 1]!);
    expect(down).toHaveLength(up.length);
    // Its bottom clubs, the own club last of them, stay in the division.
    expect(bottom).toContain(own);
    for (const id of bottom) expect(w.clubs.find((c) => c.id === id)!.tier, id).toBe(last);
    expect(clubOf(w).tier).toBe(last);
    // Last place costs 팬 민심 (→OWNER-12), beside any title the season brought.
    const drivers = w.events.filter((e) => e.kind === 'fan-mood' && e.year === year);
    expect(drivers.filter((e) => e.title === '최하위')).toHaveLength(1);
    expect(drivers.some((e) => e.title === '강등')).toBe(false);
    const titles = drivers.filter((e) => e.title.endsWith('우승')).length;
    // Each result moves it as the fans' disposition scales results (→OWNER-12).
    let expected = mood;
    const after = (change: number) =>
      fanMoodAfter({ owner: { ...w.owner!, fanMood: expected } }, change, 'results');
    for (let n = 0; n < titles; n++) expected = after(FAN_MOOD.title);
    expected = after(FAN_MOOD.lastInLowest);
    expect(w.owner!.fanMood).toBeCloseTo(expected, 5);
  });
});
