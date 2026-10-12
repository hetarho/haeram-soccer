import type {
  Manager,
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  Player,
  PlayerMotion,
  PlayerMotionState,
  Tactic,
} from '../../contracts/src/types';
import { clamp, random } from './primitives';

type Point = [number, number];
type Side = 0 | 1;
type FieldState = Exclude<PlayerMotionState, 'keeper'>;

// Named tuning surface for the observation engine. All distances use a 100 × 100 pitch.
export const MATCH_MOTION_CONFIG = {
  integration: {
    /** Integration step; the ball track records every step, so it also sets the track's density. */
    stepSeconds: 0.1,
    secondsPerMinute: 8,
    samplesPerMinute: 8,
    minPosition: 2,
    maxPosition: 98,
    maxSpeed: 5.8,
    acceleration: 4.2,
    arrival: 1.4,
    separationRadius: 4.2,
    separationForce: 3.5,
    /**
     * The ball is many times faster than any player. Flight speeds are averages along the curve
     * (pitch units per motion second); no step may exceed `maxBallSpeed`.
     */
    maxBallSpeed: 100,
    passSpeed: 48,
    turnoverSpeed: 44,
    restartSpeed: 60,
    throwSpeed: 36,
    shotSpeed: 84,
    boundaryMargin: 2,
  },
  ball: {
    /** Even a poke takes a couple of steps, so the renderer always has a path to draw. */
    minimumFlight: 0.2,
    /** Share of `maxBallSpeed` a launch may reach, leaving room to follow a moving receiver. */
    launchHeadroom: 0.9,
    /** Flights longer than this leave the ground; the peak grows with the extra distance. */
    loftFrom: 18,
    loftPerUnit: 0.17,
    maxLoft: 9,
    /** Share of long balls driven low instead of lofted, and the height they keep. */
    drivenShare: 0.3,
    drivenLoft: 0.3,
    /** A miscontrolled pass bobbles to the teammate who recovers it. */
    looseSpeed: 36,
    /**
     * A tackle pokes the ball from the carrier's feet to the tackler once he is within reach. The
     * carrier runs into the challenge; the wait scales with the gap at this closing speed, inside
     * the window (motion seconds). A tackler still out of reach collects a heavy touch instead.
     */
    tackleSpeed: 22,
    tackleReach: 3,
    tackleClosing: 7,
    tackleWindow: [0.6, 1.8],
    /** Where an interceptor may step into the passing lane, as a share of the intended pass. */
    cutRange: [0.3, 0.85],
    /** An intercepted pass first heads this share toward the lane before bending to the cutter. */
    cutControl: 0.6,
    /** Cutters this far from the lane (pitch units) get a pass drifting toward them instead. */
    cutStray: [6, 18],
    /** A receiver holds the ball this long before playing the next recorded duel. */
    minimumTouch: 0.3,
    /**
     * Flight shapes. `ease` is the launch-speed boost (the ball slows by the same share toward the
     * end), `bend` the lateral Bézier offset range as a share of the chord, `loft` scales the
     * height rule and `bobble` adds a fixed hop.
     */
    styles: {
      pass: { ease: 0.3, bend: [0.04, 0.16], loft: 1, bobble: 0 },
      loose: { ease: 0.4, bend: [0.18, 0.32], loft: 1, bobble: 1.4 },
      cut: { ease: 0.25, bend: [0, 0], loft: 0.5, bobble: 0 },
      tackle: { ease: 0.5, bend: [0.1, 0.3], loft: 0, bobble: 0.4 },
      shot: { ease: 0.12, bend: [0.02, 0.08], loft: 0.35, bobble: 0 },
      reset: { ease: 0.5, bend: [0, 0], loft: 0, bobble: 0 },
      throw: { ease: 0.1, bend: [0, 0.04], loft: 0, bobble: 2.2 },
      cross: { ease: 0.2, bend: [0.06, 0.18], loft: 1.4, bobble: 1.5 },
    },
  },
  decisions: {
    minimumDwell: 0.8,
    dwellVariation: 1.5,
    rate: 1.1,
    anticipationRate: 1.2,
    hysteresis: 1.55,
    recoveryDistance: 17,
    carrierDistance: 9,
    pressingDistance: 24,
    formationWeight: 1.4,
    supportWeight: 1.7,
    runWeight: 1.6,
    pressWeight: 2.4,
    markWeight: 1.8,
    recoverWeight: 2.6,
    carryWeight: 5,
  },
  traits: {
    innateWeight: 0.25,
    disciplineDefense: 0.42,
    disciplinePassing: 0.18,
    creativityAttack: 0.28,
    creativityPassing: 0.3,
    aggressionDefense: 0.28,
    aggressionAttack: 0.2,
    anticipationSkills: 0.5,
    paceStamina: 0.45,
    paceAttack: 0.15,
    fatiguePenalty: 0.55,
  },
  manager: {
    appliedTacticWeight: 0.55,
    flexibilityWeight: 0.35,
    abilityCohesion: 0.22,
    flexibilityFreedom: 0.22,
    abilityAnticipation: 0.25,
    abilityRecovery: 0.25,
  },
  steering: {
    ballHorizontalPull: 0.13,
    ballLateralPull: 0.08,
    possessionAdvance: 5,
    defenseRetreat: 4,
    roamDistance: 13,
    supportDistance: 11,
    runDistance: 18,
    markingDistance: 3.5,
    formationPull: 0.22,
    fatigueFromMinute: 0.24,
    laneVariation: 4,
    /** The defender who will win the ball sprints to close in (still capped by `maxSpeed`). */
    chaseSprint: 1.3,
  },
  possession: {
    controlDistance: 2.2,
    passInterval: 1.4,
    passIntervalVariation: 1.5,
    passRange: 10,
    passingRange: 24,
    pressureRadius: 14,
    shotProgress: 0.56,
    interceptionProgress: 0.48,
    receiverAnticipation: 0.8,
    spaceWeight: 1.8,
    progressWeight: 1.2,
    carryDistance: 10,
    /**
     * The latest duels of a minute that the pitch plays out; earlier ones are off-screen. A minute
     * that opens with a restart spends its first seconds on it and shows fewer.
     */
    visibleEvents: 5,
    afterRestart: 3,
    dribbleDistance: 14,
    /** Event times inside the minute's motion window, in motion seconds. */
    firstEvent: 0.6,
    lastEvent: 6.6,
    /** A dead ball (kickoff, goal kick, corner) waits this long before the restart pass. */
    restartDelay: 1.2,
    throwDelay: 0.5,
    /**
     * A throw-in or corner waits for its taker to reach the ball (within `takerReach`), at most
     * this long after the ball is set.
     */
    takerWait: 0.9,
    takerReach: 2.5,
  },
  tactics: {
    balanced: {
      formation: '4-3-3',
      cohesion: 0.65,
      freedom: 0.5,
      pressing: 0.5,
      risk: 0.5,
      line: 0,
    },
    possession: {
      formation: '4-3-3',
      cohesion: 0.76,
      freedom: 0.56,
      pressing: 0.46,
      risk: 0.48,
      line: 4,
    },
    counter: {
      formation: '4-1-4-1',
      cohesion: 0.84,
      freedom: 0.36,
      pressing: 0.23,
      risk: 0.77,
      line: -8,
    },
    press: {
      formation: '4-2-3-1',
      cohesion: 0.61,
      freedom: 0.66,
      pressing: 0.95,
      risk: 0.72,
      line: 7,
    },
  },
  formations: {
    balanced: [
      [5, 50],
      [24, 15],
      [22, 38],
      [22, 62],
      [24, 85],
      [44, 26],
      [42, 50],
      [44, 74],
      [66, 18],
      [72, 50],
      [66, 82],
    ],
    possession: [
      [5, 50],
      [28, 12],
      [24, 38],
      [24, 62],
      [28, 88],
      [46, 29],
      [42, 50],
      [46, 71],
      [69, 16],
      [73, 50],
      [69, 84],
    ],
    counter: [
      [5, 50],
      [22, 17],
      [20, 39],
      [20, 61],
      [22, 83],
      [34, 50],
      [46, 31],
      [46, 69],
      [49, 14],
      [66, 50],
      [49, 86],
    ],
    press: [
      [5, 50],
      [30, 16],
      [27, 38],
      [27, 62],
      [30, 84],
      [47, 35],
      [47, 65],
      [60, 50],
      [64, 16],
      [75, 50],
      [64, 84],
    ],
  },
} as const;

