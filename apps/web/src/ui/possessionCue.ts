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
 * The possession cue of the presented sample, `seconds` into its minute. The minute's recorded
 * holder at that instant (`frame.holders`) carries the ball. Otherwise an observed minute's events
 * end where the ball arrives (their `t`), so the action under way is the minute's first event still
 * ahead: its side has sent the ball, or a carry lost it (contested). Older frames without holders
 * read a carrying action's actor as the carrier, then the sample's recorded owner and phase. The
 * side is never guessed from distance, a receiver or the minute's leading side (`frame.side`).
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
  const holders = frame?.holders;
  const holder = holders?.findLast(([t]) => t <= seconds)?.[1];
  if (holder) {
    const side = onPitch(holder);
    if (side !== undefined) return { state: 'carrier', side, carrierId: holder };
  }
  // An event ending now (a goal under its hold) is still the presented action.
  const action = frame?.events?.find((event) => event.t >= seconds);
  if (action) {
    // Nobody holds the ball: a carry under way has lost it.
    if (holders && CARRYING.has(action.kind)) return { state: 'contested' };
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
  if (sample.ownerId && !holders) {
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
