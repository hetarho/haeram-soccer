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
    stepSeconds: 0.2,
    secondsPerMinute: 8,
    samplesPerMinute: 8,
    minPosition: 2,
    maxPosition: 98,
    maxSpeed: 5.8,
    acceleration: 4.2,
    arrival: 1.4,
    separationRadius: 4.2,
    separationForce: 3.5,
    /** The ball is several times faster than any player: passes, turnovers and shots. */
    maxBallSpeed: 55,
    passSpeed: 32,
    turnoverSpeed: 28,
    restartSpeed: 40,
    shotSpeed: 55,
    boundaryMargin: 2,
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
    /** The latest duels of a minute that the pitch plays out; earlier ones are off-screen. */
    visibleEvents: 5,
    dribbleDistance: 14,
    /** Event times inside the minute's motion window, in motion seconds. */
    firstEvent: 0.6,
    lastEvent: 6.6,
    /** A dead ball (kickoff, goal kick) waits this long before the restart pass. */
    restartDelay: 1.2,
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

interface BallFlight {
  target: Point;
  receiver?: Agent;
  phase: 'transition' | 'pass' | 'shot' | 'restart';
  speed: number;
}

interface PlannedEvent {
  at: number;
  event?: MatchEvent;
  /** A restart played to the opening actor once the dead ball is set. */
  restart?: Agent;
}

/** Observation-only dynamics. It has no access to the football outcome RNG. */
export class MatchMotion {
  private agents: [Agent[], Agent[]];
  private profiles: [ReturnType<typeof teamMotionProfile>, ReturnType<typeof teamMotionProfile>];
  private ball: Point = [50, 50];
  private seconds = 0;
  private owner?: Agent;
  private flight?: BallFlight;
  private phase: NonNullable<MatchMotionSample['phase']> = 'restart';
  private passCooldown = 0;
  private ballRandom: () => number;
  private shotTriggered = false;
  private interceptionTriggered = false;
  private previousAction?: string;
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

  minute(
    frame: MatchFrame,
  ): Pick<MatchFrame, 'players' | 'motion' | 'elapsedSeconds' | 'ball' | 'ballTrack'> {
    const c = MATCH_MOTION_CONFIG.integration;
    const steps = Math.round(c.secondsPerMinute / c.stepSeconds);
    const sampleEvery = steps / c.samplesPerMinute;
    const samples: MatchMotionSample[] = [];
    const ballTrack: [number, number][] = [];
    // Recorded duels drive the minute; synthetic frames without them fall back to the action.
    const scripted = !!frame.events?.length;
    if (scripted) this.schedule(frame.events!);
    else this.preparePossession(frame);
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      if (scripted) this.followPlan(progress * c.secondsPerMinute, c.stepSeconds);
      else this.advancePossession(frame, progress, c.stepSeconds);
      this.step(frame, c.stepSeconds);
      this.seconds += c.stepSeconds;
      ballTrack.push([Math.round(this.ball[0] * 10) / 10, Math.round(this.ball[1] * 10) / 10]);
      if (step % sampleEvery === 0)
        samples.push({
          elapsedSeconds: (frame.minute - 1 + progress) * 60,
          ball: [...this.ball],
          players: this.snapshot(),
          phase: this.phase,
          ownerId: this.owner?.player.id,
        });
    }
    this.previousAction = frame.action;
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
   * opening actor (a kickoff after a goal, a turnover or a pass), and markers who win the ball
   * start closing in on it.
   */
  private schedule(events: MatchEvent[]) {
    const c = MATCH_MOTION_CONFIG.possession;
    const integration = MATCH_MOTION_CONFIG.integration;
    const visible = events.slice(-c.visibleEvents);
    const first = visible[0];
    const opener = this.agentAt(first.side, first.actor);
    // A goal (or the opening whistle) sends the ball back to the centre spot; a shot wide becomes
    // a goal kick. The ball stays dead for a moment before the restart is played.
    const kickoff =
      this.previousAction === '골' || (!this.owner && !this.flight && this.phase === 'restart');
    const goalKick = !kickoff && this.phase === 'shot' && !this.owner;
    const start = kickoff || goalKick ? c.restartDelay + 0.4 : c.firstEvent;
    const span = c.lastEvent - start;
    this.plan = visible.map((event, index) => ({
      at:
        visible.length === 1
          ? (start + c.lastEvent) / 2
          : start + (index * span) / (visible.length - 1),
      event,
    }));
    for (const { at, event } of this.plan)
      if (event?.lost && event.opponent !== undefined) {
        const marker = this.agentAt(event.side === 0 ? 1 : 0, event.opponent);
        if (marker.slot !== 0) {
          marker.state = 'press';
          marker.dwell = Math.max(marker.dwell, at + 0.4);
        }
      }
    this.shotTriggered = false;
    if (kickoff || goalKick) {
      this.owner = undefined;
      this.phase = 'restart';
      this.flight = {
        phase: 'restart',
        target: kickoff ? [50, 50] : [this.ball[0] > 50 ? 94 : 6, 50],
        speed: integration.restartSpeed,
      };
      this.plan.unshift({ at: c.restartDelay, restart: opener });
      return;
    }
    if (this.owner === opener) return;
    if ((this.owner?.side ?? this.flight?.receiver?.side) !== first.side)
      this.passTo(opener, 'transition', integration.turnoverSpeed);
    else this.passTo(opener, 'pass', integration.passSpeed);
  }