const unit = (n: number) => clamp(n, 0, 1);
const length = (p: Point) => Math.hypot(p[0], p[1]);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bounded = (
  p: Point,
  margin: number = MATCH_MOTION_CONFIG.integration.boundaryMargin,
): Point => [
  clamp(
    p[0],
    MATCH_MOTION_CONFIG.integration.minPosition + margin,
    MATCH_MOTION_CONFIG.integration.maxPosition - margin,
  ),
  clamp(
    p[1],
    MATCH_MOTION_CONFIG.integration.minPosition + margin,
    MATCH_MOTION_CONFIG.integration.maxPosition - margin,
  ),
];

/** Stable implicit personality; a new fixture never rerolls a player's tendencies. */
export function playerTraits(player: Player) {
  const r = random(`personality:${player.id}`);
  const innate = {
    freedom: r(),
    discipline: r(),
    aggression: r(),
    anticipation: r(),
    creativity: r(),
    pace: r(),
  };
  const c = MATCH_MOTION_CONFIG.traits;
  const attack = unit(player.attack / 100),
    passing = unit(player.passing / 100),
    defense = unit(player.defense / 100);
  const endurance = unit(player.stamina / 100);
  return {
    freedom: unit(0.15 + attack * 0.28 + passing * 0.16 + innate.freedom * c.innateWeight),
    discipline: unit(
      0.18 +
        defense * c.disciplineDefense +
        passing * c.disciplinePassing +
        innate.discipline * c.innateWeight,
    ),
    aggression: unit(
      0.15 +
        defense * c.aggressionDefense +
        attack * c.aggressionAttack +
        endurance * 0.1 +
        innate.aggression * c.innateWeight,
    ),
    anticipation: unit(
      0.16 +
        ((passing + defense) / 2) * c.anticipationSkills +
        innate.anticipation * c.innateWeight,
    ),
    creativity: unit(
      0.15 +
        attack * c.creativityAttack +
        passing * c.creativityPassing +
        innate.creativity * c.innateWeight,
    ),
    pace: unit(
      0.18 + endurance * c.paceStamina + attack * c.paceAttack + innate.pace * c.innateWeight,
    ),
    endurance,
  };
}

export function teamMotionProfile(
  tactic: Tactic,
  manager: Pick<Manager, 'philosophy' | 'ability' | 'flexibility'>,
) {
  const c = MATCH_MOTION_CONFIG.manager;
  const applied = c.appliedTacticWeight + unit(manager.flexibility / 100) * c.flexibilityWeight;
  const tacticProfile = MATCH_MOTION_CONFIG.tactics[tactic],
    philosophy = MATCH_MOTION_CONFIG.tactics[manager.philosophy];
  const mix = (key: 'cohesion' | 'freedom' | 'pressing' | 'risk' | 'line') =>
    tacticProfile[key] * applied + philosophy[key] * (1 - applied);
  return {
    formation: tacticProfile.formation,
    cohesion: unit(mix('cohesion') + (unit(manager.ability / 100) - 0.5) * c.abilityCohesion),
    freedom: unit(mix('freedom') + (unit(manager.flexibility / 100) - 0.5) * c.flexibilityFreedom),
    pressing: unit(mix('pressing')),
    risk: unit(mix('risk')),
    line: mix('line'),
    ability: unit(manager.ability / 100),
  };
}

const TRANSITIONS: Record<FieldState, readonly FieldState[]> = {
  shape: ['shape', 'support', 'run', 'press', 'mark', 'recover', 'carry'],
  support: ['support', 'shape', 'run', 'press', 'mark', 'recover', 'carry'],
  run: ['run', 'support', 'shape', 'press', 'recover', 'carry'],
  press: ['press', 'mark', 'recover', 'shape', 'carry'],
  mark: ['mark', 'press', 'recover', 'shape', 'support'],
  recover: ['recover', 'shape', 'support', 'press', 'mark', 'carry'],
  carry: ['carry', 'support', 'run', 'shape', 'recover', 'press'],
};

interface Agent {
  player: Player;
  side: Side;
  slot: number;
  position: Point;
  velocity: Point;
  intent: Point;
  state: PlayerMotionState;
  dwell: number;
  traits: ReturnType<typeof playerTraits>;
  r: () => number;
  phase: number;
  roam: Point;
}

type DeadBall = 'kickoff' | 'goalKick' | 'throwIn' | 'corner';
type FlightStyle = keyof typeof MATCH_MOTION_CONFIG.ball.styles;

/**
 * One kick: a quadratic Bézier from the launch point to the landing point with a height arc on
 * top. A flight with a receiver re-aims its landing point at him every step, so it always ends
 * at his feet; a flight without one (a shot into the net or wide, a dead ball carried to its
 * spot) leaves the ball dead where it lands.
 */
interface BallFlight {
  id: number;
  phase: 'transition' | 'pass' | 'shot' | 'restart';
  style: FlightStyle;
  receiver?: Agent;
  /** The dead ball a receiver-less flight leaves behind. */
  ends?: DeadBall;
  from: Point;
  to: Point;
  /** Where the receiver runs to meet the ball while it travels. */
  aim: Point;
  /** A fixed control point (an intercepted pass leaves toward its lane); otherwise `bend`. */
  control?: Point;
  /** Signed lateral offset of the control point from the chord midpoint, as a chord share. */
  bend: number;
  /** Peak height in pitch units; 0 keeps the ball on the ground. */
  loft: number;
  ease: number;
  duration: number;
  elapsed: number;
}

const SHOT_ACTIONS = ['골', '슛', '선방'];

function controlPoint(flight: Pick<BallFlight, 'from' | 'to' | 'control' | 'bend'>): Point {
  if (flight.control) return [...flight.control];
  const { from, to, bend } = flight;
  return [
    (from[0] + to[0]) / 2 - bend * (to[1] - from[1]),
    (from[1] + to[1]) / 2 + bend * (to[0] - from[0]),
  ];
}

/** The ground point at path parameter `s` (0 launch, 1 landing). */
function curve(flight: Pick<BallFlight, 'from' | 'to' | 'control' | 'bend'>, s: number): Point {
  const control = controlPoint(flight);
  const u = 1 - s;
  return [
    u * u * flight.from[0] + 2 * u * s * control[0] + s * s * flight.to[0],
    u * u * flight.from[1] + 2 * u * s * control[1] + s * s * flight.to[1],
  ];
}

interface PlannedEvent {
  at: number;
  event?: MatchEvent;
  /** The ball goes out of play for the restart that opens the minute. */
  out?: MatchEvent;
  /** Bring the ball to the minute's opening actor, or set a dead ball for its restart. */
  open?: Agent;
  /** A restart played to the opening actor once the dead ball is set. */
  restart?: Agent;
}

