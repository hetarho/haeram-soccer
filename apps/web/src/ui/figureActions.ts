import type { MatchEvent, MatchFrame } from '../../../../packages/contracts/src/types';
import { locate, presentationSamples, type PresentationSample } from './presentationClock';

/** What a recorded action has a figure do (→MATCH-37). */
export type FigureActionKind =
  'kick' | 'longKick' | 'shot' | 'throwIn' | 'header' | 'tackle' | 'slide' | 'catch' | 'dive';

/**
 * One recorded action as a stretch of a player's presentation (→MATCH-37), in running seconds of
 * the presentation clock: the body winds up from `start`, meets the ball at `contact` and has
 * recovered by `end`. `toward` is the pitch point (playback units) it is aimed at: a kick's target,
 * the carrier a tackle goes for, the shooter a keeper faces. A dive keeps the side it goes to, −1
 * the keeper's left and 1 his right.
 */
export interface FigureActionWindow {
  kind: FigureActionKind;
  player: string;
  start: number;
  contact: number;
  end: number;
  toward: [number, number];
  dive?: -1 | 1;
}

/** Metres per playback unit along x and y: x 100 is 105 m and y 100 is 68 m. */
export const PITCH_METRES = [1.05, 0.68] as const;

/** Every number that reads an action out of the record (→MATCH-37), started from prototype B. */
export const FIGURE_ACTION_CONFIG = {
  /** Playback units from the event's `from` within which the ball still sits at the kicker's foot. */
  contactRadius: 2,
  /** Seconds before its event a kick leaves when the minute has no ball track there. */
  fallbackFlight: 0.6,
  /** Seconds before its event the ball track is searched for the departure. */
  maxFlight: 5,
  /** Playback units beyond which a kick is a long one. */
  longKick: 28,
  /** Metres a tackler reaches standing; farther from the carrier he slides. */
  standingReach: 1.2,
  /** Metres from the keeper within which a saved shot arrives in his hands. */
  catchReach: 1.0,
  /** Seconds each action winds up before its contact and recovers after it. */
  span: {
    kick: [0.7, 1.05],
    longKick: [0.7, 1.05],
    shot: [0.7, 1.05],
    throwIn: [1.2, 0.6],
    header: [0.45, 0.6],
    tackle: [0.5, 1.05],
    slide: [0.5, 1.05],
    catch: [0.45, 1.2],
    dive: [0.45, 1.4],
  },
} as const;

/** The longest window any action makes, so a reader knows how far back one can still be running. */
export const FIGURE_ACTION_LONGEST = Math.max(
  ...Object.values(FIGURE_ACTION_CONFIG.span).map(([before, after]) => before + after),
);

/** Recorded actions in which the actor strikes the ball, besides the restarts. */
const STRIKES = new Set<MatchEvent['kind']>([
  'kickoff',
  'pass',
  'cross',
  'cutBack',
  'clearance',
  'shot',
]);

/** A recorded attempt on goal: a shot, a penalty or anything with a shot's outcome. */
const isShot = (event: MatchEvent) =>
  event.kind === 'shot' || event.restart === 'penalty' || !!event.outcome;

/**
 * The actor's action of a recorded touch: a header when the record says so, a throw-in, a shot (a
 * penalty too), a long kick (a cross, a clearance, a corner or anything kicked beyond `longKick`)
 * or a kick. Carries, take-ons, hold-ups, fouls and incidents strike nothing.
 */
function strikeOf(event: MatchEvent): FigureActionKind | undefined {
  if (!event.actor) return undefined;
  if (event.kind === 'restart') {
    if (event.restart === 'throwIn') return 'throwIn';
  } else if (!STRIKES.has(event.kind)) return undefined;
  if (event.header) return 'header';
  if (isShot(event)) return 'shot';
  const units = Math.hypot(event.to[0] - event.from[0], event.to[1] - event.from[1]);
  return event.kind === 'cross' ||
    event.kind === 'clearance' ||
    event.restart === 'corner' ||
    units > FIGURE_ACTION_CONFIG.longKick
    ? 'longKick'
    : 'kick';
}

const metres = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot((a[0] - b[0]) * PITCH_METRES[0], (a[1] - b[1]) * PITCH_METRES[1]);

/** The index of the last of ordered `times` strictly before `t`, −1 when none is. */
function lastBefore(times: readonly number[], t: number) {
  let low = 0,
    high = times.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid]! < t) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

