/**
 * Real-time pace (MATCH-12): the staged motion is shown at one match second per staged second, so
 * the performance itself keeps time with the record. Its fixed moments (a shot, an incident, a
 * recorded source event and each period's whistle, added time included) are pins; between two
 * pins every beat is due when the time left is shared out in proportion to what each still needs.
 * A beat ahead of time is played calmly (a longer hold, a slower restart) and one behind quickly
 * (a short hold, a quick restart), so a crowded record minute borrows from a sparse neighbour and
 * the minutes past the record's last beat of a half fill with play, not slow motion.
 * Presentation only: the script, its clock and the record never change.
 */
import { travel } from '../script/clock';
import { framePeriods, isClockAnchor, recordSources } from './frame-clock';
import { STAGING_CONFIG } from './config';
import { OFFSET } from '../match/clock';
import type { MatchScript } from '../../../contracts/src/match-script';
import type { Beat } from './types';
import { RESTART_KINDS } from './types';

type RestartKind = keyof typeof STAGING_CONFIG.stage.restart.delay;

/**
 * Module constants, not lab tunables (the lab catalog lists only the config objects).
 * `hold`: seconds on the ball before an open-play action (base when on time, the range otherwise);
 * `restart`: a dead ball is taken no quicker than `quick` of its scene delay and no slower than
 * `slowest` seconds; `stoppage`: the longest stoppage hold; `weight`: the share of spare time a
 * dead ball takes against an open-play touch; `extra`: seconds a beat kind needs beyond its hold
 * and ball travel (the tackle or foul scene, the beaten man); `scene`: seconds an incident's scene
 * needs, and `beforeAction` the share of it that comes before the anchored fact.
 */
export const PACE = {
  hold: { base: 0.8, min: 0.2, max: 4.5 },
  restart: {
    quick: 0.6,
    slowest: { kickOff: 45, throwIn: 15, goalKick: 25, corner: 30, freeKick: 30 },
  },
  stoppage: 30,
  weight: { dead: 5, open: 1 },
  extra: { foul: 3, takeOn: 1.5, tackled: 1 },
  scene: { sub: 30, card: 15, injury: 45, beforeAction: 0.4 },
  /** Seconds behind the clock from which a carrier runs with the ball, `dribble` times faster. */
  hurry: { behind: 1, dribble: 1.3 },
} as const;

/** How a beat is paced: its hold, a restart's scene delay (absent when not a restart), and
 * whether it is behind the clock. */
export interface Paced {
  hold: number;
  delay?: number;
  hurry: boolean;
}

/** Per beat, precomputed: the period's pin clock it is due by, and prefix sums inside the period. */
export interface PacePlan {
  /** Period-relative pin seconds (`clock - OFFSET`) each beat's next pin falls at. */
  pin: number[];
  /** Index of that pin's beat, or -1 for the period's whistle. */
  pinBeat: number[];
  /** One past the period's last beat, and the period's whistle (period-relative seconds). */
  periodEnd: number[];
  close: number[];
  /** Seconds each beat needs when every hold and delay is at its base. */
  need: number[];
  /** Share weights of spare time. */
  weight: number[];
  /** Prefix sums of `need` and `weight` over the whole beat list. */
  needSum: number[];
  weightSum: number[];
  /** Seconds a fixed beat needs before its anchored fact. */
  pre: number[];
  fixed: boolean[];
}

const restartKind = (b: Beat): RestartKind | undefined =>
  RESTART_KINDS.includes(b.kind) && b.kind !== 'penalty' && b.kind !== 'shootoutKick'
    ? (b.kind as RestartKind)
    : undefined;

const sceneSeconds = (b: Beat): number =>
  (b.original?.incidents ?? []).reduce(
    (s, x) => s + (x.kind === 'sub' ? 0 : x.kind === 'injury' ? PACE.scene.injury : PACE.scene.card),
    b.original?.incidents?.some((x) => x.kind === 'sub') ? PACE.scene.sub : 0,
  );

const baseDelay = (b: Beat): number => {
  const kind = restartKind(b);
  return kind ? STAGING_CONFIG.stage.restart.delay[kind] : 0;
};

const baseHold = (b: Beat): number => (b.kind === 'stoppage' ? b.hold : PACE.hold.base);