/** The ball at one integration step, for tests and tuning tools. Frames never carry it. */
export interface BallTraceStep {
  seconds: number;
  /** Ground position and height. */
  ball: [number, number, number];
  phase: NonNullable<MatchMotionSample['phase']>;
  ownerId?: string;
  /** Position of the owner, or of the receiver the ball is flying to. */
  holder?: [number, number];
  /** A dead ball (after a goal or a shot wide, before the restart) may rest. */
  dead: boolean;
  flight?: {
    id: number;
    style: FlightStyle;
    receiverId?: string;
    from: [number, number];
    to: [number, number];
    control: [number, number];
    duration: number;
    elapsed: number;
  };
}

/**
 * The duels a minute plays out on the pitch: its latest ones, after the restart that opens it, so
 * a change of sides is always shown.
 */
export function visibleEvents(events: readonly MatchEvent[]) {
  const { visibleEvents: limit, afterRestart } = MATCH_MOTION_CONFIG.possession;
  return events[0]?.kind === 'restart'
    ? [events[0], ...events.slice(1).slice(-afterRestart)]
    : events.slice(-limit);
}

/** Observation-only dynamics. It has no access to the football outcome RNG. */
export class MatchMotion {
  private agents: [Agent[], Agent[]];
  private profiles: [ReturnType<typeof teamMotionProfile>, ReturnType<typeof teamMotionProfile>];
  private ball: Point = [50, 50];
  private height = 0;
  private seconds = 0;
  private owner?: Agent;
  private heldSince = 0;
  private flight?: BallFlight;
  private flights = 0;
  /** The match opens with a dead ball on the centre spot. */
  private dead?: DeadBall = 'kickoff';
  /** Where the dead ball is restarted from, when not its usual spot (throw-ins, corners). */
  private spot?: Point;
  /** The player who walks to a throw-in or corner before it is taken. */
  private taker?: { agent: Agent; spot: Point; until: number };
  /** A tackler closing in on the carrier; the ball leaves the carrier's feet when he arrives. */
  private challenge?: { tackler: Agent; until: number };
  /**
   * The defender who wins the ball this minute closes in on the player who will lose it: goal
   * side of a dribbler or passer, or in the lane of the pass (or shot) he will cut out.
   */
  private shadow?: { marker: Agent; actor: Agent; lane?: Agent; goal?: Point };
  private phase: NonNullable<MatchMotionSample['phase']> = 'restart';
  private passCooldown = 0;
  private ballRandom: () => number;
  private shotTriggered = false;
  private interceptionTriggered = false;
  private dribbleTarget: Point = [50, 50];
  private plan: PlannedEvent[] = [];

  constructor(
    seed: string,
    squads: [Player[], Player[]],
    private tactics: [Tactic, Tactic],
    managers: [
      Pick<Manager, 'philosophy' | 'ability' | 'flexibility'>,
      Pick<Manager, 'philosophy' | 'ability' | 'flexibility'>,
    ],
  ) {
    this.ballRandom = random(`${seed}:ball-decisions`);
    this.profiles = managers.map((manager, side) =>
      teamMotionProfile(tactics[side], manager),
    ) as typeof this.profiles;
    this.agents = squads.map((players, side) =>
      players.map((player, slot): Agent => {
        const r = random(`${seed}:movement:${player.id}`);
        const formation = MATCH_MOTION_CONFIG.formations[tactics[side]][slot] ?? [50, 50];
        const position = bounded([side === 0 ? formation[0] : 100 - formation[0], formation[1]]);
        return {
          player,
          side: side as Side,
          slot,
          position,
          velocity: [0, 0],
          intent: [...position],
          state: slot === 0 ? 'keeper' : 'shape',
          dwell: r() * 2.5,
          traits: playerTraits(player),
          r,
          phase: r() * Math.PI * 2,
          roam: [r() * 2 - 1, r() * 2 - 1],
        };
      }),
    ) as [Agent[], Agent[]];
  }

