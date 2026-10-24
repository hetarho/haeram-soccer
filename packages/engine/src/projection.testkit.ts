import type { World } from '../../contracts/src/types';
import { advanceRound, createWorld, operate, operatingCosts } from './index';
import { cachedWorld, DISABLED_RELEASE } from '../../../tests/fixtures/worlds';

/** The forecast club on the pre-feature path: the budget forecast, not the match model, is the subject. */
export function world(seed = 'projection') {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Forecast Rovers',
      color: '#335544',
      seed,
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );
  // The squad stays fixed, so every realised bill can be compared exactly.
  return w;
}
/** The starting worlds the tests play rounds from. */
export const setups = {
  plain: () => world(),
  sponsored: () => {
    const w = world();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    return w;
  },
  academy: () => {
    const w = world();
    operate(w, { type: 'policy', key: 'academy', level: 3 });
    return w;
  },
  recorded: () => {
    const w = world();
    // An amount recorded at the season's start, three times the division's floor (→ECON-30).
    w.operatingExpenses = (BigInt(operatingCosts(w).expenses) * 3n).toString();
    return w;
  },
  dearer: () => {
    const w = world();
    w.manager.wage = (BigInt(w.manager.wage) + 46000n).toString();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    return w;
  },
  support: () => {
    const w = played('plain', 10);
    operate(w, { type: 'policy', key: 'support', level: 5 });
    return w;
  },
};
/**
 * A setup's world once the season has reached each round in `spans` in turn (unobserved), built
 * once on the one before it. The rounds only produce the bills and payments the projection is
 * compared with.
 */
export function played(setup: keyof typeof setups, ...spans: number[]): World {
  return cachedWorld(`${setup}:${spans.join('>')}`, () => {
    const w = spans.length > 1 ? played(setup, ...spans.slice(0, -1)) : setups[setup]();
    for (let n = w.round; n < spans.at(-1)!; n++) advanceRound(w, undefined, false);
    return w;
  });
}
export const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
export const lineOf = (
  lines: { key: string; low: string; high: string; amount: string }[],
  key: string,
) => lines.find((line) => line.key === key)!;
export const eventsTotal = (w: World, kind: string) =>
  sum(w.events.filter((e) => e.year === w.year && e.kind === kind).map((e) => e.amount!));
