import { describe, expect, it } from 'vitest';
import {
  activePlayers,
  clubOf,
  FRESH_FATIGUE,
  fatigueLoad,
  npcTactic,
  PRESS_LOAD_FATIGUE,
  rating,
  startingSquad,
} from './index';
import { careerWorld } from './career.testkit';

describe('a fair start', () => {
  it('charges nothing for ordinary match fitness and the excess beyond it', () => {
    expect(fatigueLoad(FRESH_FATIGUE)).toBe(0);
    expect(fatigueLoad(FRESH_FATIGUE + 12)).toBe(12);
    const w = careerWorld({ seed: 'fitness' });
    const fresh = rating(w, clubOf(w));
    for (const player of activePlayers(w)) player.fatigue = FRESH_FATIGUE;
    expect(rating(w, clubOf(w))).toBe(fresh);
    for (const player of activePlayers(w)) player.fatigue = FRESH_FATIGUE + 30;
    expect(rating(w, clubOf(w))).toBe(fresh - 5);
  });

  it('makes pressing clubs nobody owns carry their usual load', () => {
    const w = careerWorld({ seed: 'press-load' });
    const pressing = w.clubs.find((c) => c.id !== w.playerClub && npcTactic(c) === 'press')!;
    const calm = w.clubs.find((c) => c.id !== w.playerClub && npcTactic(c) !== 'press')!;
    expect(startingSquad(w, pressing).every((p) => p.fatigue === PRESS_LOAD_FATIGUE)).toBe(true);
    expect(startingSquad(w, calm).every((p) => p.fatigue === 0)).toBe(true);
  });
});
