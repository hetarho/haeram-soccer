import type { MatchPlayback, PlayerMotion, World } from '../../packages/contracts/src/types';
import { advanceToNextMatch, stagedPlayback } from '../../packages/engine/src/testing';
import { motionStateLabel } from '../../apps/web/src/features/match-viewer/lib/motionState';
import { advanceRound, fullStatsRead, MATCH_MODEL_RELEASE } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/features/match-viewer/lib/goalFeedback';
import {
  deadBallBeats,
  presentationAdvance,
  presentationSamples,
  runningLength,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
} from '../../apps/web/src/entities/match/lib/presentationClock';
import {
  fullStatsCoverage,
  leagueStatsScope,
} from '../../apps/web/src/entities/league/lib/fullStatsView';
import { writerActivation } from './full-model-workload';
import { DISABLED_RELEASE, ENABLED_RELEASE } from './releases';

/**
 * Marked synthetic fixture for the full-model continuity journey (T402, T286; →SAVE-22/23, HIST-17,
 * WEB-89/94/95, KIT-12). A supported career taken over before the full model's release (taken over
 * here, so it carries the current game version and no stored label)
 * plays its first rounds on the pre-feature model and is saved without model data. With the
 * release switch on (since T286) the build imports it as it is and its writer load
 * (`Host.adoptModel`) records the full model mid-season at the next unplayed day; with the switch
 * off the activation is done in Node with an explicit enabled release and imported (T402).
 * `activated` is that activation the host's way (`writerActivation`, checked against the host in
 * full-model-workload.test.ts), so the journey knows what the build must hold either way. Every
 * result is real football; every responsibility is delegated so nothing holds the watch.
 */
export const ROUNDS_BEFORE = 3;
// Ten candidates: on match-model revision 3 none of the first three next matches holds both
// scenes, and a later football change can starve a short list again.
const SEEDS = [
  'full-model-continuity',
  ...Array.from({ length: 9 }, (_, n) => `full-model-continuity-${n + 2}`),
];
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
    /**
     * The most running minutes the presentation clock covers in `realMs` at `FAST_SPEED` from any
     * second of the match: dead-ball rushes (→WEB-32) run faster than running play.
     */
    fastest: (realMs: number) => number;
    /**
     * The kick sample of a staged corner (→MATCH-18) with a defender goal-side of a man in the box,
     * where that marker stands then, in the pitch's 0–100 units.
     */
    setPiece: {
      index: number;
      label: string;
      marker: Who;
      at: readonly [number, number];
      /** What his sheet says he is doing: his staged state's label. */
      state: string;
    };
  };
}

function career(seed: string): World {
  const w = careerWorld({ country: 'ENG', seed }, DISABLED_RELEASE);
  const settings = w.settings!;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  for (let n = 0; n < ROUNDS_BEFORE; n++) advanceRound(w, undefined, false);
  return w;
}

/** Metres per playback unit: the 105 × 68 m pitch drawn on 0–100 along each axis. */
const METRES = [1.05, 0.68] as const;

/**
 * The kick of the first corner the staging places from a settled beat (→MATCH-18): its sample and
 * a defender standing goal-side of an attacker in the box, with the state his sheet names.
 */
function setPieceShot(playback: MatchPlayback) {
  const { samples } = presentationSamples(playback.frames);
  for (const [i, frame] of playback.frames.entries())
    for (const stoppage of frame.stoppages ?? []) {
      if (stoppage.kind !== 'corner') continue;
      const kick = i * 60 + Math.min(60, stoppage.kick);
      const settled = i * 60 + Math.min(stoppage.kick, stoppage.settled);
      const event = (frame.events ?? []).find((e) => e.restart === 'corner');
      const index = samples.findLastIndex(
        (sample) => sample.time >= settled && sample.time <= kick && !!sample.players,
      );
      if (!event || index < 0) continue;
      const attack = event.side as 0 | 1;
      const side: 0 | 1 = attack === 0 ? 1 : 0;
      const goal = event.from[0] > 50 ? 100 : 0;
      const fromGoal = (p: PlayerMotion) => Math.abs(goal - p.position[0]) * METRES[0];
      const players = samples[index]!.players!;
      const keeper = (s: 0 | 1, p: PlayerMotion) =>
        playback.squads[s].find((player) => player.id === p.id)?.position === 'GK';
      const runner = players[attack].find(
        (p) => !keeper(attack, p) && p.id !== event.receiver && fromGoal(p) <= 16.5,
      );
      const marker =
        runner &&
        players[side].find(
          (p) =>
            !keeper(side, p) &&
            fromGoal(p) < fromGoal(runner) &&
            Math.hypot(
              (p.position[0] - runner.position[0]) * METRES[0],
              (p.position[1] - runner.position[1]) * METRES[1],
            ) <= 4,
        );
      if (!marker) continue;
      return {
        samples: samples.length,
        shot: {
          index,
          label: playback.frames[samples[index]!.frame]!.label,
          marker: { side, index: playback.squads[side].findIndex((p) => p.id === marker.id) },
          at: marker.position,
          state: motionStateLabel(marker),
        },
      };
    }
  return undefined;
}

/**
 * The first seeded career whose next own match has a goal and a staged corner: the
 * journey checks those scenes, not a seed, and a football change can leave one match without them.
 */
export function continuityCareer(): ContinuityCareer {
  for (const seed of SEEDS) {
    const world = career(seed);
    // What the build holds after the import, whichever side activates it.
    const activated = writerActivation(world, ENABLED_RELEASE);
    const settled = advanceToNextMatch(structuredClone(activated));
    if (!settled) continue;
    const record = settled.record;
    const goals = record.highlights.filter((h) => h.action === '골');
    if (!goals.length) continue;
    // The scripted model's frames are staged as the browser stages them; only a match with a goal
    // is staged, since staging is what costs the time here.
    const playback = stagedPlayback(settled);
    const scene = setPieceShot(playback);
    if (!scene) continue;
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
        fastest: (realMs: number) => {
          const length = runningLength(playback.frames.length);
          const beats = deadBallBeats(playback.frames);
          let most = 0;
          for (let at = 0; at < length; at++)
            most = Math.max(most, presentationAdvance(at, realMs, FAST_SPEED, length, beats) - at);
          return most / 60;
        },
        setPiece: scene.shot,
      },
    };
  }
  throw new Error('no seeded career whose next match has a goal and a held set piece');
}
