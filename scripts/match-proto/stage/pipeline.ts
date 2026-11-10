// The pipeline from a seed to a playback: generate a script (or search the showcase scripts),
// stage it, and check the showcase quotas on the beats actually performed. A pure function of its
// arguments (ARCH-5).
import { PROTO_CONFIG } from '../core/config.ts';
import type { Playback, Script } from '../core/types.ts';
import { generateScript } from '../script/generate.ts';
import {
  checkQuotas,
  findShowcaseScript,
  showcaseScripts,
  type QuotaCheck,
} from '../script/showcase.ts';
import { performScript } from './perform.ts';

export interface ProduceInfo {
  seed: string;
  attempts: number;
  staged: number;
  check: QuotaCheck;
}

const staged = (script: Script, duration?: number): { playback: Playback; check: QuotaCheck } => {
  const playback = performScript(script, duration === undefined ? undefined : { duration });
  return { playback, check: checkQuotas(playback.beats, playback.fixture) };
};

/**
 * `showcase: false` stages `generateScript(base)`. Otherwise it stages the showcase scripts of
 * `base` one by one and returns the first whose performed beats meet every quota; after
 * `grammar.showcase.maxStaged` candidates (or when the search ends) the one missing the fewest;
 * when the search finds none, the closest script `findShowcaseScript` gives.
 */
export function producePlayback(
  base: string,
  options?: { duration?: number; showcase?: boolean },
): { playback: Playback; info: ProduceInfo } {
  const duration = options?.duration;
  if (options?.showcase === false) {
    const { playback, check } = staged(generateScript(base), duration);
    return { playback, info: { seed: base, attempts: 1, staged: 1, check } };
  }
  let best: { playback: Playback; info: ProduceInfo } | undefined;
  let count = 0;
  for (const found of showcaseScripts(base)) {
    count += 1;
    const { playback, check } = staged(found.script, duration);
    const info: ProduceInfo = {
      seed: found.seed,
      attempts: found.attempt + 1,
      staged: count,
      check,
    };
    if (best === undefined || check.missing.length < best.info.check.missing.length) {
      best = { playback, info };
    }
    best.info.staged = count;
    best.info.attempts = found.attempt + 1;
    if (check.missing.length === 0 || count >= PROTO_CONFIG.grammar.showcase.maxStaged) break;
  }
  if (best) return best;
  const fallback = findShowcaseScript(base);
  const { playback, check } = staged(fallback.script, duration);
  return {
    playback,
    info: { seed: fallback.seed, attempts: fallback.attempts, staged: 1, check },
  };
}