function need(b: Beat): number {
  const extra =
    b.outcome === 'foul'
      ? PACE.extra.foul
      : b.kind === 'takeOn'
        ? PACE.extra.takeOn
        : b.outcome === 'tackled'
          ? PACE.extra.tackled
          : 0;
  return (
    baseDelay(b) + baseHold(b) + (b.original ? travel(b.original) : 0) + extra + sceneSeconds(b)
  );
}

const isDead = (b: Beat): boolean => restartKind(b) !== undefined || b.kind === 'stoppage';

/** The plan of a bound script's beats; `added` is the record's added minutes per period. */
export function pacePlan(
  script: MatchScript,
  beats: readonly Beat[],
  added: readonly number[],
): PacePlan {
  const sources = recordSources(script);
  const n = beats.length;
  const plan: PacePlan = {
    pin: new Array<number>(n).fill(0),
    pinBeat: new Array<number>(n).fill(-1),
    periodEnd: new Array<number>(n).fill(n),
    close: new Array<number>(n).fill(0),
    need: beats.map(need),
    weight: beats.map((b) => (isDead(b) ? PACE.weight.dead : PACE.weight.open)),
    needSum: [0],
    weightSum: [0],
    pre: beats.map(
      (b) =>
        baseDelay(b) + PACE.hold.base + sceneSeconds(b) * PACE.scene.beforeAction,
    ),
    fixed: beats.map(() => false),
  };
  for (let i = 0; i < n; i++) {
    plan.needSum.push(plan.needSum[i] + plan.need[i]);
    plan.weightSum.push(plan.weightSum[i] + plan.weight[i]);
  }
  for (const p of framePeriods(script, added)) {
    const first = p.beats[0].index;
    const end = p.minutes * 60;
    let pin = end,
      pinBeat = -1;
    for (let k = p.beats.length - 1; k >= 0; k--) {
      const b = p.beats[k];
      const i = b.index;
      if (!beats[i] || beats[i].original !== b) continue;
      plan.pin[i] = pin;
      plan.pinBeat[i] = pinBeat;
      plan.periodEnd[i] = p.beats.at(-1)!.index + 1;
      plan.close[i] = end;
      if (i !== first && isClockAnchor(b, sources)) {
        plan.fixed[i] = true;
        pin = b.clock - OFFSET[p.period - 1] * 60;
        pinBeat = i;
        plan.pin[i] = pin;
        plan.pinBeat[i] = i;
      }
    }
  }
  return plan;
}

/**
 * The hold and restart delay of beat `i`, begun `elapsed` staged seconds after its period began:
 * the time left to its pin, less what the beats up to the pin need, shared by weight.
 */
export function paceBeat(plan: PacePlan, beat: Beat, i: number, elapsed: number): Paced {
  const j = plan.pinBeat[i];
  const left = plan.pin[i] - elapsed;
  let spare: number;
  if (j === i) spare = left - plan.pre[i];
  else {
    const upTo = j < 0 ? plan.periodEnd[i] : j;
    const needed = plan.needSum[upTo] - plan.needSum[i] + (j < 0 ? 0 : plan.pre[j]);
    const weights = plan.weightSum[upTo] - plan.weightSum[i] + (j < 0 ? 0 : plan.weight[j]);
    // The whistle's interval ends with the period's last beat, whose own need is counted above.
    spare = ((left - needed) * plan.weight[i]) / Math.max(plan.weight[i], weights);
  }
  const kind = restartKind(beat);
  const hurry = spare < -PACE.hurry.behind;
  if (beat.kind === 'stoppage')
    return { hold: Math.min(PACE.stoppage, Math.max(PACE.hold.min, beat.hold + spare)), hurry };
  if (!kind)
    return {
      hold: Math.min(PACE.hold.max, Math.max(PACE.hold.min, PACE.hold.base + spare)),
      hurry,
    };
  const base = STAGING_CONFIG.stage.restart.delay[kind];
  const delay = Math.min(
    PACE.restart.slowest[kind],
    Math.max(base * PACE.restart.quick, base + spare),
  );
  const rest = spare - (delay - base);
  return {
    delay,
    hold: Math.min(PACE.hold.max, Math.max(PACE.hold.min, PACE.hold.base + rest)),
    hurry,
  };
}
