/** Pure reports over the positions and events actually returned by staging. No clocks or timers. */
import type { MatchScript, StagingSide } from '../../../contracts/src/match-script';
import type { MatchDetail } from '../script/detail';
import { compareRecord, countScript, scriptCost } from '../script/count';
import { STAGING_CONFIG } from './config';
import { stageFixture, stageScript } from './input';
import { computeMetrics } from './metrics';
import type { StageFrame, StageEvent, StagingId } from './staging';
import type { Playback, StageEvent as InternalEvent } from './types';
export { METRIC_IDS } from './metrics';
export type { Metric } from './metrics';

export interface FitMetric {
  id: string;
  value: number;
  pass?: boolean;
  detail?: string;
}

function playback(
  frames: readonly StageFrame[],
  events: readonly StageEvent[],
  script: MatchScript,
  sides: readonly [StagingSide, StagingSide],
): Playback {
  const fixture = stageFixture(sides);
  const dense = stageScript(script, fixture);
  const index = (id: StagingId | null): number =>
    id === null
      ? -1
      : (fixture.players.find((p) => p.team === id.side && p.line === id.line)?.index ?? -1);
  const performed = new Set(events.filter((e) => e.kind === 'performed').map((e) => e.beat));
  let score: readonly [number, number] = [0, 0];
  for (const e of events) if (e.kind === 'goal' && e.score) score = e.score;
  return {
    version: 1,
    seed: script.seed,
    hz: STAGING_CONFIG.hz,
    fixture,
    duration: frames.at(-1)?.t ?? 0,
    beats: dense.beats.filter((b) => performed.has(b.index)),
    score,
    frames: frames.map((f) => ({
      ...f,
      owner: index(f.owner),
      p: fixture.players.flatMap(
        (p) =>
          f.p.find((q) => q.player.side === p.team && q.player.line === p.line)?.at ?? [NaN, NaN],
      ),
    })),
    events: events.map((e): InternalEvent => {
      const { actor, other, ...rest } = e;
      return {
        ...rest,
        actor: index(actor),
        ...(other === undefined ? {} : { other: index(other) }),
      };
    }),
  };
}

/** The prototype's 31 naturalness and staging metrics with its unchanged measured limits. */
export function stagingMetrics(
  frames: readonly StageFrame[],
  events: readonly StageEvent[],
  script: MatchScript,
  sides: readonly [StagingSide, StagingSide],
) {
  return computeMetrics(playback(frames, events, script, sides));
}

const round = (n: number, places: number): number => Math.round(n * 10 ** places) / 10 ** places;
const WINNERS = ['intercept', 'tackle', 'loose'] as const;
const CONTESTS = ['intercept', 'tackle', 'foul', 'loose', 'block', 'save'];

/** Recount performed beats, substituting only a winner explicitly named by a staged event.
 * Incident and penalty scenes remain plain dead balls in T828, with their script facts intact. */
export function fitLines(
  frames: readonly StageFrame[],
  events: readonly StageEvent[],
  script: MatchScript,
  detail: MatchDetail,
): FitMetric[] {
  const performed = new Set(events.filter((e) => e.kind === 'performed').map((e) => e.beat));
  const winners = new Map(
    events
      .filter((e) => WINNERS.some((k) => e.kind === k) && e.other)
      .map((e) => [e.beat, e.other!]),
  );
  const staged: MatchScript = {
    ...script,
    beats: script.beats
      .filter((b) => performed.has(b.index))
      .map((b) => {
        const won = winners.get(b.index);
        return won && b.opponent !== undefined ? { ...b, opponent: won.line } : b;
      }),
  };
  const differs = compareRecord(detail, countScript(staged, detail));
  const contests = events.filter((e) => CONTESTS.includes(e.kind));
  const recast = contests.filter((e) => e.recast);
  const stretch = contests.filter((e) => e.stretch);
  const cost = scriptCost(script, detail);
  const missing = script.beats.filter((b) => !performed.has(b.index));
  const judged = (id: string, value: number, detail?: string): FitMetric => ({
    id,
    value,
    pass: value === 0,
    ...(detail ? { detail } : {}),
  });
  const live = new Map<number, number>();
  for (const f of frames)
    if (f.live && f.clock !== undefined) {
      const m = Math.min(detail.length - 1, Math.floor(f.clock / 60));
      live.set(m, (live.get(m) ?? 0) + STAGING_CONFIG.tick);
    }
  const ratios = [...live.values()].map((s) => s / 60).sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2);
  const ratio =
    ratios.length === 0
      ? 0
      : ratios.length % 2
        ? ratios[middle]
        : (ratios[middle - 1] + ratios[middle]) / 2;
  return [
    judged('fit.exact', differs.length, differs.slice(0, 8).join(',')),
    judged(
      'fit.performed',
      missing.length,
      missing
        .slice(0, 8)
        .map((b) => b.index)
        .join(','),
    ),
    judged('fit.recast', recast.length),
    {
      id: 'fit.stretch',
      value: round(contests.length ? stretch.length / contests.length : 0, 3),
      detail: `${stretch.length}/${contests.length}`,
    },
    { id: 'fit.late', value: events.filter((e) => e.late).length },
    ...(['links', 'linkMetres', 'miscontrols', 'connectiveRestarts'] as const).map((key) => ({
      id: `fit.${key}`,
      value: cost[key],
    })),
    {
      id: 'fit.orphans',
      value: cost.orphanSetPieces + cost.orphanFreeKickShots,
      detail: `setPieces=${cost.orphanSetPieces} freeKickShots=${cost.orphanFreeKickShots}`,
    },
    { id: 'fit.stagedSeconds', value: round(frames.at(-1)?.t ?? 0, 1) },
    { id: 'fit.clockRatio', value: round(ratio, 2) },
  ];
}
