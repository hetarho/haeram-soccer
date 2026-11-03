import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
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
import { createWorld } from './founding';

describe('a fair start', () => {
  // The founding's own squad is the subject: it leaves with the founding (T671).
  it.each(COUNTRIES.map((country) => country.code))(
    'founds an ordinary member of its league in %s',
    (code) => {
      const w = createWorld({
        country: code as 'ENG',
        name: 'Fair Start',
        color: '#335577',
        seed: `fair-${code}`,
        level: 'normal' as const,
      });
      const own = clubOf(w);
      const peers = w.clubs.filter(
        (c) =>
          c.country === own.country && c.tier === own.tier && c.group === own.group && c !== own,
      );
      const average = peers.reduce((sum, c) => sum + rating(w, c), 0) / peers.length;
      expect(Math.abs(rating(w, own) - average)).toBeLessThanOrEqual(2);
    },
  );

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
