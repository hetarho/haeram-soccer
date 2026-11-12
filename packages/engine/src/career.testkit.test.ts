import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { canonical } from '../../contracts/src/index';
import { presetBoard, presetById } from './presets';
import { CAREER_YEAR, careerClub, careerFunds, careerWorld } from './career.testkit';

describe('careerWorld (→WEB-2, ECON-38)', () => {
  it('makes the same world from the same input, and a world the schema accepts', () => {
    const a = careerWorld({ seed: 'twin' }),
      b = careerWorld({ seed: 'twin' });
    expect(canonical(a)).toBe(canonical(b));
    expect(() => validateWorld(structuredClone(a))).not.toThrow();
  });

  it('takes the lowest professional division’s first club over in 1950 by default, funded', () => {
    const w = careerWorld({});
    expect(careerClub('ENG')).toBe('ENG:3:0:0');
    expect(w.playerClub).toBe('ENG:3:0:0');
    expect(w.year).toBe(CAREER_YEAR);
    expect(w.owner).toMatchObject({ tier: 'oil', traits: [] });
    expect(w.build).toBeUndefined();
    expect(BigInt(w.cash)).toBe(careerFunds(w));
    expect(BigInt(w.cash)).toBeGreaterThan(0n);
    expect(w.players.length).toBeGreaterThanOrEqual(20);
  });

  it('reads the club, country, tier, traits, preset, year and cash it is given', () => {
    const w = careerWorld({
      seed: 'given',
      country: 'ESP',
      tier: 'chaebol',
      traits: ['negotiator', 'marketer'],
      preset: 'local-pride',
      year: 1960,
      cash: '12345',
    });
    expect(careerClub('ESP')).toBe('ESP:1:0:0');
    expect(w.playerClub).toBe('ESP:1:0:0');
    expect(w.currency).toBe(careerWorld({ country: 'ESP' }).currency);
    expect(w.year).toBe(1960);
    expect(w.owner).toMatchObject({ tier: 'chaebol', traits: ['negotiator', 'marketer'] });
    expect(w.build).toEqual(presetBoard(presetById('local-pride')!).build);
    expect(w.cash).toBe('12345');
    const top = careerWorld({ club: 'ENG:0:0:5' });
    expect(top.playerClub).toBe('ENG:0:0:5');
    expect(top.clubs.find((c) => c.id === top.playerClub)!.tier).toBe(0);
  });
});