  private followPlan(time: number, dt: number) {
    while (this.plan.length && this.plan[0].at <= time) {
      const next = this.plan.shift()!;
      if (next.event) this.play(next.event);
      else if (next.restart && this.owner !== next.restart)
        this.passTo(next.restart, 'restart', MATCH_MOTION_CONFIG.integration.passSpeed);
    }
    const c = MATCH_MOTION_CONFIG.possession;
    if (this.flight) {
      this.moveBall(this.flight.target, dt, this.flight.speed);
      if (distance(this.ball, this.flight.target) < 0.05) {
        const receiver = this.flight.receiver;
        if (receiver && distance(receiver.position, this.ball) <= c.controlDistance)
          this.catchBall(receiver);
      }
      return;
    }
    if (!this.owner) return;
    const direction = this.owner.side === 0 ? 1 : -1;
    this.moveBall(
      bounded([this.owner.position[0] + direction, this.owner.position[1]], 0),
      dt,
      MATCH_MOTION_CONFIG.integration.maxBallSpeed,
    );
  }

  private play(event: MatchEvent) {
    const speed = MATCH_MOTION_CONFIG.integration;
    const other: Side = event.side === 0 ? 1 : 0;
    const actor = this.agentAt(event.side, event.actor);
    const opponent = event.opponent === undefined ? undefined : this.agentAt(other, event.opponent);
    const direction = event.side === 0 ? 1 : -1;
    if (event.kind === 'shot') {
      const goalLine = event.side === 0 ? 98 : 2;
      const r = this.ballRandom();
      const target: Point =
        event.outcome === 'goal'
          ? [goalLine, 44 + r * 12]
          : event.outcome === 'miss'
            ? [goalLine, r < 0.5 ? 30 + r * 8 : 62 + r * 8]
            : [...(opponent ?? this.agentAt(other, 0)).position];
      this.flight = {
        phase: 'shot',
        target: bounded(target, 0),
        receiver: event.outcome === 'save' || event.outcome === 'block' ? opponent : undefined,
        speed: speed.shotSpeed,
      };
      this.owner = undefined;
      this.phase = 'shot';
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
      } else if (opponent) this.passTo(opponent, 'transition', speed.turnoverSpeed);
      return;
    }
    const receiver =
      event.receiver === undefined ? undefined : this.agentAt(event.side, event.receiver);
    if (event.ok && receiver) this.passTo(receiver, 'pass', speed.passSpeed);
    else if (event.lost && opponent) {
      // An interception cuts the pass on its way; a tackle takes the ball off the passer.
      if (receiver) {
        const from = this.ball;
        const cut = bounded([
          from[0] + (receiver.position[0] - from[0]) * 0.55,
          from[1] + (receiver.position[1] - from[1]) * 0.55,
        ]);
        this.flight = {
          phase: 'transition',
          target: cut,
          receiver: opponent,
          speed: speed.passSpeed,
        };
        this.owner = undefined;
        this.phase = 'transition';
        opponent.state = 'press';
      } else this.passTo(opponent, 'transition', speed.turnoverSpeed);
    } else if (receiver) {
      // A loose ball lands short of the receiver, who collects it.
      const loose = bounded([
        receiver.position[0] - direction * 3,
        receiver.position[1] + (this.ballRandom() - 0.5) * 6,
      ]);
      this.flight = { phase: 'pass', target: loose, receiver, speed: speed.passSpeed };
      this.owner = undefined;
      this.phase = 'pass';
    }
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
    if (this.previousAction === '골' || this.phase === 'shot') {
      this.passTo(this.agents[frame.side][6], 'restart');
    } else if (currentSide !== frame.side) {
      this.passTo(nearest, 'transition');
    }
    if (['골', '슛', '선방'].includes(frame.action)) {
      const shooter = this.agents[frame.side][frame.player];
      if (this.owner !== shooter) this.passTo(shooter, 'pass');
    }
  }

  private passTo(
    receiver: Agent,
    phase: BallFlight['phase'],
    speed: number = MATCH_MOTION_CONFIG.integration.passSpeed,
  ) {
    const travelTime = distance(this.ball, receiver.position) / speed;
    const anticipation =
      receiver.traits.anticipation * MATCH_MOTION_CONFIG.possession.receiverAnticipation;
    this.flight = {
      receiver,
      phase,
      speed,
      target: bounded([
        receiver.position[0] + receiver.velocity[0] * travelTime * anticipation,
        receiver.position[1] + receiver.velocity[1] * travelTime * anticipation,
      ]),
    };
    this.owner = undefined;
    this.phase = phase;
    receiver.state = receiver.slot === 0 ? 'keeper' : 'support';
    receiver.dwell = Math.max(
      receiver.dwell,
      travelTime + MATCH_MOTION_CONFIG.decisions.minimumDwell,
    );
  }

  private catchBall(receiver: Agent) {
    this.owner = receiver;
    this.flight = undefined;
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

  private advancePossession(frame: MatchFrame, progress: number, dt: number) {
    const c = MATCH_MOTION_CONFIG.possession;
    if (
      !this.interceptionTriggered &&
      frame.action === '인터셉트' &&
      progress >= c.interceptionProgress
    ) {
      const defending = this.agents[frame.side === 0 ? 1 : 0].filter((agent) => agent.slot !== 0);
      const interceptor = defending.reduce(
        (best, agent) =>
          distance(agent.position, this.ball) < distance(best.position, this.ball) ? agent : best,
        defending[0],
      );
      this.passTo(interceptor, 'transition');
      this.interceptionTriggered = true;
    }
    if (
      !this.shotTriggered &&
      ['골', '슛', '선방'].includes(frame.action) &&
      progress >= c.shotProgress
    ) {
      const goalkeeper =
        frame.action === '선방' ? this.agents[frame.side === 0 ? 1 : 0][0] : undefined;
      this.flight = {
        phase: 'shot',
        target: goalkeeper
          ? [...goalkeeper.position]
          : [frame.side === 0 ? 98 : 2, frame.action === '골' ? 50 : clamp(frame.ball[1], 32, 68)],
        receiver: goalkeeper,
        speed: MATCH_MOTION_CONFIG.integration.shotSpeed,
      };
      this.owner = undefined;
      this.phase = 'shot';
      this.shotTriggered = true;
    }
    if (this.flight) {
      this.moveBall(this.flight.target, dt, this.flight.speed);
      if (distance(this.ball, this.flight.target) < 0.05) {
        const receiver = this.flight.receiver;
        if (receiver && distance(receiver.position, this.ball) <= c.controlDistance)
          this.catchBall(receiver);
      }
      return;
    }
    if (!this.owner) return;
    const direction = this.owner.side === 0 ? 1 : -1;
    this.moveBall(
      bounded([this.owner.position[0] + direction, this.owner.position[1]], 0),
      dt,
      MATCH_MOTION_CONFIG.integration.maxBallSpeed,
    );
    this.passCooldown -= dt;
    // Preserve the shooting actor's possession until the shot; dribblers hold it longer.
    if (['골', '슛', '선방'].includes(frame.action) && !this.shotTriggered) return;
    if (frame.action === '돌파' && progress < 0.8) return;
    if (this.passCooldown <= 0) this.passTo(this.chooseReceiver(this.owner), 'pass');
  }

  private moveBall(target: Point, dt: number, speed: number) {
    const delta: Point = [target[0] - this.ball[0], target[1] - this.ball[1]];
    const scale = Math.min(
      1,
      (Math.min(speed, MATCH_MOTION_CONFIG.integration.maxBallSpeed) * dt) /
        Math.max(length(delta), 0.001),
    );
    this.ball = bounded([this.ball[0] + delta[0] * scale, this.ball[1] + delta[1] * scale], 0);
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
    if (this.flight?.receiver === agent) return this.flight.target;
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
      (agent.state === 'recover' ? 1 + p.ability * MATCH_MOTION_CONFIG.manager.abilityRecovery : 1);
    const toward: Point = [intent[0] - agent.position[0], intent[1] - agent.position[1]];
    const dist = length(toward);
    const arrive = Math.min(speed, dist * c.arrival) / Math.max(dist, 0.001);
    const desired: Point = [toward[0] * arrive, toward[1] * arrive];
    const pull = ['recover', 'keeper', 'carry', 'press'].includes(agent.state)
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
