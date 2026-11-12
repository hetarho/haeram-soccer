import type { MatchPlayback, PlayerMotion } from '../../packages/contracts/src/types';
import {
  presentationSamples,
  type PresentationSample,
} from '../../apps/web/src/entities/match/lib/presentationClock';

/** Metres per playback unit: the 105 × 68 m pitch drawn on 0–100 along each axis. */
export const METRES = [1.05, 0.68] as const;

/** A staged corner at its kick: the sample the players stand on their places in (→MATCH-18). */
export interface StagedCorner {
  /** Running seconds of the kick, on the presentation clock. */
  kick: number;
  /** The sample between the settled beat and the kick. */
  index: number;
  attack: 0 | 1;
  defend: 0 | 1;
  /** The corner's restart event: its taker and scripted receiver. */
  taker: string;
  receiver?: string;
  players: [PlayerMotion[], PlayerMotion[]];
  /** Metres from the goal line the corner is taken at. */
  fromGoal: (p: PlayerMotion) => number;
  /** Metres from the left touchline in the playback's frame. */
  across: (p: PlayerMotion) => number;
  /** The side's players without its goalkeeper. */
  outfield: (side: 0 | 1) => PlayerMotion[];
  keeper: (side: 0 | 1) => PlayerMotion | undefined;
}

/** Metres between two staged players. */
export const metresApart = (a: PlayerMotion, b: PlayerMotion) =>
  Math.hypot(
    (a.position[0] - b.position[0]) * METRES[0],
    (a.position[1] - b.position[1]) * METRES[1],
  );

/**
 * Every corner of a staged playback whose kick follows a settled beat, in order: the players
 * stand on their places between the beat and the kick, so the scene there is the staging's own.
 */
export function stagedCorners(
  playback: MatchPlayback,
  samples: PresentationSample[] = presentationSamples(playback.frames).samples,
): StagedCorner[] {
  const out: StagedCorner[] = [];
  for (const [i, frame] of playback.frames.entries())
    for (const stoppage of frame.stoppages ?? []) {
      if (stoppage.kind !== 'corner') continue;
      const kick = i * 60 + Math.min(60, stoppage.kick);
      const settled = i * 60 + Math.min(stoppage.kick, stoppage.settled);
      const event = (frame.events ?? [])
        .filter((e) => e.restart === 'corner')
        .sort((a, b) => Math.abs(i * 60 + a.t - kick) - Math.abs(i * 60 + b.t - kick))[0];
      const index = samples.findLastIndex(
        (sample) => sample.time >= settled && sample.time <= kick && !!sample.players,
      );
      if (!event || index < 0) continue;
      const attack = event.side as 0 | 1;
      const goal = event.from[0] > 50 ? 100 : 0;
      const players = samples[index]!.players!;
      const isKeeper = (side: 0 | 1, p: PlayerMotion) =>
        playback.squads[side].find((player) => player.id === p.id)?.position === 'GK';
      out.push({
        kick,
        index,
        attack,
        defend: attack === 0 ? 1 : 0,
        taker: event.actor,
        ...(event.receiver === undefined ? {} : { receiver: event.receiver }),
        players,
        fromGoal: (p) => Math.abs(goal - p.position[0]) * METRES[0],
        across: (p) => p.position[1] * METRES[1],
        outfield: (side) => players[side].filter((p) => !isKeeper(side, p)),
        keeper: (side) => players[side].find((p) => isKeeper(side, p)),
      });
    }
  return out;
}
