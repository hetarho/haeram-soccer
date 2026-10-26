import type { MatchPlayback, PlayerMotion, World } from '../../packages/contracts/src/types';
import {
  advanceRound,
  advanceToNextMatch,
  createWorld,
  fullStatsRead,
  MATCH_MODEL_RELEASE,
} from '../../packages/engine/src/index';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import {
  presentationSamples,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
} from '../../apps/web/src/ui/presentationClock';
import { fullStatsCoverage, leagueStatsScope } from '../../apps/web/src/ui/fullStatsView';
import { writerActivation } from './full-model-workload';
import { DISABLED_RELEASE, ENABLED_RELEASE } from './releases';

/**
 * Marked synthetic fixture for the full-model continuity journey (T402, T286; →SAVE-22/23, HIST-17,
 * WEB-89/94/95, KIT-12). A supported rules-4.0.0 career founded before the full model's release
 * plays its first rounds on the pre-feature model and is saved without model data. With the
 * release switch on (since T286) the build imports it as it is and its writer load
 * (`Host.adoptModel`) records the full model mid-season at the next unplayed day; with the switch
 * off the activation is done in Node with an explicit enabled release and imported (T402).
 * `activated` is that activation the host's way (`writerActivation`, checked against the host in
 * full-model-workload.test.ts), so the journey knows what the build must hold either way. Every
 * result is real football; every responsibility is delegated so nothing holds the watch.
 */
export const ROUNDS_BEFORE = 3;
const SEEDS = ['full-model-continuity', 'full-model-continuity-2', 'full-model-continuity-3'];
/** The speed the journey plays the match out at: the fastest offered (→WEB-32). */
export const FAST_SPEED = WATCH_SPEEDS.at(-1)!;
/** Real ms one running minute lasts at `FAST_SPEED`. */
export const FAST_MINUTE_MS = WATCH_MINUTE_MS / FAST_SPEED;

/** A player as the inspector names him: his side and his index in the matchday squad. */
export interface Who {
  side: 0 | 1;
  index: number;
}
export interface ContinuityCareer {
  /** The career as a writer before the release saved it: no model data. */
  world: World;
  /** The writer load's activation of it: one revision on, the model recorded there. */
  activated: World;
  /** What the journey imports: `world` for the build to activate, else `activated` (switch off). */
  imported: World;
  /** Whether the build's own writer load activates the imported career (the switch is on). */
  buildActivates: boolean;
  /** The coverage line the build shows for the own league at import (→WEB-89). */
  coverage: string;
  /** Its start, kept through play, reload and import: `<day>부터 기록`. */
  from: string;
  /** Own-league fixtures settled before the boundary, which stay untracked. */
  untracked: number;
  /** The own match the journey watches, as Node plays it (the candidate's portable math, T358). */
  next: {
    id: string;
    round: number;
    /** The final score as the scoreboard writes it, and every running score before it in order. */
    scores: string[];
    /** Each goal's scoring side, in order. */
    sides: (0 | 1)[];
    /** Presentation samples on the page's timeline. */
    samples: number;
    /** Real ms the whole match runs at `FAST_SPEED`, every goal's hold (→WEB-94) included. */
    watchMs: number;
    /** A sample of a delivered set piece where six or more defenders hold set-piece jobs (T348). */
    setPiece: { index: number; label: string; marker: Who };
  };
}

function career(seed: string): World {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Full Model Continuity',
      color: '#2a4d6a',
      seed,
      level: 'easy',
    },
    DISABLED_RELEASE,
  );
  const settings = w.settings!;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  for (let n = 0; n < ROUNDS_BEFORE; n++) advanceRound(w, undefined, false);
  return w;
}

/** A committed set-piece mark or cover the engine recorded, still held. */
const job = (p: PlayerMotion) =>
  !!p.intention &&
  !p.intention.ended &&
  p.intention.priority === 'committed' &&
  (p.intention.kind === 'mark' || p.intention.kind === 'cover');

/** The first sample whose defending side holds six or more set-piece jobs, with one marker. */
function setPieceShot(playback: MatchPlayback) {
  const { samples } = presentationSamples(playback.frames);
  for (let index = 0; index < samples.length; index++)
    for (const side of [0, 1] as const) {
      const players = samples[index]!.players?.[side] ?? [];
      if (players.filter(job).length < 6) continue;
      const marker = players.find(
        (p) => job(p) && p.intention!.kind === 'mark' && p.state === 'mark',
      );
      if (!marker) continue;
      return {
        samples: samples.length,
        shot: {
          index,
          label: playback.frames[samples[index]!.frame]!.label,
          marker: { side, index: playback.squads[side].findIndex((p) => p.id === marker.id) },
        },
      };
    }
  return undefined;
}

/**
 * The first seeded career whose next own match has a goal and a held set-piece delivery: the
 * journey checks those scenes, not a seed, and a football change can leave one match without them.
 */
export function continuityCareer(): ContinuityCareer {
  for (const seed of SEEDS) {
    const world = career(seed);
    // What the build holds after the import, whichever side activates it.
    const activated = writerActivation(world, ENABLED_RELEASE);
    const playback = advanceToNextMatch(structuredClone(activated));
    if (!playback) continue;
    const record = playback.record;
    const goals = record.highlights.filter((h) => h.action === '골');
    const scene = setPieceShot(playback);
    if (!goals.length || !scene) continue;
    const running = [0, 0];
    const scores = goals.map((goal) => {
      running[goal.side]!++;
      return `${running[0]} : ${running[1]}`;
    });
    if (scores.at(-1) !== `${record.score.home} : ${record.score.away}`)
      throw new Error(`goal highlights ${scores.at(-1)} disagree with the score`);
    // The own league's lens reads this scope (→WEB-89).
    const coverage = fullStatsCoverage(
      fullStatsRead(activated, leagueStatsScope(activated)),
      activated.year,
    );
    if (coverage.status !== 'partial') throw new Error(`coverage ${coverage.status} at activation`);
    return {
      world,
      activated,
      imported: MATCH_MODEL_RELEASE.enabled ? world : activated,
      buildActivates: MATCH_MODEL_RELEASE.enabled,
      coverage: coverage.text,
      from: coverage.text.split(' · ')[0]!,
      untracked: coverage.untracked,
      next: {
        id: record.id,
        round: record.round,
        scores,
        sides: goals.map((goal) => goal.side),
        samples: scene.samples,
        watchMs:
          playback.frames.length * FAST_MINUTE_MS + goals.length * GOAL_FEEDBACK_CONFIG.holdMs,
        setPiece: scene.shot,
      },
    };
  }
  throw new Error('no seeded career whose next match has a goal and a held set piece');
}
