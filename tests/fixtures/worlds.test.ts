import { describe, expect, it } from 'vitest';
import { advanceRound } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { canonical } from '../../packages/contracts/src/index';
import { cachedWorld } from './cached-world';
import { ENABLED_RELEASE } from './releases';
import { simulatedWorld } from './worlds';

const input = { country: 'ENG', seed: 'cached-world' } as const;

describe('shared test worlds', () => {
  it('gives the world the inline calls give, as a fresh copy each time', () => {
    const direct = careerWorld(input);
    for (let n = 0; n < 2; n++) advanceRound(direct, undefined, false);
    const a = simulatedWorld(input, { rounds: 2 }),
      b = simulatedWorld(input, { rounds: 2 });
    expect(canonical(a)).toBe(canonical(direct));
    expect(a).not.toBe(b);
    a.cash = '1';
    expect(b.cash).toBe(direct.cash);
  });

  it('builds a cached state once per run and returns copies of it', () => {
    let builds = 0;
    const build = () => {
      builds++;
      return { built: true };
    };
    const first = cachedWorld('fixture-copy', build),
      second = cachedWorld('fixture-copy', build);
    expect(first).toEqual({ built: true });
    expect(second).not.toBe(first);
    expect(builds).toBeLessThanOrEqual(1);
  });

  it('simulatedWorld pins the release it is given', () => {
    expect(simulatedWorld(input, {}, ENABLED_RELEASE).matchModel?.coverage).toBe('founding');
  });
});
