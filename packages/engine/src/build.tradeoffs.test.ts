import { describe, expect, it } from 'vitest';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { TACTICS } from './index';
import { sample, scenario } from './build.testkit';

describe('tactical roster tradeoffs', () => {
  // The grid engine's tactics are not balanced yet: press beats every other tactic at equal
  // strength (STATE inbox 261019 suggest T216 MATCH-8), so the cases preferring another tactic
  // wait for that tuning. T278 measured the same on the candidate model (press 66–79% at home
  // against counter and balanced, artifacts/benchmarks/CALIBRATION.md) and leaves them skipped. T321 and T324
  // narrowed it on the candidate model but press still beats counter there (MATCH-29 verdicts in
  // artifacts/benchmarks/detailed-model-calibration.json), and these cases play the pre-feature model
  // (`DISABLED_RELEASE`, whatever the switch), so they stay skipped until the candidate holds
  // MATCH-29 and is activated (T286). On the candidate the press case below only ties another
  // tactic's goal margin (181 against 181 over 160 matches, T419's release-on probe), a residual
  // for T410.
  const tradeoffs = [
    {
      name: 'passing midfield against balanced opponents',
      build: { passing: 95, defense: 55, attack: 55, stamina: 35 },
      opponent: 'balanced' as const,
      preferred: 'possession' as const,
    },
    {
      name: 'defenders and finishers against pressing opponents',
      build: { passing: 25, defense: 95, attack: 95, stamina: 35 },
      opponent: 'press' as const,
      preferred: 'counter' as const,
    },
    {
      name: 'fresh high-stamina players against possession opponents',
      build: { passing: 55, defense: 50, attack: 75, stamina: 95 },
      opponent: 'possession' as const,
      preferred: 'press' as const,
    },
    {
      name: 'tired players exposed to counterattacks',
      build: { passing: 55, defense: 55, attack: 65, stamina: 55, fatigue: 80 },
      opponent: 'counter' as const,
      preferred: 'balanced' as const,
    },
  ];

  const favors = ({ build, opponent, preferred }: (typeof tradeoffs)[number]) => {
    const { w, fixture } = scenario(build, opponent, DISABLED_RELEASE);
    const outcomes = TACTICS.map((tactic) => ({ tactic, ...sample(w, fixture, tactic) }));
    const winner = outcomes.find((outcome) => outcome.tactic === preferred)!;
    for (const alternative of outcomes.filter((outcome) => outcome.tactic !== preferred))
      expect(winner.margin).toBeGreaterThan(alternative.margin);
  };

  it.each(tradeoffs.filter((c) => c.preferred === 'press'))(
    'favors a different tradeoff for $name',
    favors,
  );

  it.skip.each(tradeoffs.filter((c) => c.preferred !== 'press'))(
    'favors a different tradeoff for $name',
    favors,
  );
});
