import { expect } from 'vitest';
import { staffAuthority } from './testing';
import { canonical, type World } from '../../contracts/src/index';
import {
  advanceDays,
  advanceRound,
  currentDay,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
  simulateSeason,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';

/** The calendar club taken over under `release` (default the switch as it stands). */
export function world(
  country: 'ENG' | 'BEL' = 'ENG',
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
) {
  const w = careerWorld({ country, seed: 'calendar' }, release);
  w.settings = staffAuthority(2);
  w.cash = '999999999999';
  return w;
}

/** Day-by-day, round-by-round and season-command progression record the same facts. */
export function recordsSameFacts(code: 'ENG' | 'ESP', seed: string) {
  const input = { country: code, seed };
  const start = careerWorld(input);
  const year = start.year;
  // Halfway through the second season, on its 23rd league match day.
  const done = (w: World) => w.year > year && w.round === 23;
  // Movement frames change no fact (see the fast path above); skipping them keeps this quick.
  const days = structuredClone(start);
  while (!done(days)) advanceDays(days, 1, undefined, false);
  // The season command plays the first season round by round and closes it once the final
  // round is played: the very calls the host's advance commands make, so the round and season
  // modes share it and part only in the second season.
  const closed = cachedWorld(`calendar-closed:${code}:${seed}`, () =>
    simulateSeason(careerWorld(input)),
  );
  const rounds = structuredClone(closed);
  while (!done(rounds)) advanceRound(rounds, undefined, false);
  const season = structuredClone(closed);
  while (!done(season)) advanceDays(season, 1, undefined, false);
  // The revision counts commands and days differently per mode; it is a counter, not a fact.
  const facts = (w: World) => canonical({ ...w, revision: 0, receiptIds: [] });
  expect(days.history).toHaveLength(1);
  expect(currentDay(days)).toBe(23 * 7);
  expect(facts(rounds)).toBe(facts(days));
  expect(facts(season)).toBe(facts(days));
}
