import type { PlayerMotion, World } from '../../packages/contracts/src/types';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { advanceToNextMatch, stagedPlayback } from '../../packages/engine/src/testing';
import { presentationSamples } from '../../apps/web/src/entities/match/lib/presentationClock';
import { motionStateLabel } from '../../apps/web/src/features/match-viewer/lib/motionState';
import { withCandidateModel } from '../fixtures/worlds';
import { stoppages } from './preparation';

/**
 * Both sides through a corner in observation (→MATCH-12, MATCH-17, MATCH-18): the walk-in to its
 * recorded kick and the places both sides hold for the delivery. Marked synthetic career: a fresh
 * takeover on the released scripted model (`withCandidateModel` keeps it explicit whatever the
 * switch says), every responsibility delegated so nothing holds the watch. The scene is the
 * staging's own: a reference run of the same seeded match, staged in Node as the page's worker
 * stages it, finds the first corner whose kick follows a settled beat, and the page is paused on
 * that sample.
 */
function career(seed: string): World {
  const w = careerWorld({ country: 'ENG', seed });
  const settings = w.settings!;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  return withCandidateModel(w);
}

export type Who = { side: 0 | 1; index: number };
/** A paused sample: its index on the page's timeline and the label of its minute. */
export type Shot = { index: number; label: string };
/** Metres per playback unit: the 105 × 68 m pitch drawn on 0–100 along each axis. */
const METRES = [1.05, 0.68] as const;
/**
 * MATCH-18 at a corner, read at its kick: the attacking side keeps 2–3 outfielders back near
 * halfway (more than 40 m from the goal it attacks), the defending side leaves 1–2 up as outlets
 * (more than 35 m from its goal), and every attacker in the box but the scripted receiver has a
 * defender goal-side of him within reach.
 */
export const CORNER_RULE = {
  back: [2, 3],
  up: [1, 2],
  backFromGoal: 40,
  upFromGoal: 35,
  box: { depth: 16.5, from: 13.84, to: 54.16 },
  reach: 4,
} as const;

/** The first corner of a seeded reference match whose kick follows its settled beat. */
function recordedScene(seed: string) {
  const playback = stagedPlayback(advanceToNextMatch(career(seed))!);
  const { samples } = presentationSamples(playback.frames);
  const stops = stoppages(playback);
  for (const [i, frame] of playback.frames.entries())
    for (const stoppage of frame.stoppages ?? []) {
      if (stoppage.kind !== 'corner') continue;
      const kick = i * 60 + Math.min(60, stoppage.kick);
      const settled = i * 60 + Math.min(stoppage.kick, stoppage.settled);
      const event = (frame.events ?? [])
        .filter((e) => e.restart === 'corner')
        .sort((a, b) => Math.abs(i * 60 + a.t - kick) - Math.abs(i * 60 + b.t - kick))[0];
      // The players stand on their places between the settled beat and the kick.
      const index = samples.findLastIndex(
        (sample) => sample.time >= settled && sample.time <= kick && !!sample.players,
      );
      const preparation = stops.find(({ to }) => Math.abs(to - kick) <= 0.1);
      if (!event || index < 0 || !preparation) continue;
      const attack = event.side as 0 | 1;
      const defend: 0 | 1 = attack === 0 ? 1 : 0;
      const goal = event.from[0] > 50 ? 100 : 0;
      const players = samples[index]!.players!;
      const squad = (side: 0 | 1, p: PlayerMotion) =>
        playback.squads[side].find((player) => player.id === p.id);
      const outfield = (side: 0 | 1) =>
        players[side].filter((p) => squad(side, p)?.position !== 'GK');
      /** Metres from the goal line the corner is taken at. */
      const fromGoal = (p: PlayerMotion) => Math.abs(goal - p.position[0]) * METRES[0];
      const across = (p: PlayerMotion) => p.position[1] * METRES[1];
      const back = outfield(attack).filter((p) => fromGoal(p) > CORNER_RULE.backFromGoal);
      const up = outfield(defend).filter((p) => fromGoal(p) > CORNER_RULE.upFromGoal);
      const inBox = outfield(attack).filter(
        (p) =>
          p.id !== event.receiver &&
          p.id !== event.actor &&
          fromGoal(p) <= CORNER_RULE.box.depth &&
          across(p) >= CORNER_RULE.box.from &&
          across(p) <= CORNER_RULE.box.to,
      );
      const distance = (a: PlayerMotion, b: PlayerMotion) =>
        Math.hypot(
          (a.position[0] - b.position[0]) * METRES[0],
          (a.position[1] - b.position[1]) * METRES[1],
        );
      const markers = inBox.map((runner) =>
        outfield(defend).find(
          (d) => fromGoal(d) < fromGoal(runner) && distance(d, runner) <= CORNER_RULE.reach,
        ),
      );
      const who = (side: 0 | 1, p: PlayerMotion): Who => ({
        side,
        index: playback.squads[side].findIndex((player) => player.id === p.id),
      });
      const keeper = players[defend].find((p) => squad(defend, p)?.position === 'GK');
      /** Where `who` stands at a paused sample, in the pitch's 0–100 units. */
      const place = (at: Shot, { side, index }: Who) =>
        samples[at.index]!.players![side].find((p) => p.id === playback.squads[side][index]!.id)!
          .position;
      const state = (at: Shot, { side, index }: Who) =>
        motionStateLabel(
          samples[at.index]!.players![side].find((p) => p.id === playback.squads[side][index]!.id)!,
        );
      return {
        playback,
        preparation,
        place,
        state,
        samples: samples.length,
        shot: { index, label: playback.frames[samples[index]!.frame]!.label },
        back: back.length,
        up: up.length,
        inBox: inBox.length,
        unmarked: inBox.filter((_, k) => !markers[k]).map((p) => p.id),
        runner: inBox[0] && who(attack, inBox[0]),
        marker: markers[0] && who(defend, markers[0]),
        rest: back[0] && who(attack, back[0]),
        outlet: up[0] && who(defend, up[0]),
        keeper: keeper && who(defend, keeper),
      };
    }
  return undefined;
}
/**
 * The first of a few seeded careers whose reference match has a corner kicked from a settled beat:
 * the scene, not the seed, is what this journey checks.
 */
export function sceneCareer() {
  const seeds = [
    'set-piece-defence',
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `set-piece-defence-${n}`),
  ];
  for (const seed of seeds) {
    const scene = recordedScene(seed);
    if (scene) return { scene, career: career(seed) };
  }
  throw new Error('no corner kicked from a settled beat in the reference matches');
}
