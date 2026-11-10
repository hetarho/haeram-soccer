// The showcase search: seeds `${base}#0`, `${base}#1`, … until a script's first
// `showcase.withinSeconds` nominal seconds show every quota of `grammar.showcase` (goals, shots,
// offside of a poor decision-maker, a through ball to a good one, crosses, a corner, a switch, the
// false nine dropping in, the inverted full-back receiving, a counter, a recycle, a take-on and both
// teams on the ball). The prefix of a script is the script generated for fewer seconds, so each
// attempt is checked on the short script and only a hit is generated in full.
import { PROTO_CONFIG } from '../core/config.ts';
import type { Beat, Fixture, Script } from '../core/types.ts';
import { generateScript } from './generate.ts';
import { scriptStats } from './stats.ts';

export interface QuotaCheck {
  counts: Record<string, number>;
  met: string[];
  missing: string[];
}

const SHOWCASE = PROTO_CONFIG.grammar.showcase;
/** The share quota's id; its count is the smaller team's share of beats in percent. */
export const SHARE_QUOTA = 'share';

/** Every quota id with the count it requires, `share` last (in percent). */
export function quotaRequirements(): Record<string, number> {
  return { ...SHOWCASE.quotas, [SHARE_QUOTA]: SHOWCASE.minShare * 100 };
}

const roleCount = (
  fixture: Fixture,
  indexes: readonly number[] | undefined,
  role: string,
): number => (indexes ?? []).filter((i) => fixture.players[i].role === role).length;

/** Reads the quotas of `grammar.showcase` on a list of beats. */
export function checkQuotas(beats: readonly Beat[], fixture: Fixture): QuotaCheck {
  const s = scriptStats(beats);
  const [h, a] = s.teams;
  const sum = (key: keyof (typeof s.teams)[0]): number => h[key] + a[key];
  const decisions = (i: number): number => fixture.players[i].attrs.decisions;
  const share = beats.length === 0 ? 0 : Math.min(h.beats, a.beats) / beats.length;
  const counts: Record<string, number> = {
    goals: s.score[0] + s.score[1],
    shots: sum('shots'),
    lowIqOffside: s.offsideBy.filter((i) => decisions(i) < SHOWCASE.lowIq).length,
    highIqThrough: s.throughTo.filter((i) => decisions(i) >= SHOWCASE.highIq).length,
    crosses: sum('crosses'),
    corners: sum('corners'),
    switchPlay: s.moves.switchPlay ?? 0,
    dropLinkFalseNine: roleCount(fixture, s.receivedBy.dropLink, 'falseNine'),
    invertedFullBackReceives: ['intoPivot', 'interior', 'layOff', 'recycle'].reduce(
      (n, move) => n + roleCount(fixture, s.receivedBy[move], 'invertedFullBack'),
      0,
    ),
    counters: sum('counters'),
    recycles: s.moves.recycle ?? 0,
    takeOns: sum('takeOns'),
    [SHARE_QUOTA]: Math.round(share * 1000) / 10,
  };
  const met: string[] = [];
  const missing: string[] = [];
  for (const [id, required] of Object.entries(quotaRequirements())) {
    const ok = id === SHARE_QUOTA ? share >= SHOWCASE.minShare : counts[id] >= required;
    (ok ? met : missing).push(id);
  }
  return { counts, met, missing };
}

/** The beats of a script that start before `showcase.withinSeconds`. */
export const showcaseWindow = (script: Pick<Script, 'beats' | 'times'>): Beat[] =>
  script.beats.filter((_, i) => script.times[i] < SHOWCASE.withinSeconds);

const attemptSeed = (base: string, attempt: number): string => `${base}#${attempt}`;

/** The quota check of one attempt, read on the script generated for the window alone. */
const checkAttempt = (base: string, attempt: number): { seed: string; check: QuotaCheck } => {
  const seed = attemptSeed(base, attempt);
  const short = generateScript(seed, { seconds: SHOWCASE.withinSeconds });
  return { seed, check: checkQuotas(showcaseWindow(short), short.fixture) };
};

/**
 * Scripts of seeds `${base}#0`, `${base}#1`, … whose beats before `showcase.withinSeconds` meet
 * every quota, in order; the search stops after `limit` attempts (`showcase.maxAttempts`).
 */
export function* showcaseScripts(
  base: string,
  limit: number = SHOWCASE.maxAttempts,
): Generator<{ script: Script; seed: string; attempt: number }> {
  for (let attempt = 0; attempt < limit; attempt++) {
    const { seed, check } = checkAttempt(base, attempt);
    if (check.missing.length === 0) yield { script: generateScript(seed), seed, attempt };
  }
}

/** The first of them, or (none within `maxAttempts`) the attempt meeting the most quotas. */
export function findShowcaseScript(base: string): {
  script: Script;
  seed: string;
  attempts: number;
  check: QuotaCheck;
} {
  let best: { seed: string; check: QuotaCheck } | undefined;
  let attempts = 0;
  for (let attempt = 0; attempt < SHOWCASE.maxAttempts; attempt++) {
    attempts = attempt + 1;
    const tried = checkAttempt(base, attempt);
    if (best === undefined || tried.check.met.length > best.check.met.length) best = tried;
    if (tried.check.missing.length === 0) break;
  }
  if (best === undefined) throw new Error('findShowcaseScript: no attempt');
  const script = generateScript(best.seed);
  return {
    script,
    seed: best.seed,
    attempts,
    check: checkQuotas(showcaseWindow(script), script.fixture),
  };
}