const motionOf = (sample: PresentationSample | undefined, id: string) =>
  sample?.players?.[0].find((m) => m.id === id) ?? sample?.players?.[1].find((m) => m.id === id);

/**
 * Every player's action windows over a playback (→MATCH-37), each list in `start` order. Only what
 * the record names makes one, at the presentation clock's own times (an event of frame `i` at
 * `i·60 + t`, its ball track and samples as `presentationSamples` places them):
 * - a kick, long kick, shot, throw-in or header for the actor of a touch or kicked restart; its
 *   contact is the ball's departure, the last track point before the event that still lies within
 *   `contactRadius` of the event's `from`, else the event minus `fallbackFlight`;
 * - a tackle for the opponent who won a carry or take-on, a slide when the sample before it stood
 *   him farther than `standingReach` from where the carrier acted; an intercepted pass is no tackle;
 * - a catch for the keeper of a saved shot whose arrival lies within `catchReach` of where he is
 *   drawn then, else a dive to the side it arrives on.
 * Frames are read only; nothing here draws, guesses or randomises.
 */
export function figureActionWindows(
  frames: readonly MatchFrame[],
): ReadonlyMap<string, readonly FigureActionWindow[]> {
  const C = FIGURE_ACTION_CONFIG;
  const { samples, times, sampleBreak, track, trackTimes } = presentationSamples([...frames]);
  const windows = new Map<string, FigureActionWindow[]>();
  const add = (
    kind: FigureActionKind,
    player: string,
    contact: number,
    toward: [number, number],
    dive?: -1 | 1,
  ) => {
    const [before, after] = C.span[kind];
    const window: FigureActionWindow = {
      kind,
      player,
      start: contact - before,
      contact,
      end: contact + after,
      toward: [toward[0], toward[1]],
    };
    if (dive) window.dive = dive;
    const list = windows.get(player);
    if (list) list.push(window);
    else windows.set(player, [window]);
  };
  // Where a player is drawn at `t`: between the samples around it, held across a break and where
  // the next sample leaves him out.
  const drawnAt = (id: string, t: number) => {
    const at = locate(times, t, sampleBreak);
    const k = Math.floor(at);
    const here = motionOf(samples[k], id)?.position;
    const next = motionOf(samples[k + 1], id)?.position;
    const mix = at - k;
    return here && next && mix > 0
      ? ([here[0] + (next[0] - here[0]) * mix, here[1] + (next[1] - here[1]) * mix] as const)
      : here;
  };
  frames.forEach((frame, i) => {
    for (const event of frame.events ?? []) {
      const at = i * 60 + event.t;
      const strike = strikeOf(event);
      if (strike) {
        let contact = at - C.fallbackFlight;
        for (
          let k = lastBefore(trackTimes, at);
          k >= 0 && trackTimes[k]! >= at - C.maxFlight;
          k--
        ) {
          const ball = track[k]!;
          if (Math.hypot(ball[0] - event.from[0], ball[1] - event.from[1]) <= C.contactRadius) {
            contact = trackTimes[k]!;
            break;
          }
        }
        add(strike, event.actor, contact, event.to);
      }
      // Only a lost carry or take-on with its winner named is a tackle; a lost pass was intercepted.
      if ((event.kind === 'carry' || event.kind === 'takeOn') && event.lost && event.opponent) {
        const before = samples[Math.max(0, lastBefore(times, at))];
        const tackler = motionOf(before, event.opponent)?.position;
        const carrier = motionOf(before, event.actor)?.position ?? event.from;
        const slide = !!tackler && metres(tackler, event.from) > C.standingReach;
        add(slide ? 'slide' : 'tackle', event.opponent, at, carrier);
      }
      if (strike && isShot(event) && event.outcome === 'save' && event.opponent) {
        // The keeper faces the shooter; the shot arrives where the record ends it.
        const keeper = drawnAt(event.opponent, at);
        if (!keeper || metres(keeper, event.to) <= C.catchReach)
          add('catch', event.opponent, at, event.from);
        else {
          const [ax, ay] = [event.from[0] - keeper[0], event.from[1] - keeper[1]];
          const [bx, by] = [event.to[0] - keeper[0], event.to[1] - keeper[1]];
          // Playback y runs down the screen, so his right is ahead turned a quarter clockwise.
          add('dive', event.opponent, at, event.from, ax * by - ay * bx >= 0 ? 1 : -1);
        }
      }
    }
  });
  for (const list of windows.values())
    list.sort((a, b) => a.start - b.start || a.contact - b.contact);
  return windows;
}
