import { describe, expect, it } from 'vitest';
import { advanceRound, createWorld, MATCH_MODEL_RELEASE } from '../../packages/engine/src/index';
import { canonical } from '../../packages/contracts/src/index';
import { cachedWorld, DISABLED_RELEASE, ENABLED_RELEASE, simulatedWorld } from './worlds';

const input = {
  country: 'ENG',
  name: 'Cached World',
  color: '#224466',
  seed: 'cached-world',
  level: 'normal',
} as const;

describe('shared test worlds', () => {
  it('gives the world the inline calls give, as a fresh copy each time', () => {
    const direct = createWorld(input);
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
    expect(simulatedWorld(input, {}, DISABLED_RELEASE).matchModel).toBeUndefined();
    expect(simulatedWorld(input, {}, ENABLED_RELEASE).matchModel?.coverage).toBe('founding');
  });

  it('the world cache separates the default release', () => {
    // Flips the switch both ways within this case, the way the release-on probe turns it on for a
    // whole run, so one run shows a state built under one setting is not served under the other.
    const release = MATCH_MODEL_RELEASE as { enabled: boolean };
    const initial = release.enabled;
    try {
      for (const enabled of [initial, !initial, initial]) {
        release.enabled = enabled;
        const founded = cachedWorld('default-release', () => createWorld(input));
        expect(founded.matchModel !== undefined).toBe(enabled);
      }
    } finally {
      release.enabled = initial;
    }
  });
});
