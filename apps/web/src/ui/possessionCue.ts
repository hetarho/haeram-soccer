import type { MatchEvent, MatchFrame } from '../../../../packages/contracts/src/types';
import type { PresentationSample } from './presentationClock';

/**
 * Who has the ball at the presented instant (→WEB-95):
 * - `carrier`: a recorded player running with it, so a side and a player;
 * - `flight`: a pass, cross, shot or restart under way, with the side whose recorded action sent
 *   it and never a player;
 * - `contested`: a loose ball or a clearance, owned by neither side;
 * - `unknown`: nothing recorded says, as in a sparse historical replay or a stoppage.
 */
export interface PossessionCue {
  state: 'carrier' | 'flight' | 'contested' | 'unknown';
  side?: 0 | 1;
  carrierId?: string;
}

const UNKNOWN: PossessionCue = { state: 'unknown' };
/** Recorded actions a player makes running with the ball. */
const CARRYING = new Set<MatchEvent['kind']>(['carry', 'takeOn', 'holdUp']);
/** Recorded actions that send the ball on its way for the acting side. */
const SENDING = new Set<MatchEvent['kind']>([
  'pass',
  'cross',
  'cutBack',
  'shot',
  'restart',
  'kickoff',
]);

/**
 * The possession cue of the presented sample, `seconds` into its minute. An observed minute's
 * events end where the ball arrives (their `t`), so the action under way is the minute's first
 * event still ahead: its actor carries the ball, or its side has sent it. Without one, the
 * sample's recorded owner and phase decide. The side is never guessed from distance, a receiver
 * or the minute's leading side (`frame.side`).
 */
export function resolvePossessionCue(
  sample: PresentationSample | undefined,
  frame: MatchFrame | undefined,
  seconds: number,
): PossessionCue {
  if (!sample?.players) return UNKNOWN;
  const onPitch = (id: string) =>
    sample.players![0].some((player) => player.id === id)
      ? 0
      : sample.players![1].some((player) => player.id === id)
        ? 1
        : undefined;
  // An event ending now (a goal under its hold) is still the presented action.
  const action = frame?.events?.find((event) => event.t >= seconds);
  if (action) {
    if (CARRYING.has(action.kind)) {
      const side = onPitch(action.actor);
      return side === action.side
        ? { state: 'carrier', side, carrierId: action.actor }
        : { state: 'flight', side: action.side };
    }
    if (SENDING.has(action.kind)) return { state: 'flight', side: action.side };
    if (action.kind === 'clearance') return { state: 'contested' };
    // A foul, card, substitution, injury, offside or whistle: the ball is dead until the restart.
    return UNKNOWN;
  }
  if (sample.ownerId) {
    const side = onPitch(sample.ownerId);
    return side === undefined ? UNKNOWN : { state: 'carrier', side, carrierId: sample.ownerId };
  }
  if (sample.phase === 'transition') return { state: 'contested' };
  return UNKNOWN;
}

/** One string per distinct cue, so a view re-renders only when the cue changes. */
export function possessionKey(cue: PossessionCue) {
  return `${cue.state}:${cue.side ?? '-'}:${cue.carrierId ?? '-'}`;
}