  /**
   * Play one simulated minute. `trace` sees the ball after every integration step; it exists for
   * tests and tuning and never changes the motion.
   */
  minute(
    frame: MatchFrame,
    trace?: (step: BallTraceStep) => void,
  ): Pick<MatchFrame, 'players' | 'motion' | 'elapsedSeconds' | 'ball' | 'ballTrack'> {
    const c = MATCH_MOTION_CONFIG.integration;
    const steps = Math.round(c.secondsPerMinute / c.stepSeconds);
    const sampleEvery = steps / c.samplesPerMinute;
    const samples: MatchMotionSample[] = [];
    const ballTrack: [number, number, number][] = [];
    const tenth = (n: number) => Math.round(n * 10) / 10;
    // Recorded duels drive the minute; synthetic frames without them fall back to the action.
    const scripted = !!frame.events?.length;
    if (scripted) this.schedule(frame.events!);
    else this.preparePossession(frame);
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      // Players move first, so the ball meets each receiver where he actually is this step.
      this.step(frame, c.stepSeconds);
      this.seconds += c.stepSeconds;
      if (scripted) this.followPlan(progress * c.secondsPerMinute);
      else this.advancePossession(frame, progress, c.stepSeconds);
      this.moveBallState(c.stepSeconds);
      ballTrack.push([tenth(this.ball[0]), tenth(this.ball[1]), tenth(this.height)]);
      trace?.(this.trace());
      if (step % sampleEvery === 0)
        samples.push({
          elapsedSeconds: (frame.minute - 1 + progress) * 60,
          ball: [...this.ball],
          players: this.snapshot(),
          phase: this.phase,
          ownerId: this.owner?.player.id,
        });
    }
    return {
      elapsedSeconds: frame.minute * 60,
      ball: [...this.ball],
      players: this.snapshot(),
      motion: samples,
      ballTrack,
    };
  }

  private agentAt(side: Side, slot: number) {
    const team = this.agents[side];
    return team[Math.min(slot, team.length - 1)];
  }

  /**
   * Spread the minute's latest duels across its motion window. The ball first travels to the
   * opening actor (a kickoff after a goal, a turnover or a pass), and the defender who wins the
   * ball (or blocks the shot) shadows its future loser from the start of the minute. Duels never
   * cut a flight short: each waits until the ball has landed at its actor, so anything the last
   * minute could not finish plays first.
   */
  private schedule(events: MatchEvent[]) {
    const c = MATCH_MOTION_CONFIG.possession;
    const visible = visibleEvents(events);
    const first = visible[0];
    const opener = this.agentAt(first.side, first.actor);
    const carried = this.plan.map((item) => ({ ...item, at: 0 }));
    // A minute the other side ended with the ball opens with it going out of play.
    const restart = first.kind === 'restart' ? first : undefined;
    const duels = restart ? visible.slice(1) : visible;
    // A goal sends the ball back to the centre spot and a shot wide becomes a goal kick. The ball
    // stays dead for a moment before the restart is played.
    const restarting = !!(restart ?? this.dead ?? this.flight?.ends);
    const start = restarting ? c.restartDelay + 0.4 : c.firstEvent;
    const span = c.lastEvent - start;
    const timed: PlannedEvent[] = duels.map((event, index) => ({
      at:
        duels.length === 1
          ? (start + c.lastEvent) / 2
          : start + (index * span) / (duels.length - 1),
      event,
    }));
    this.shadow = undefined;
    for (const { at, event } of timed) {
      if (!event || event.opponent === undefined) continue;
      const block = event.kind === 'shot' && event.outcome === 'block';
      if (!event.lost && !block) continue;
      const marker = this.agentAt(event.side === 0 ? 1 : 0, event.opponent);
      if (marker.slot === 0) continue;
      const lane =
        event.receiver === undefined ? undefined : this.agentAt(event.side, event.receiver);
      this.shadow = {
        marker,
        actor: this.agentAt(event.side, event.actor),
        lane,
        goal: block ? [event.side === 0 ? 98 : 2, 50] : undefined,
      };
      marker.state = lane || block ? 'mark' : 'press';
      marker.dwell = Math.max(marker.dwell, at + 0.4);
    }
    this.shotTriggered = false;
    this.plan = [
      ...carried,
      ...(restart ? [{ at: 0, out: restart }] : []),
      { at: 0, open: opener },
      ...timed,
    ];
  }

  /** Play every due item of the plan, one flight at a time. */
  private followPlan(time: number) {
    this.resolveChallenge();
    while (this.plan.length && this.plan[0].at <= time + 1e-9) {
      if (this.flight || this.challenge) return;
      const next = this.plan[0];
      if (
        next.event &&
        this.owner &&
        this.seconds - this.heldSince < MATCH_MOTION_CONFIG.ball.minimumTouch - 1e-9
      )
        return;
      // A throw-in or corner is taken once its taker stands at the ball.
      const taker = this.taker;
      if (
        next.restart &&
        taker &&
        distance(taker.agent.position, taker.spot) > MATCH_MOTION_CONFIG.possession.takerReach &&
        this.seconds < taker.until - 1e-9
      )
        return;
      this.plan.shift();
      if (next.event) this.play(next.event);
      else if (next.out) this.out(next.out);
      else if (next.open) this.open(next.open, time);
      else if (next.restart) this.restart(next.restart);
    }
  }

  /** Take the dead ball to the minute's opener: thrown in, crossed from the corner or kicked. */
  private restart(receiver: Agent) {
    const integration = MATCH_MOTION_CONFIG.integration;
    const dead = this.dead;
    this.taker = undefined;
    if (this.owner === receiver) return;
    if (dead === 'throwIn') this.passTo(receiver, 'restart', integration.throwSpeed, 'throw');
    else if (dead === 'corner') this.passTo(receiver, 'restart', integration.passSpeed, 'cross');
    else this.passTo(receiver, 'restart', integration.passSpeed);
  }

  /**
   * The ball goes out of play off the side that held it (MATCH-12): over the touchline, past the
   * byline of the side restarting (a goal kick) or behind its own (a corner). A ball already dead
   * after a shot wide only changes what restarts it.
   */
  private out(event: MatchEvent) {
    const kind = event.restart ?? 'throwIn';
    // Nothing goes out after a goal, or when the restarting side already has the ball.
    if (this.dead === 'kickoff' || this.owner?.side === event.side) return;
    const { minPosition: low, maxPosition: high } = MATCH_MOTION_CONFIG.integration;
    const [x, y] = this.ball;
    const top = y < 50,
      touchline = top ? low : high;
    // The restarting side defends the low end when it is the home side.
    const own = event.side === 0 ? low : high,
      their = event.side === 0 ? high : low;
    const wide = (limit: number) => (top ? Math.min(y, 50 - limit) : Math.max(y, 50 + limit));
    let to: Point, spot: Point;
    if (kind === 'throwIn') {
      // The side that loses it was playing toward the restarting side's goal.
      to = [clamp(x + (event.side === 0 ? -6 : 6), 8, 92), touchline];
      spot = to;
    } else if (kind === 'goalKick') {
      to = [own, clamp(wide(12), 15, 85)];
      spot = [own === low ? 6 : 94, 50];
    } else {
      to = [their, clamp(wide(12), 10, 90)];
      spot = [their, touchline];
    }
    if (this.dead) {
      this.dead = kind;
      this.spot = spot;
    } else
      this.launch({
        phase: 'transition',
        style: 'pass',
        speed: MATCH_MOTION_CONFIG.integration.passSpeed,
        to,
        ends: kind,
        spot,
      });
    // The taker sets off as soon as the ball is on its way out.
    this.call(kind, this.agentAt(event.side, event.actor), spot);
  }

  /**
   * Send the restart's taker to the ball: the keeper to his goal kick, the nearest teammate of the
   * opener to a throw-in or corner. Nobody walks to a kickoff.
   */
  private call(dead: DeadBall, opener: Agent, spot: Point) {
    const c = MATCH_MOTION_CONFIG.possession;
    const team = this.agents[opener.side].filter((agent) => agent !== opener);
    const taker =
      dead === 'goalKick'
        ? team.find((agent) => agent.slot === 0)
        : dead === 'kickoff'
          ? undefined
          : team
              .filter((agent) => agent.slot !== 0)
              .reduce((best, agent) =>
                distance(agent.position, spot) < distance(best.position, spot) ? agent : best,
              );
    if (!taker) return;
    const wait = (this.flight?.duration ?? 0) + c.takerWait;
    this.taker = { agent: taker, spot, until: this.seconds + wait };
    taker.dwell = Math.max(taker.dwell, wait + MATCH_MOTION_CONFIG.decisions.minimumDwell);
  }

  /** Bring the ball to the minute's opener, or carry a dead ball to its spot for the restart. */
  private open(opener: Agent, time: number) {
    const integration = MATCH_MOTION_CONFIG.integration;
    const c = MATCH_MOTION_CONFIG.possession;
    if (this.dead) {
      const dead = this.dead;
      const spot: Point =
        this.spot ?? (dead === 'kickoff' ? [50, 50] : [this.ball[0] > 50 ? 94 : 6, 50]);
      this.phase = 'restart';
      if (distance(this.ball, spot) > 0.5)
        this.launch({
          phase: 'restart',
          style: 'reset',
          speed: integration.restartSpeed,
          to: spot,
          ends: dead,
          spot: this.spot,
        });
      if (!this.taker) this.call(dead, opener, spot);
      // A throw-in is taken quickly; other dead balls rest a moment first.
      this.plan.unshift({
        at: time + (dead === 'throwIn' ? c.throwDelay : c.restartDelay),
        restart: opener,
      });
      return;
    }
    if (this.owner === opener) return;
    if (this.owner?.side !== opener.side)
      this.passTo(opener, 'transition', integration.turnoverSpeed);
    else this.passTo(opener, 'pass', integration.passSpeed);
  }

  private play(event: MatchEvent) {
    if (event.kind === 'restart') return;
    const speed = MATCH_MOTION_CONFIG.integration;
    const other: Side = event.side === 0 ? 1 : 0;
    const actor = this.agentAt(event.side, event.actor);
    const opponent = event.opponent === undefined ? undefined : this.agentAt(other, event.opponent);
    const direction = event.side === 0 ? 1 : -1;
    if (event.kind === 'shot') {
      const goalLine = event.side === 0 ? 98 : 2;
      const r = this.ballRandom();
      const mouth: Point = [goalLine, 44 + r * 12];
      if (event.outcome === 'goal' || event.outcome === 'miss')
        this.launch({
          phase: 'shot',
          style: 'shot',
          speed: speed.shotSpeed,
          to: event.outcome === 'goal' ? mouth : [goalLine, r < 0.5 ? 30 + r * 8 : 62 + r * 8],
          ends: event.outcome === 'goal' ? 'kickoff' : 'goalKick',
        });
      // A save or a block meets the shot on its way to goal.
      else this.cut(opponent ?? this.agentAt(other, 0), mouth, 'shot', speed.shotSpeed, 'shot');
      this.shotTriggered = true;
      return;
    }
    if (event.kind === 'dribble') {
      if (event.ok) {
        if (this.owner !== actor) this.passTo(actor, 'pass', speed.passSpeed);
        else {
          const c = MATCH_MOTION_CONFIG.possession;
          this.dribbleTarget = bounded([
            actor.position[0] + direction * c.dribbleDistance,
            actor.position[1] + actor.roam[1] * 6,
          ]);
        }
      } else if (opponent) this.tackle(opponent);
      return;
    }
    const receiver =
      event.receiver === undefined ? undefined : this.agentAt(event.side, event.receiver);
    if (event.ok && receiver) this.passTo(receiver, 'pass', speed.passSpeed);
    else if (event.lost && opponent) {
      // An interception cuts the pass on its way; a tackle takes the ball off the passer.
      if (receiver)
        this.cut(
          opponent,
          this.anticipate(receiver, speed.passSpeed),
          'transition',
          speed.passSpeed,
          'cut',
        );
      else this.tackle(opponent);
    } else if (receiver)
      // A loose ball bobbles awkwardly to the teammate who recovers it.
      this.passTo(receiver, 'pass', MATCH_MOTION_CONFIG.ball.looseSpeed, 'loose');
  }

  private preparePossession(frame: MatchFrame) {
    this.shotTriggered = false;
    this.interceptionTriggered = false;
    const currentSide = this.owner?.side ?? this.flight?.receiver?.side;
    const candidates = this.agents[frame.side].filter((agent) => agent.slot !== 0);
    const nearest = candidates.reduce(
      (best, agent) =>
        distance(agent.position, this.ball) < distance(best.position, this.ball) ? agent : best,
      candidates[0],
    );
    const opener = SHOT_ACTIONS.includes(frame.action)
      ? this.agentAt(frame.side, frame.player)
      : (this.dead ?? this.flight?.ends)
        ? this.agentAt(frame.side, 6)
        : currentSide !== frame.side
          ? nearest
          : undefined;
    this.plan = opener ? [{ at: 0, open: opener }] : [];
  }

  /** The anticipated spot where a receiver meets a ball played at `speed`. */
  private anticipate(receiver: Agent, speed: number): Point {
    const travelTime = distance(this.ball, receiver.position) / speed;
    const anticipation =
      receiver.traits.anticipation * MATCH_MOTION_CONFIG.possession.receiverAnticipation;
    return bounded([
      receiver.position[0] + receiver.velocity[0] * travelTime * anticipation,
      receiver.position[1] + receiver.velocity[1] * travelTime * anticipation,
    ]);
  }

  /** Where a player controls the ball: just ahead of him toward the goal he attacks. */
  private feet(agent: Agent, at: Point = agent.position): Point {
    return bounded([at[0] + (agent.side === 0 ? 1 : -1), at[1]], 0);
  }

  private passTo(
    receiver: Agent,
    phase: BallFlight['phase'],
    speed: number = MATCH_MOTION_CONFIG.integration.passSpeed,
    style: FlightStyle = 'pass',
  ) {
    const aim = this.anticipate(receiver, speed);
    this.launch({ phase, style, speed, receiver, aim, to: this.feet(receiver, aim) });
    receiver.state = receiver.slot === 0 ? 'keeper' : 'support';
    receiver.dwell = Math.max(
      receiver.dwell,
      this.flight!.duration + MATCH_MOTION_CONFIG.decisions.minimumDwell,
    );
  }

  /**
   * A defender (or the keeper) steps into the path of a ball played toward `lane`. The cut point
   * is his projection onto that line, clamped to a sensible share of it; he runs as far toward
   * it as the flight allows. The ball leaves toward the lane and bends to wherever he meets it.
   */
  private cut(
    marker: Agent,
    lane: Point,
    phase: BallFlight['phase'],
    speed: number,
    style: FlightStyle,
  ) {
    const c = MATCH_MOTION_CONFIG.ball;
    const from = this.ball;
    const line: Point = [lane[0] - from[0], lane[1] - from[1]];
    const span = line[0] ** 2 + line[1] ** 2;
    const share =
      span > 1e-6
        ? clamp(
            ((marker.position[0] - from[0]) * line[0] + (marker.position[1] - from[1]) * line[1]) /
              span,
            c.cutRange[0],
            c.cutRange[1],
          )
        : 0.5;
    const meet: Point = [from[0] + line[0] * share, from[1] + line[1] * share];
    const reach = MATCH_MOTION_CONFIG.integration.maxSpeed * (distance(from, meet) / speed + 0.2);
    const gap = distance(marker.position, meet);
    const run = gap > reach ? reach / gap : 1;
    const aim = bounded([
      marker.position[0] + (meet[0] - marker.position[0]) * run,
      marker.position[1] + (meet[1] - marker.position[1]) * run,
    ]);
    // A cutter still far from the lane gets a pass that drifts toward him, not one bent through a
    // right angle.
    const offset =
      span > 1e-6
        ? Math.abs(line[0] * (aim[1] - from[1]) - line[1] * (aim[0] - from[0])) / Math.sqrt(span)
        : 0;
    const astray = unit((offset - c.cutStray[0]) / (c.cutStray[1] - c.cutStray[0]));
    const lanePull: Point = [
      from[0] + (meet[0] - from[0]) * c.cutControl,
      from[1] + (meet[1] - from[1]) * c.cutControl,
    ];
    this.launch({
      phase,
      style,
      speed,
      receiver: marker,
      aim,
      to: this.feet(marker, aim),
      control: [
        lanePull[0] + ((from[0] + aim[0]) / 2 - lanePull[0]) * astray,
        lanePull[1] + ((from[1] + aim[1]) / 2 - lanePull[1]) * astray,
      ],
    });
    marker.state = marker.slot === 0 ? 'keeper' : 'press';
    marker.dwell = Math.max(marker.dwell, this.flight!.duration + 0.4);
  }

  /**
   * A tackler closes in on the carrier, who runs into the challenge; the ball leaves the
   * carrier's feet once the tackler reaches it.
   */
  private tackle(tackler: Agent) {
    const c = MATCH_MOTION_CONFIG.ball;
    const window = clamp(
      distance(tackler.position, this.ball) / c.tackleClosing,
      c.tackleWindow[0],
      c.tackleWindow[1],
    );
    this.challenge = { tackler, until: this.seconds + window };
    if (tackler.slot !== 0) tackler.state = 'press';
    tackler.dwell = Math.max(tackler.dwell, window + 0.4);
    this.resolveChallenge();
  }

  private resolveChallenge() {
    const challenge = this.challenge;
    if (!challenge) return;
    const c = MATCH_MOTION_CONFIG.ball;
    const { tackler } = challenge;
    const reached = distance(tackler.position, this.ball) <= c.tackleReach;
    const carrier = this.owner;
    if (carrier && !reached && this.seconds < challenge.until - 1e-9) {
      this.dribbleTarget = bounded([
        (carrier.position[0] + tackler.position[0]) / 2,
        (carrier.position[1] + tackler.position[1]) / 2,
      ]);
      return;
    }
    this.challenge = undefined;
    // Out of time, the carrier's heavy touch runs loose to the tackler instead.
    if (reached) this.passTo(tackler, 'transition', c.tackleSpeed, 'tackle');
    else this.passTo(tackler, 'transition', c.looseSpeed, 'loose');
  }

  /** Kick the ball from where it is now. Curve sign, bend and loft come from the ball stream. */
  private launch(options: {
    phase: BallFlight['phase'];
    style: FlightStyle;
    speed: number;
    to: Point;
    receiver?: Agent;
    aim?: Point;
    control?: Point;
    ends?: DeadBall;
    /** Where a dead ball is restarted from, when not its usual spot. */
    spot?: Point;
  }) {
    const c = MATCH_MOTION_CONFIG.ball;
    const integration = MATCH_MOTION_CONFIG.integration;
    const style = c.styles[options.style];
    const from: Point = [...this.ball];
    const to = bounded(options.to, 0);
    const sign = this.ballRandom() < 0.5 ? -1 : 1;
    const bend = sign * (style.bend[0] + (style.bend[1] - style.bend[0]) * this.ballRandom());
    const flight: BallFlight = {
      id: ++this.flights,
      phase: options.phase,
      style: options.style,
      receiver: options.receiver,
      ends: options.ends,
      from,
      to,
      aim: options.aim ?? to,
      control: options.control,
      bend: options.control ? 0 : bend,
      loft: 0,
      ease: style.ease,
      duration: 0,
      elapsed: 0,
    };
    // Curl toward the middle rather than out over a touchline.
    const apex = curve(flight, 0.5);
    if (apex.some((n) => n < integration.minPosition + 1 || n > integration.maxPosition - 1))
      flight.bend = -flight.bend;
    const chord = distance(from, to);
    const lift = this.ballRandom();
    flight.loft =
      Math.min(
        c.maxLoft,
        Math.max(0, chord - c.loftFrom) *
          c.loftPerUnit *
          style.loft *
          (lift < c.drivenShare ? c.drivenLoft : 0.7 + 0.6 * lift),
      ) + style.bobble;
    const control = controlPoint(flight);
    const legs = [distance(from, control), distance(control, to)];
    // Average speed along the curve, and a launch that never breaks the ball's speed limit.
    flight.duration = Math.max(
      c.minimumFlight,
      (chord + legs[0] + legs[1]) / 2 / options.speed,
      ((1 + style.ease) * 2 * Math.max(...legs)) / (integration.maxBallSpeed * c.launchHeadroom),
    );
    this.flight = flight;
    this.owner = undefined;
    this.phase = options.phase;
    if (options.ends) this.spot = options.spot;
    if (options.receiver) {
      this.dead = undefined;
      this.spot = undefined;
    }
  }

  /** Advance the flight one step; it ends at the receiver's feet or as a dead ball. */
  private advanceFlight(flight: BallFlight, dt: number) {
    flight.elapsed += dt;
    const tau = Math.min(1, flight.elapsed / flight.duration);
    const receiver = flight.receiver;
    if (receiver) {
      // Re-aim at where the receiver will be when the ball arrives; on arrival, at his feet.
      const remaining = Math.max(0, flight.duration - flight.elapsed);
      const feet = this.feet(receiver);
      flight.to = bounded(
        [feet[0] + receiver.velocity[0] * remaining, feet[1] + receiver.velocity[1] * remaining],
        0,
      );
    }
    const s = (1 + flight.ease) * tau - flight.ease * tau * tau;
    this.moveBall(tau < 1 ? curve(flight, s) : flight.to, dt);
    this.height = tau < 1 ? 4 * flight.loft * tau * (1 - tau) : 0;
    if (tau < 1) return;
    if (receiver) {
      if (
        distance(this.ball, this.feet(receiver)) <= MATCH_MOTION_CONFIG.possession.controlDistance
      )
        this.catchBall(receiver);
    } else if (distance(this.ball, flight.to) < 0.05) {
      this.flight = undefined;
      this.dead = flight.ends;
    }
  }

  private moveBallState(dt: number) {
    if (this.flight) return this.advanceFlight(this.flight, dt);
    this.height = 0;
    // A carried ball stays at its owner's feet; a dead ball rests.
    if (this.owner) this.moveBall(this.feet(this.owner), dt);
  }

  private catchBall(receiver: Agent) {
    this.owner = receiver;
    this.heldSince = this.seconds;
    if (this.shadow?.marker === receiver) this.shadow = undefined;
    this.flight = undefined;
    this.dead = undefined;
    this.height = 0;
    this.phase = 'possession';
    receiver.state = receiver.slot === 0 ? 'keeper' : 'carry';
    receiver.dwell = MATCH_MOTION_CONFIG.decisions.minimumDwell;
    const c = MATCH_MOTION_CONFIG.possession;
    this.passCooldown = c.passInterval + this.ballRandom() * c.passIntervalVariation;
    const direction = receiver.side === 0 ? 1 : -1;
    const profile = this.profiles[receiver.side];
    this.dribbleTarget = bounded([
      receiver.position[0] + direction * c.carryDistance * (0.5 + profile.risk),
      receiver.position[1] + receiver.roam[1] * 5 * receiver.traits.creativity,
    ]);
  }

  private chooseReceiver(owner: Agent): Agent {
    const c = MATCH_MOTION_CONFIG.possession;
    const profile = this.profiles[owner.side];
    const direction = owner.side === 0 ? 1 : -1;
    const opponents = this.agents[owner.side === 0 ? 1 : 0];
    const idealRange = c.passRange + (owner.player.passing / 100) * c.passingRange;
    const options = this.agents[owner.side]
      .filter((agent) => agent !== owner && agent.slot !== 0)
      .map((agent) => {
        const range = distance(owner.position, agent.position);
        const pressure = opponents.reduce(
          (closest, opponent) => Math.min(closest, distance(agent.position, opponent.position)),
          100,
        );
        const space = 0.3 + unit(pressure / c.pressureRadius) * c.spaceWeight;
        const forward = Math.exp(
          clamp(
            ((direction * (agent.position[0] - owner.position[0])) / 30) *
              profile.risk *
              c.progressWeight,
            -1,
            1,
          ),
        );
        const suitability =
          Math.exp(-Math.abs(range - idealRange) / idealRange) * (range < 5 ? 0.15 : 1);
        const weight =
          suitability *
          space *
          forward *
          (0.5 + agent.traits.anticipation) *
          (agent.state === 'run' || agent.state === 'support' ? 1.4 : 1);
        return { agent, weight };
      });
    let selected = this.ballRandom() * options.reduce((sum, option) => sum + option.weight, 0);
    for (const option of options) {
      selected -= option.weight;
      if (selected <= 0) return option.agent;
    }
    return options[0].agent;
  }

  /** Synthetic minutes without recorded duels: the frame's action shapes the possession. */
  private advancePossession(frame: MatchFrame, progress: number, dt: number) {
    const c = MATCH_MOTION_CONFIG.possession;
    this.followPlan(progress * MATCH_MOTION_CONFIG.integration.secondsPerMinute);
    if (this.flight || this.challenge || this.plan.length || !this.owner) return;
    const shooting = SHOT_ACTIONS.includes(frame.action);
    if (
      !this.interceptionTriggered &&
      frame.action === '인터셉트' &&
      progress >= c.interceptionProgress
    ) {
      const defending = this.agents[frame.side === 0 ? 1 : 0].filter((agent) => agent.slot !== 0);
      this.tackle(
        defending.reduce(
          (best, agent) =>
            distance(agent.position, this.ball) < distance(best.position, this.ball) ? agent : best,
          defending[0],
        ),
      );
      this.interceptionTriggered = true;
      return;
    }
    if (!this.shotTriggered && shooting && progress >= c.shotProgress) {
      const goalLine = frame.side === 0 ? 98 : 2;
      const speed = MATCH_MOTION_CONFIG.integration.shotSpeed;
      if (frame.action === '선방')
        this.cut(this.agents[frame.side === 0 ? 1 : 0][0], [goalLine, 50], 'shot', speed, 'shot');
      else
        this.launch({
          phase: 'shot',
          style: 'shot',
          speed,
          to: [goalLine, frame.action === '골' ? 50 : clamp(frame.ball[1], 32, 68)],
          ends: frame.action === '골' ? 'kickoff' : 'goalKick',
        });
      this.shotTriggered = true;
      return;
    }
    this.passCooldown -= dt;
    // Preserve the shooting actor's possession until the shot; dribblers hold it longer.
    if (shooting && !this.shotTriggered) return;
    if (frame.action === '돌파' && progress < 0.8) return;
    if (this.passCooldown <= 0) this.passTo(this.chooseReceiver(this.owner), 'pass');
  }

  /** Move the ball toward `target`, never faster than the ball's speed limit. */
  private moveBall(target: Point, dt: number) {
    const delta: Point = [target[0] - this.ball[0], target[1] - this.ball[1]];
    const scale = Math.min(
      1,
      (MATCH_MOTION_CONFIG.integration.maxBallSpeed * dt) / Math.max(length(delta), 0.001),
    );
    this.ball = bounded([this.ball[0] + delta[0] * scale, this.ball[1] + delta[1] * scale], 0);
  }

  private trace(): BallTraceStep {
    const flight = this.flight;
    const holder = this.owner ?? flight?.receiver;
    return {
      seconds: this.seconds,
      ball: [this.ball[0], this.ball[1], this.height],
      phase: this.phase,
      ownerId: this.owner?.player.id,
      holder: holder && [...holder.position],
      dead: !!this.dead,
      flight: flight && {
        id: flight.id,
        style: flight.style,
        receiverId: flight.receiver?.player.id,
        from: [...flight.from],
        to: [...flight.to],
        control: controlPoint(flight),
        duration: flight.duration,
        elapsed: flight.elapsed,
      },
    };
  }

  private anchor(agent: Agent, side: Side): Point {
    const profile = this.profiles[agent.side];
    const direction = agent.side === 0 ? 1 : -1;
    const base = MATCH_MOTION_CONFIG.formations[this.tactics[agent.side]][agent.slot] ?? [50, 50];
    const c = MATCH_MOTION_CONFIG.steering;
    const possession = side === agent.side;
    const line =
      agent.slot === 0 ? 0 : profile.line + (possession ? c.possessionAdvance : -c.defenseRetreat);
    const pull = agent.slot === 0 ? 0.025 : c.ballHorizontalPull * (0.6 + profile.cohesion * 0.4);
    return bounded([
      (agent.side === 0 ? base[0] : 100 - base[0]) + direction * line + (this.ball[0] - 50) * pull,
      base[1] + (this.ball[1] - 50) * c.ballLateralPull,
    ]);
  }

  private choose(
    agent: Agent,
    frame: MatchFrame,
    anchor: Point,
    carrier: Agent,
    nearestPressers: Set<string>,
  ) {
    if (agent.slot === 0) return;
    const c = MATCH_MOTION_CONFIG.decisions;
    const p = this.profiles[agent.side],
      t = agent.traits;
    const attacking =
      agent.side === (this.owner?.side ?? this.flight?.receiver?.side ?? frame.side);
    const ballDistance = distance(agent.position, this.ball);
    const displacement = distance(agent.position, anchor);
    const freshness = unit(
      1 -
        (agent.player.fatigue / 100) * MATCH_MOTION_CONFIG.traits.fatiguePenalty -
        (frame.minute / 90) * MATCH_MOTION_CONFIG.steering.fatigueFromMinute * (1 - t.endurance),
    );
    const freedom = t.freedom * p.freedom;
    const nearBall = unit(1 - ballDistance / c.pressingDistance);
    const weights: Record<FieldState, number> = {
      shape: c.formationWeight * (0.25 + t.discipline * p.cohesion) * (1 + displacement / 35),
      support: attacking
        ? c.supportWeight *
          (0.2 + t.anticipation * t.creativity) *
          (0.35 + freedom) *
          (agent.player.role === 'MID' ? 1.5 : 1)
        : 0,
      run: attacking
        ? c.runWeight *
          freedom *
          p.risk *
          freshness *
          (agent.player.role === 'FWD' ? 1.8 : agent.player.role === 'MID' ? 0.9 : 0.35)
        : 0,
      press:
        !attacking && nearestPressers.has(agent.player.id)
          ? c.pressWeight * p.pressing * t.aggression * (0.3 + nearBall) * freshness
          : 0,
      mark: !attacking
        ? c.markWeight *
          t.discipline *
          t.anticipation *
          (agent.player.role === 'DEF' ? 1.5 : 0.65) *
          (1 - p.pressing * 0.3)
        : 0,
      recover:
        displacement > c.recoveryDistance
          ? c.recoverWeight * (displacement / c.recoveryDistance - 1) * t.discipline * p.cohesion
          : 0,
      carry:
        attacking && carrier === agent && ballDistance < c.carrierDistance
          ? c.carryWeight * (0.5 + t.creativity)
          : 0,
    };
    // Possession changes invalidate attacking/defending states at the next local decision.
    const current = agent.state as FieldState;
    weights[current] *= c.hysteresis;
    const options = TRANSITIONS[current];
    const total = options.reduce((sum, state) => sum + weights[state], 0);
    let choice = agent.r() * total;
    let selected: FieldState = 'shape';
    for (const state of options) {
      choice -= weights[state];
      if (choice <= 0 && weights[state] > 0) {
        selected = state;
        break;
      }
    }
    agent.state = selected;
    agent.dwell = c.minimumDwell + agent.r() * c.dwellVariation * (1.25 - t.anticipation * 0.5);
    agent.roam = [agent.r() * 2 - 1, agent.r() * 2 - 1];
  }

  private step(frame: MatchFrame, dt: number) {
    const all = this.agents.flat();
    const possessionSide = this.owner?.side ?? this.flight?.receiver?.side ?? frame.side;
    const outfield = this.agents[possessionSide].filter((a) => a.slot !== 0);
    const carrier =
      this.owner ??
      outfield.reduce(
        (best, a) =>
          distance(a.position, this.ball) < distance(best.position, this.ball) ? a : best,
        outfield[0],
      );
    const defending: Side = possessionSide === 0 ? 1 : 0;
    const pressing = this.agents[defending]
      .filter((a) => a.slot !== 0)
      .sort((a, b) => distance(a.position, this.ball) - distance(b.position, this.ball));
    const nearestPressers = new Set(
      pressing
        .slice(0, Math.round(1 + this.profiles[defending].pressing * 2))
        .map((a) => a.player.id),
    );
    const anchors = all.map((a) => this.anchor(a, possessionSide));
    for (const [index, agent] of all.entries()) {
      agent.dwell = Math.max(0, agent.dwell - dt);
      if (this.owner === agent && agent.slot !== 0) {
        agent.state = 'carry';
        continue;
      }
      const rate =
        MATCH_MOTION_CONFIG.decisions.rate +
        agent.traits.anticipation * MATCH_MOTION_CONFIG.decisions.anticipationRate +
        this.profiles[agent.side].ability * MATCH_MOTION_CONFIG.manager.abilityAnticipation;
      if (agent.dwell === 0 && agent.r() < 1 - Math.exp(-rate * dt))
        this.choose(agent, frame, anchors[index], carrier, nearestPressers);
    }
    // Compute every intent before integrating anyone: no array-order advantage.
    const intents = all.map((agent, index) => this.intent(agent, frame, anchors[index], all));
    const velocities = all.map((agent, index) =>
      this.velocity(agent, intents[index], anchors[index], all, frame.minute, dt),
    );
    for (const [index, agent] of all.entries()) {
      agent.intent = intents[index];
      agent.velocity = velocities[index];
      const next: Point = [
        agent.position[0] + agent.velocity[0] * dt,
        agent.position[1] + agent.velocity[1] * dt,
      ];
      agent.position = bounded(next, 0);
      if (next[0] !== agent.position[0]) agent.velocity[0] = 0;
      if (next[1] !== agent.position[1]) agent.velocity[1] = 0;
    }
  }

  private intent(agent: Agent, frame: MatchFrame, anchor: Point, all: Agent[]): Point {
    const direction = agent.side === 0 ? 1 : -1;
    const c = MATCH_MOTION_CONFIG.steering,
      p = this.profiles[agent.side],
      t = agent.traits;
    const freedom = t.freedom * p.freedom;
    const lane = agent.roam[1] * c.laneVariation;
    const wave = Math.sin(this.seconds * (0.2 + t.creativity * 0.25) + agent.phase);
    const attack = agent.side === (this.owner?.side ?? this.flight?.receiver?.side ?? frame.side);
    if (this.flight?.receiver === agent) return this.flight.aim;
    if (this.taker?.agent === agent) return this.taker.spot;
    if (this.challenge?.tackler === agent) return [...this.ball];
    if (this.shadow?.marker === agent) {
      const { actor, lane, goal } = this.shadow;
      const toward = lane?.position ?? goal;
      return bounded(
        toward
          ? [
              actor.position[0] + (toward[0] - actor.position[0]) * (lane ? 0.55 : 0.3),
              actor.position[1] + (toward[1] - actor.position[1]) * (lane ? 0.55 : 0.3),
            ]
          : [actor.position[0] - direction * 1.5, actor.position[1]],
      );
    }
    if (this.owner === agent && agent.slot !== 0) return this.dribbleTarget;
    // Old attacking intents decay toward shape when possession changes; no teleport or global switch.
    if (!attack && ['support', 'run', 'carry'].includes(agent.state)) return anchor;
    if (attack && ['press', 'mark'].includes(agent.state)) return anchor;
    switch (agent.state) {
      case 'keeper':
        return bounded([
          agent.side === 0 ? 5 + (attack ? 2 : 0) : 95 - (attack ? 2 : 0),
          50 + (this.ball[1] - 50) * (0.15 + agent.player.keeper / 500),
        ]);
      case 'support':
        return bounded([
          this.ball[0] - direction * c.supportDistance * (0.6 + t.discipline * 0.6),
          anchor[1] * 0.55 + this.ball[1] * 0.45 + lane,
        ]);
      case 'run':
        return bounded([
          Math.max(
            2,
            Math.min(98, anchor[0] + direction * c.runDistance * (0.5 + p.risk) * (0.6 + freedom)),
          ),
          anchor[1] + lane * 2 + wave * 3 * t.creativity,
        ]);
      case 'press':
        return bounded([
          this.ball[0] + direction * (1.2 + t.anticipation * 1.8),
          this.ball[1] + agent.roam[1] * 2,
        ]);
      case 'mark': {
        const opponents = all.filter((a) => a.side !== agent.side && a.slot !== 0);
        const goal: Point = [agent.side === 0 ? 0 : 100, 50];
        const opponent = opponents.reduce((best, a) => {
          const threat = (candidate: Agent) =>
            distance(agent.position, candidate.position) * 0.65 +
            distance(goal, candidate.position) * 0.35;
          return threat(a) < threat(best) ? a : best;
        }, opponents[0]);
        return bounded([
          opponent.position[0] - direction * c.markingDistance,
          opponent.position[1] + lane * 0.3,
        ]);
      }
      case 'recover':
        return anchor;
      case 'carry':
        return bounded([this.ball[0] - direction * 1.2, this.ball[1] + agent.roam[1] * 0.7]);
      case 'shape':
        return bounded([
          anchor[0] + agent.roam[0] * c.roamDistance * freedom,
          anchor[1] + agent.roam[1] * c.roamDistance * freedom + wave * 1.5 * t.creativity,
        ]);
    }
  }

  private velocity(
    agent: Agent,
    intent: Point,
    anchor: Point,
    all: Agent[],
    minute: number,
    dt: number,
  ): Point {
    const c = MATCH_MOTION_CONFIG.integration,
      p = this.profiles[agent.side],
      t = agent.traits;
    const fatigue =
      unit(agent.player.fatigue / 100) * MATCH_MOTION_CONFIG.traits.fatiguePenalty +
      (minute / 90) * MATCH_MOTION_CONFIG.steering.fatigueFromMinute * (1 - t.endurance);
    const speed =
      c.maxSpeed *
      (0.45 + t.pace * 0.55) *
      Math.max(0.35, 1 - fatigue) *
      (agent.state === 'recover'
        ? 1 + p.ability * MATCH_MOTION_CONFIG.manager.abilityRecovery
        : 1) *
      (this.shadow?.marker === agent ||
      this.challenge?.tackler === agent ||
      this.taker?.agent === agent
        ? MATCH_MOTION_CONFIG.steering.chaseSprint
        : 1);
    const toward: Point = [intent[0] - agent.position[0], intent[1] - agent.position[1]];
    const dist = length(toward);
    const arrive = Math.min(speed, dist * c.arrival) / Math.max(dist, 0.001);
    const desired: Point = [toward[0] * arrive, toward[1] * arrive];
    const pull =
      ['recover', 'keeper', 'carry', 'press'].includes(agent.state) ||
      this.shadow?.marker === agent ||
      this.taker?.agent === agent
        ? 0
        : MATCH_MOTION_CONFIG.steering.formationPull *
          p.cohesion *
          t.discipline *
          (1 - t.freedom * p.freedom);
    desired[0] += (anchor[0] - agent.position[0]) * pull;
    desired[1] += (anchor[1] - agent.position[1]) * pull;
    for (const other of all) {
      if (other === agent) continue;
      const away: Point = [
        agent.position[0] - other.position[0],
        agent.position[1] - other.position[1],
      ];
      const separation = length(away);
      if (separation > 0.001 && separation < c.separationRadius) {
        const force = ((1 - separation / c.separationRadius) * c.separationForce) / separation;
        desired[0] += away[0] * force;
        desired[1] += away[1] * force;
      }
    }
    const desiredScale = Math.min(1, speed / Math.max(length(desired), 0.001));
    const change: Point = [
      desired[0] * desiredScale - agent.velocity[0],
      desired[1] * desiredScale - agent.velocity[1],
    ];
    const accelerationScale = Math.min(
      1,
      (c.acceleration * (0.6 + t.pace * 0.4) * dt) / Math.max(length(change), 0.001),
    );
    const next: Point = [
      agent.velocity[0] + change[0] * accelerationScale,
      agent.velocity[1] + change[1] * accelerationScale,
    ];
    // Changes in fatigue/state lower desired speed; acceleration handles that deceleration.
    const speedScale = Math.min(1, c.maxSpeed / Math.max(length(next), 0.001));
    return [next[0] * speedScale, next[1] * speedScale];
  }

  private snapshot(): [PlayerMotion[], PlayerMotion[]] {
    return this.agents.map((agents) =>
      agents.map((agent): PlayerMotion => ({
        id: agent.player.id,
        position: [...agent.position],
        velocity: [...agent.velocity],
        state: agent.state,
        intent: [...agent.intent],
      })),
    ) as [PlayerMotion[], PlayerMotion[]];
  }
}
