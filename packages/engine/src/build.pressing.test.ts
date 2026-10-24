import { describe, expect, it } from 'vitest';
import { clubOf, startingSquad, tacticalProfile } from './index';
import { DISABLED_RELEASE } from '../../../tests/fixtures/worlds';
import { baseline, sample, scenario } from './build.testkit';

// Tactical builds on the pre-feature path, as build.tradeoffs guards them (T419).
describe('tactical roster tradeoffs', () => {
  it('requires fresh stamina for effective pressing instead of granting free chances', () => {
    const weak = scenario({ ...baseline, stamina: 20 }, 'possession', DISABLED_RELEASE);
    const strong = scenario({ ...baseline, stamina: 95 }, 'possession', DISABLED_RELEASE);
    const tired = scenario(
      { ...baseline, stamina: 95, fatigue: 90 },
      'possession',
      DISABLED_RELEASE,
    );
    const freshShots = sample(strong.w, strong.fixture, 'press').shots;
    expect(freshShots).toBeGreaterThan(sample(weak.w, weak.fixture, 'press').shots);
    expect(freshShots).toBeGreaterThan(sample(tired.w, tired.fixture, 'press').shots);
    const players = startingSquad(strong.w, clubOf(strong.w));
    const pressed = tacticalProfile(players, 'press', 'counter');
    const balanced = tacticalProfile(players, 'balanced', 'counter');
    expect(pressed.defense).toBeLessThan(balanced.defense);
    expect(pressed.shot).toBeLessThan(tacticalProfile(players, 'press', 'possession').shot);
  });
});
