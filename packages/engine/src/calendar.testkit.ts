import { expect } from 'vitest';
import { canonical, type World } from '../../contracts/src/index';
import { legacySettings } from './responsibilities';
import { advanceDays, advanceRound, createWorld, currentDay } from './index';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

export function world(country: 'ENG' | 'BEL' = 'ENG') {
  const w = createWorld({
    country,
    name: 'Calendar United',
    color: '#223344',
    seed: 'calendar',
    level: 'easy' as const,
  });
  w.settings = legacySettings(2);
  w.cash = '999999999999';
  return w;
}

/** Day-by-day, round-by-round and season-command progression record the same facts. */
export function recordsSameFacts(code: 'ENG' | 'ESP', seed: string) {
  const input = {
    country: code,
    name: 'Order FC',
    color: '#335577',
    seed,
    level: 'easy' as const,
  };
  const start = createWorld(input);
  const year = start.year;
  // Halfway through the second season, on its 23rd league match day.
  const done = (w: World) => w.year > year && w.round === 23;
  // Movement frames change no fact (see the fast path above); skipping them keeps this quick.
  const days = structuredClone(start);
  while (!done(days)) advanceDays(days, 1, undefined, false);
  // The season command plays the first season round by round and closes it once the final
  // round is played: the very calls the host's advance commands make, so the round and season
  // modes share it and part only in the second season.
  const closed = simulatedWorld(input, { seasons: 1 });
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
