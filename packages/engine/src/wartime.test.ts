import { describe, expect, it, vi } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { PersonCareer, World } from '../../contracts/src/types';
import { crossWar, seasonAfter, seasonFrom, WARTIME } from './wartime';
import { ownerSettleGap } from './owner';
import { SEASON_END_DAY } from './calendar';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

vi.mock('./owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./owner')>();
  return { ...actual, ownerSettleGap: vi.fn(actual.ownerSettleGap) };
});

/** A founded career closed after 1938/39: its year already the restart, its season not opened. */
function atRestart() {
  const w = careerWorld({ seed: 'wartime' }, DISABLED_RELEASE);
  const club = w.clubs.find((c) => c.id !== w.playerClub)!.id;
  const person: PersonCareer = {
    id: 'person:coach',
    name: 'Coach',
    born: 1890,
    position: 'CM',
    professionalism: 3,
    qualities: w.players[0]!.qualities!,
    playing: 'retired',
    employment: [
      { role: 'assistant', club, from: { year: 1930, day: 0 }, to: { year: 1936, day: 10 } },
      {
        role: 'assistant',
        club,
        from: { year: 1937, day: 0 },
        contractUntil: { year: 1940, day: 30 },
      },
    ],
    mentors: [],
  };
  w.people = { [person.id]: person };
  w.players[0]!.loanUntil = 1939;
  w.year = WARTIME.restart;
  return w;
}
const untils = (w: World) => ({
  players: w.players.map((p) => [p.until, p.loanUntil]),
  manager: w.manager.until,
  staff: (w.staff ?? []).map((s) => s.until),
  jobs: w.people!['person:coach']!.employment.map((job) => [job.contractUntil, job.to]),
});

describe('the wartime stop (→WORLD-14)', () => {
  it('skips 1939/40–1945/46 and plays every other season after the last', () => {
    expect(seasonAfter(WARTIME.last)).toBe(WARTIME.restart);
    expect(seasonAfter(1937)).toBe(1938);
    expect(seasonAfter(1950)).toBe(1951);
    expect(seasonFrom(1940)).toBe(WARTIME.restart);
    expect(seasonFrom(1939)).toBe(WARTIME.restart);
    expect(seasonFrom(1938)).toBe(1938);
    expect(seasonFrom(1950)).toBe(1950);
  });

  it('stands contracts still through the gap and settles the owner over it', () => {
    const w = atRestart(),
      before = untils(w);
    vi.mocked(ownerSettleGap).mockClear();
    crossWar(w, WARTIME.last);
    const after = untils(w),
      gap = WARTIME.restart - WARTIME.last - 1;
    expect(after.players).toEqual(
      before.players.map(([until, loan]) => [until! + gap, loan === undefined ? loan : loan + gap]),
    );
    expect(after.manager).toBe(before.manager + gap);
    expect(after.staff).toEqual(before.staff.map((until) => until + gap));
    // A finished job keeps its dates; a running one has as long left as at the close.
    expect(after.jobs).toEqual([
      [undefined, { year: 1936, day: 10 }],
      [{ year: 1940 + gap, day: 30 }, undefined],
    ]);
    expect(ownerSettleGap).toHaveBeenCalledExactlyOnceWith(
      w,
      { year: WARTIME.last, day: SEASON_END_DAY + 1 },
      { year: WARTIME.restart, day: 0 },
    );
  });

  it('changes nothing between seasons the war does not skip', () => {
    const w = atRestart();
    w.year = 1951;
    const before = canonical(w);
    vi.mocked(ownerSettleGap).mockClear();
    crossWar(w, 1950);
    expect(canonical(w)).toBe(before);
    expect(ownerSettleGap).not.toHaveBeenCalled();
  });
});
