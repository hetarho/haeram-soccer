import type {
  Club,
  Fixture,
  MatchEvent,
  MatchPlayback,
  MatchRecord,
  Player,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random, zeroMetrics } from './primitives';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../contracts/src/detail';
import {
  cohesionMultiplier,
  fatigueLoad,
  findClub,
  ownMultiplier,
  rating,
  startingSquad,
  unhappyPenalty,
} from './world';
import { FORMATIONS, levelFactor as positionLevelFactor, lineOf } from './player';
import { moraleStrength } from './morale';
import { npcTactic, ownTacticalProfile, tacticalProfile, type TacticalProfile } from './strategy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { buildEffects } from './build';
import { MatchMotion } from './motion';
export { MATCH_MOTION_CONFIG, motionTraits, teamMotionProfile, visibleEvents } from './motion';
export const METRICS = [
  '득점',
  '도움',
  '패스 시도',
  '패스 성공',
  '슛',
  '유효슛',
  '태클',
  '인터셉트',
  '드리블',
  '선방',
  '출전 분',
  '점유 분',
];

type Side = 0 | 1;
type Zone = 0 | 1 | 2;
/** Skill offsets in the per-slot effective-skill table. */
/** The attributes a duel reads, per starting slot (→MATCH-11). */
const FINISH = 0,
  PASS = 1,
  VISION = 2,
  DRIBBLE = 3,
  PACE = 4,
  TACKLE = 5,
  POSITION = 6,
  KEEP = 7,
  STAMINA = 8,
  KEYS = 9;

/**
 * Named tuning surface for the duel chain. Starting XI slots: 0 GK, 1–4 DEF, 5–7 MID, 8–10 FWD.
 * Zones follow the attacking direction: 0 build-up, 1 midfield, 2 final third.
 */
export const MATCH_DUEL_CONFIG = {
  /** Pass attempts planned for one possession minute; a turnover ends the chain early. */
  passes: [11, 21] as const,
  /** Share of passes that try to move the ball into the next zone. */
  progressive: { balanced: 0.34, possession: 0.26, counter: 0.46, press: 0.38 } as Record<
    Tactic,
    number
  >,
  /** Share of passes played back into the previous zone to recycle possession. */
  backward: 0.16,
  progressivePenalty: 0.07,
  recyclingBonus: 0.035,
  /** Percentage-point weight of one passing/defense point against the team accuracy. */
  passerWeight: 1 / 380,
  markerWeight: 1 / 420,
  /**
   * A failed pass is lost to the marker this often (the first part counts as a tackle on the
   * passer, the rest as an interception); otherwise a teammate recovers the loose ball.
   */
  tackleShare: 0.22,
  interceptShare: 0.5,
  /** Share of midfield/final-third actions by a midfielder or forward that are dribbles. */
  dribbleShare: 0.08,
  /** Key-duel success between equal players. */
  keySuccess: 0.62,
  /** Chance attempts are the team chance rate divided by this realized key-duel success. */
  keyRealized: 0.6,
  /** Duel-margin points (after diminishing returns) per unit of key-duel success. */
  keyScale: 250,
  /**
   * Shot attempts per point of the team chance rate: open play plus the set pieces and second
   * balls the minute model folds in, so a side takes the 10–16 shots of a top-flight match.
   */
  volume: 1.7,
  /** Most of a side's possession minutes that can become chances. */
  attemptCap: 0.75,
  /** Big chance, box and long-range expected-goal bands (about 0.1 xG per shot overall). */
  chances: {
    big: [0.24, 0.43] as const,
    box: [0.068, 0.16] as const,
    long: [0.024, 0.056] as const,
  },
  bigShare: 0.13,
  /** Duel-margin points (after diminishing returns) per unit of big-chance share. */
  bigScale: 500,
  boxShare: 0.52,
  /**
   * Expected goals scale by exp(bent (shooter attack − keeper) / finishing) and by the shooter's
   * own attack against a 55 baseline, so sharper leagues finish slightly more chances.
   */
  finishing: 90,
  sharpness: 400,
  onTarget: 0.4,
  block: 0.25,
  /** Key-duel and finishing margins between two players bend towards this many points (tanh). */
  saturation: 30,
  /**
   * Diminishing returns on the whole match: a strength gap g plays as g / (1 + (g / S)⁴)^¼ —
   * close to g up to about 15 points, never more than S. A far stronger side eases off and a far
   * weaker one parks the bus, so even a massive favourite still drops points.
   */
  gapSaturation: 24,
  /**
   * Score effects: per goal of lead (up to two) a side ahead sits deeper, ceding this share of
   * the ball and creating `leadEase` as much from what it keeps, so leads get defended,
   * equalisers come and routs stay rare.
   */
  leadPossession: 0.05,
  leadEase: 0.8,
  /**
   * Match-day form: each side's strength and every player's skills move by a seeded, fat-tailed
   * draw with this standard deviation in rating points (travel, rotation, a bad day at the
   * office). It comes on top of the diminishing returns, so it is what topples favourites.
   */
  form: 7,
  /** In-match fatigue: skill points lost by 90′ per missing stamina point. */
  drainPerStamina: 1 / 12,
  pressDrain: 1.3,
  /**
   * Where each tactic defends: pass success taken off the opponent while it builds up in its own
   * two thirds (`high`) and while it attacks the final third (`low`). Pressing wins the ball high
   * and leaves space behind; a counter side cedes the build-up and stays compact.
   */
  lines: {
    balanced: { high: 0, low: 0 },
    possession: { high: 0.02, low: 0 },
    counter: { high: -0.03, low: 0.035 },
    press: { high: 0.07, low: 0 },
  } as Record<Tactic, { high: number; low: number }>,
  /**
   * A minute that starts with the ball just won in the opponent's third: the chance rate rises by
   * this factor and the chance is a big one this much more often.
   */
  transition: { chance: 1.25, big: 0.15 },
} as const;

/**
 * Who carries the ball in each zone and who marks there, from a side's formation lines: defenders
 * build up, midfielders carry through the middle, forwards and the central midfielder attack;
 * forwards mark the build-up, midfielders the middle, defenders the final third.
 */
interface SideLines {
  carriers: readonly (readonly number[])[];
  markers: readonly (readonly number[])[];
  kickoff: number;
  line: readonly string[];
}
const sideLinesCache = new Map<Tactic, SideLines>();
function sideLines(tactic: Tactic): SideLines {
  let lines = sideLinesCache.get(tactic);
  if (!lines) {
    const line = FORMATIONS[tactic].slots.map((slot) => lineOf(slot.position));
    const of = (name: string) => line.flatMap((l, i) => (l === name ? [i] : []));
    const df = of('DF'),
      mf = of('MF'),
      fw = of('FW');
    const central = mf[Math.floor(mf.length / 2)]!;
    lines = {
      carriers: [df, mf, [...fw, central]],
      markers: [fw, mf, df],
      kickoff: central,
      line,
    };
    sideLinesCache.set(tactic, lines);
  }
  return lines;
}
const pick = (pool: readonly number[], u: number) =>
  pool[Math.min(pool.length - 1, Math.floor(u * pool.length))];

/** Seconds of the minute for event `index` of `count`, spaced evenly inside the minute. */
const eventTime = (index: number, count: number) =>
  Math.round((3 + ((index + 0.5) * 54) / Math.max(1, count)) * 10) / 10;

// Shared chance model: the duel chain and the team-level summary resolve chances with the same
// functions, so both paths follow one calibrated strength curve (docs/CALIBRATION.md).
const C = MATCH_DUEL_CONFIG;
/** Diminishing returns on a skill margin: about linear up to half the saturation, then flat. */
const bend = (margin: number) => C.saturation * Math.tanh(margin / C.saturation);
/** The strength gap a match plays at: close to the gap up to ~15 points, never past the cap. */
export const effectiveGap = (gap: number) =>
  gap / Math.sqrt(Math.sqrt(1 + (gap / C.gapSaturation) ** 4));
/**
 * The other side starts a minute with the ball though no duel won it: the ball went out of play off
 * the side that held it (MATCH-12). After a shot it went behind off the keeper or a defender (a
 * corner); from the final third past the byline (a goal kick); anywhere else over a touchline (a
 * throw-in). Nothing is drawn, so outcomes stay where they were.
 */
const restartKind = (carrier: { zone: Zone; shot?: number }): NonNullable<MatchEvent['restart']> =>
  carrier.shot !== undefined ? 'corner' : carrier.zone === 2 ? 'goalKick' : 'throwIn';

/** The home side's chance to hold a minute once score effects shift the ball to the side behind. */
const possessionAt = (chance: number, metrics: number[][]) =>
  chance - C.leadPossession * clamp(metrics[0][0] - metrics[1][0], -2, 2);
/**
 * Chance attempts in one possession minute for a team chance rate; `lead` is the attacking side's
 * goal difference (score effects).
 */
const attemptChance = (chanceRate: number, transition: boolean, lead: number) =>
  Math.min(
    C.attemptCap,
    ((chanceRate * C.volume) / C.keyRealized) *
      (transition ? C.transition.chance : 1) *
      C.leadEase ** clamp(lead, 0, 2),
  );
/** The final ball or solo run beats the defender facing it. */
const keyChance = (margin: number) => clamp(C.keySuccess + bend(margin) / C.keyScale, 0.25, 0.92);
/** One draw `u` sets the chance type and its quality; a wider duel margin makes better chances. */
function chanceQuality(u: number, margin: number, transition: boolean) {
  const big = transition
      ? clamp(C.bigShare + C.transition.big + bend(margin) / C.bigScale, 0.05, 0.5)
      : clamp(C.bigShare + bend(margin) / C.bigScale, 0.05, 0.3),
    box = big + C.boxShare;
  const band = u < big ? C.chances.big : u < box ? C.chances.box : C.chances.long;
  const within = u < big ? u / big : u < box ? (u - big) / C.boxShare : (u - box) / (1 - box);
  return { xg: band[0] + (band[1] - band[0]) * within, big: u < big, box: u < box };
}
/** How much better than a chance's quality this shooter finishes against this keeper. */
const finishing = (shooting: number, keeping: number) =>
  Math.exp(bend(shooting - keeping) / C.finishing) * (1 + (shooting - 55) / C.sharpness);
/** Goal probability of a chance of quality `xg` for this shooter against this keeper. */
const goalChance = (xg: number, shooting: number, keeping: number) =>
  clamp(xg * finishing(shooting, keeping), 0.01, 0.8);
const targetChance = (goal: number, shooting: number) =>
  clamp(goal + C.onTarget + (shooting - 55) / 250, goal + 0.05, 0.95);

/**
 * Each side's match-day form in rating points, drawn on its own stream so fast and observed runs
 * of a fixture share it. Form is fat-tailed (Laplace): most days sit near the usual level, a few
 * are far off it — the off days on which favourites drop points.
 */
export function matchForm(w: World, f: Fixture): [number, number] {
  const r = random(`${w.seed}:form:${f.id}`);
  const draw = () => {
    const u = r() - 0.5;
    return clamp(
      (-Math.sign(u) * Math.log(Math.max(1e-6, 1 - 2 * Math.abs(u))) * C.form) / Math.SQRT2,
      -3 * C.form,
      3 * C.form,
    );
  };
  return [draw(), draw()];
}

interface MatchSetup {
  w: World;
  f: Fixture;
  r: () => number;
  squads: [Player[], Player[]];
  strength: number[];
  /**
   * Points added to every player's skills: the day's form, half the difference of what the sides
   * bring beyond their XI (home ground, manager, morale) — so a point of match strength is worth
   * the same in the duels whether it comes from the squad or from around it — and half the gap
   * that diminishing returns take away.
   */
  shift: number[];
  tactics: [Tactic, Tactic];
  /** Each side's multiplier: an own player's adaptation, another club's 조직력 (→MATCH-2). */
  multiplier: ((p: Player) => number)[];
  profiles: TacticalProfile[];
  possessionChance: number;
  /** Where each side defends and how fast it tires: the tactic line plus the own build's cards. */
  lines: { high: number; low: number }[];
  drain: number[];
}

/**
 * Own-club matches and fixtures whose players are recorded (own league scorers) play the duel
 * chain; every other fixture resolves with the same team formula without naming players.
 */
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  keepPlayers = false,
): MatchPlayback {
  const home = findClub(w, f.home),
    away = findClub(w, f.away);
  const teams: [Club, Club] = [home, away];
  const squads: [Player[], Player[]] = [startingSquad(w, home), startingSquad(w, away)];
  const tactics: [Tactic, Tactic] = teams.map((c) =>
    c.id === w.playerClub ? w.tactic : npcTactic(c),
  ) as [Tactic, Tactic];
  // The own club's manager style, build and synergies; clubs nobody owns play their tactic.
  const ownSide = home.id === w.playerClub ? 0 : away.id === w.playerClub ? 1 : undefined;
  const style = ownSide === undefined ? undefined : managerStyleEffects(w);
  const synergy = ownSide === undefined ? undefined : synergyEffects(w);
  const ownStrength = (side: 0 | 1) =>
    (w.manager.ability - 50) / 4 +
    moraleStrength(w) +
    style!.strength +
    (side === 0 ? buildEffects(w).homeStrength : 0);
  // What each side brings beyond its XI: home ground, then the manager and morale terms.
  const context = [3 + (ownSide === 0 ? ownStrength(0) : 4), ownSide === 1 ? ownStrength(1) : 4];
  const form = matchForm(w, f);
  const base = [rating(w, home) + context[0], rating(w, away) + context[1]];
  // The gap beyond what diminishing returns let count is taken off both sides evenly; the day's
  // form comes on top, so a far stronger side's bad day still shows.
  const gap = base[0] - base[1],
    ease = (effectiveGap(gap) - gap) / 2;
  const strength = [base[0] + ease + form[0], base[1] - ease + form[1]];
  const shift = [
    form[0] + (context[0] - context[1]) / 2 + ease,
    form[1] + (context[1] - context[0]) / 2 - ease,
  ];
  const profiles = [0, 1].map((side) =>
    side === ownSide
      ? ownTacticalProfile(w, squads[side], tactics[side], tactics[1 - side])
      : tacticalProfile(squads[side], tactics[side], tactics[1 - side]),
  );
  const lines = tactics.map((tactic, side) => {
    const line = MATCH_DUEL_CONFIG.lines[tactic];
    return side === ownSide
      ? {
          high: line.high + style!.lineHigh + synergy!.lineHigh,
          low: line.low + style!.lineLow,
        }
      : line;
  });
  const drain = [0, 1].map((side) => (side === ownSide ? style!.drain : 1));
  const setup: MatchSetup = {
    w,
    f,
    r: random(`${w.seed}:match:${f.id}`),
    squads,
    strength,
    shift,
    tactics,
    multiplier: teams.map((club) =>
      club.id === w.playerClub ? ownMultiplier : () => cohesionMultiplier(club),
    ),
    profiles,
    lines,
    drain,
    possessionChance:
      clamp(
        50 + (strength[0] - strength[1]) / 2 + profiles[0].possession - profiles[1].possession,
        20,
        80,
      ) / 100,
  };
  const own = home.id === w.playerClub || away.id === w.playerClub;
  if (!observe && !keepPlayers && !own) return summaryMatch(setup);
  const motion = observe
    ? new MatchMotion(
        `${w.seed}:${f.id}`,
        squads,
        tactics,
        teams.map((club, side) =>
          club.id === w.playerClub
            ? w.manager
            : {
                philosophy: tactics[side],
                ability: clamp(club.strength + 10),
                flexibility: 35 + (club.id.charCodeAt(club.id.length - 1) % 40),
              },
        ) as ConstructorParameters<typeof MatchMotion>[3],
      )
    : undefined;
  return duelMatch(setup, motion, keepPlayers || observe);
}

/**
 * Effective skills per starting slot: pre-match fatigue, an unhappy player's penalty (→CLUB-27),
 * the day's shift and in-match drain. A short list repeats its last player so no slot indexes past
 * the end.
 */
function matchSkills({ squads, tactics, multiplier, drain: drains, shift }: MatchSetup) {
  const base = squads.map((ps, side) => {
    const table = new Float64Array(11 * KEYS);
    const slots = FORMATIONS[tactics[side]].slots;
    for (let slot = 0; slot < 11; slot++) {
      const p = ps[Math.min(slot, ps.length - 1)];
      const load = fatigueLoad(p.fatigue),
        off = unhappyPenalty(p);
      // A player brings his level at the slot and his multiplier to every attribute (→MATCH-11).
      const scale = positionLevelFactor(p.positions, slots[slot]!.position) * multiplier[side](p);
      const a = p.attrs;
      const at = (key: number, value: number, keeper = false) =>
        (table[slot * KEYS + key] = value * scale - load / (keeper ? 10 : 8) - off);
      at(FINISH, a.finishing);
      at(PASS, a.passing);
      at(VISION, a.vision);
      at(DRIBBLE, a.dribbling);
      at(PACE, a.pace);
      at(TACKLE, a.tackling);
      at(POSITION, a.positioning);
      at(KEEP, a.reflexes, true);
      at(STAMINA, a.stamina);
    }
    return table;
  });
  const drain = squads.map((ps, side) => {
    const rate = new Float64Array(11);
    for (let slot = 0; slot < 11; slot++)
      rate[slot] =
        ((100 - ps[Math.min(slot, ps.length - 1)].attrs.stamina) *
          C.drainPerStamina *
          (tactics[side] === 'press' ? C.pressDrain : 1) *
          drains[side]) /
        90;
    return rate;
  });
  // Forwards take most shots, midfielders some, defenders the occasional set piece.
  const lineWeight: Record<string, number> = { FW: 3, MF: 1.1, DF: 0.2, GK: 0 };
  const shooterWeights = base.map((table, side) => {
    const line = sideLines(tactics[side]).line;
    return Array.from(
      { length: 11 },
      (_, slot) => Math.max(1, table[slot * KEYS + FINISH]) * lineWeight[line[slot]!]!,
    );
  });
  const shooterTotals = shooterWeights.map((weights) => weights.reduce((sum, n) => sum + n, 0));
  return {
    base,
    skill: (side: Side, slot: number, key: number, minute: number) =>
      base[side][slot * KEYS + key] + shift[side] - drain[side][slot] * minute,
    chooseShooter: (side: Side, u: number) => {
      let target = u * shooterTotals[side];
      const weights = shooterWeights[side];
      for (let slot = 1; slot < 11; slot++) {
        target -= weights[slot];
        if (target <= 0) return slot;
      }
      return sideLines(tactics[side]).carriers[2][0]!;
    },
  };
}

/**
 * Team-level minutes for fixtures nobody watches or records players for: the duel chain's chance
 * model without the pass-by-pass build-up, so both paths score on the same curve.
 */
function summaryMatch(setup: MatchSetup) {
  const { f, r, squads, strength, tactics, profiles, possessionChance } = setup;
  const { skill, chooseShooter } = matchSkills(setup);
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const highlights: MatchRecord['highlights'] = [];
  for (let minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionAt(possessionChance, metrics) ? 0 : 1;
    const other: Side = side === 0 ? 1 : 0;
    const passCount = integer(r, 5, 12);
    const accuracy = clamp(
      68 + strength[side] / 6 + profiles[side].pass - profiles[other].pressure + integer(r, -8, 8),
      35,
      96,
    );
    const passes = Math.round((passCount * accuracy) / 100);
    metrics[side][11]++;
    metrics[side][2] += passCount;
    metrics[side][3] += passes;
    if (r() < 0.24) metrics[side][8]++;
    const chanceRate = clamp(18 + profiles[side].shot - profiles[other].defense, 7, 30) / 100;
    if (r() >= attemptChance(chanceRate, false, metrics[side][0] - metrics[other][0])) {
      if (passes < passCount) {
        metrics[other][6]++;
        metrics[other][7]++;
      }
      continue;
    }
    // The final ball comes from whoever carries it into the final third; alone it is a solo run.
    const shooter = chooseShooter(side, r()),
      creator = pick(sideLines(tactics[side]).carriers[2], r()),
      defender = pick(sideLines(tactics[other]).markers[2], r());
    const solo = creator === shooter;
    const attackValue = solo
      ? skill(side, shooter, DRIBBLE, minute) * 0.7 + skill(side, shooter, PACE, minute) * 0.3
      : skill(side, creator, VISION, minute) * 0.5 + skill(side, shooter, FINISH, minute) * 0.5;
    const margin =
      attackValue -
      (skill(other, defender, TACKLE, minute) + skill(other, defender, POSITION, minute)) / 2;
    if (r() >= keyChance(margin)) {
      metrics[other][solo ? 6 : 7]++;
      continue;
    }
    const { xg } = chanceQuality(r(), margin, false);
    const shooting = skill(side, shooter, FINISH, minute);
    const goal = goalChance(xg, shooting, skill(other, 0, KEEP, minute));
    const shot = r();
    metrics[side][4]++;
    if (shot >= targetChance(goal, shooting)) continue;
    metrics[side][5]++;
    if (shot >= goal) {
      metrics[other][9]++;
      continue;
    }
    metrics[side][0]++;
    if (!solo) metrics[side][1]++;
    highlights.push({
      minute,
      side,
      player: squads[side][Math.min(shooter, squads[side].length - 1)].name,
      action: '골',
    });
  }
  metrics[0][10] = 90;
  metrics[1][10] = 90;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    players: [],
    highlights,
    tactics,
  };
  return { record, frames: [], squads };
}

/** Every action of a possession minute is a duel between named players (MATCH-11). */
function duelMatch(
  setup: MatchSetup,
  motion: MatchMotion | undefined,
  recordPlayers: boolean,
): MatchPlayback {
  const { f, r, squads, strength, tactics, profiles, possessionChance, lines } = setup;
  const c = MATCH_DUEL_CONFIG;
  const observe = !!motion;
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const contributions = squads.map((ps) => ps.map(() => zeroMetrics()));
  // Advanced counters (MATCH-13): team rows follow TD, player rows follow PD.
  const team: [number[], number[]] = [emptyTeamDetail(), emptyTeamDetail()];
  const personal = squads.map((ps) => ps.map(() => emptyPlayerDetail()));
  const frames: MatchPlayback['frames'] = [];
  const highlights: MatchRecord['highlights'] = [];
  const xg: [number, number] = [0, 0];
  const skills = matchSkills(setup),
    base = skills.base,
    chooseShooter = skills.chooseShooter;
  let minute = 0;
  const skill = (side: Side, slot: number, key: number) => skills.skill(side, slot, key, minute);
  const credit = (side: Side, slot: number, metric: number) => {
    const row = contributions[side][slot];
    if (row) row[metric]++;
  };
  const note = (side: Side, slot: number, key: number, amount = 1) => {
    const row = personal[side][slot];
    if (row) row[key] += amount;
  };
  /** The other side won the ball from `side` in `zone`, by `slot`. */
  const regain = (side: Side, zone: Zone, slot: number) => {
    const winner: Side = side === 0 ? 1 : 0;
    if (zone <= 1) team[winner][TD.pressActions]++;
    if (zone === 0) {
      team[winner][TD.highTurnovers]++;
      note(winner, slot, PD.highTurnovers);
    }
  };
  // xG is recorded for an average finisher and keeper of this match's level, so goals minus xG
  // shows real finishing, goalkeeping and the day's form instead of a constant gap in weaker
  // leagues.
  const forwards = [0, 1].map((side) => sideLines(tactics[side]).markers[0]);
  const levelShooting =
      base.reduce(
        (sum, table, side) =>
          sum + forwards[side]!.reduce((s, slot) => s + table[slot * KEYS + FINISH], 0),
        0,
      ) / Math.max(1, forwards[0]!.length + forwards[1]!.length),
    levelKeeping = (base[0][KEEP] + base[1][KEEP]) / 2;
  const levelFactor = finishing(levelShooting, levelKeeping);
  /**
   * Who holds the ball as the minute ends; absent after a goal, when play restarts at kickoff.
   * After a shot, `shot` is the defender or keeper who touched it last.
   */
  let carrier: { side: Side; slot: number; zone: Zone; won?: boolean; shot?: number } | undefined;
  for (minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionAt(possessionChance, metrics) ? 0 : 1;
    const other: Side = side === 0 ? 1 : 0;
    const planned = integer(r, c.passes[0], c.passes[1]);
    const accuracy =
      clamp(
        68 +
          strength[side] / 6 +
          profiles[side].pass -
          profiles[other].pressure +
          integer(r, -8, 8),
        35,
        96,
      ) / 100;
    const chanceRate = clamp(18 + profiles[side].shot - profiles[other].defense, 7, 30) / 100;
    // Winning the ball in the opponent's third and keeping it is the best playmaker.
    const transition = !!carrier?.won && carrier.side === side && carrier.zone === 2;
    const chance =
      r() < attemptChance(chanceRate, transition, metrics[side][0] - metrics[other][0]);
    metrics[side][11]++;
    let zone: Zone, slot: number;
    let restart: MatchEvent | undefined;
    if (!carrier) {
      zone = 1;
      slot = sideLines(tactics[side]).kickoff;
    } else if (carrier.side === side) {
      zone = carrier.zone;
      slot = carrier.slot;
    } else {
      // The ball went out off the other side where it held it: deep for them is high up for us.
      zone = (2 - carrier.zone) as Zone;
      slot = pick(sideLines(tactics[side]).carriers[zone], r());
      if (observe)
        restart = {
          t: 0,
          kind: 'restart',
          restart: restartKind(carrier),
          side,
          actor: slot,
          opponent: carrier.shot ?? carrier.slot,
          zone,
        };
    }
    carrier = undefined;
    const events: MatchEvent[] | undefined = observe ? (restart ? [restart] : []) : undefined;
    let action = '패스',
      actor = slot,
      lastPasser: number | undefined,
      ended = false;
    // A chance minute is a direct attack: a short build-up, then one key duel and a shot.
    const passes = chance
      ? 1 + Math.floor(r() * (tactics[side] === 'possession' ? 5 : 3))
      : planned;
    const progressive = c.progressive[tactics[side]];
    let lost = 1;
    for (let i = 0; i < passes && !ended; i++) {
      const u = r();
      const ownLine = sideLines(tactics[side]).line[slot];
      const canDribble = !chance && zone >= 1 && (ownLine === 'MF' || ownLine === 'FW');
      if (canDribble && u < c.dribbleShare) {
        const defender = pick(sideLines(tactics[other]).markers[zone], u / c.dribbleShare);
        const beat = clamp(
          0.55 +
            (skill(side, slot, DRIBBLE) * 0.7 +
              skill(side, slot, PACE) * 0.3 -
              (skill(other, defender, TACKLE) * 0.7 + skill(other, defender, PACE) * 0.3)) /
              140,
          0.2,
          0.85,
        );
        const ok = r() < beat;
        team[side][TD.takeOns]++;
        note(side, slot, PD.takeOns);
        if (ok) {
          metrics[side][8]++;
          credit(side, slot, 8);
          zone = Math.min(2, zone + 1) as Zone;
          action = '돌파';
          actor = slot;
        } else {
          metrics[other][6]++;
          credit(other, defender, 6);
          regain(side, zone, defender);
          carrier = { side: other, slot: defender, zone: (2 - zone) as Zone, won: true };
          action = '태클';
          actor = defender;
          ended = true;
        }
        events?.push({
          t: 0,
          kind: 'dribble',
          side,
          actor: slot,
          opponent: defender,
          ok,
          lost: !ok,
          zone,
        });
        continue;
      }
      // One draw picks the direction (forward, square, back) and who receives it.
      const v = canDribble ? (u - c.dribbleShare) / (1 - c.dribbleShare) : u;
      const low = zone < 2 ? progressive : 0,
        high = zone > 0 ? 1 - c.backward : 1;
      const forward = v < low,
        back = v >= high;
      const target = (forward ? zone + 1 : back ? zone - 1 : zone) as Zone;
      const pool = sideLines(tactics[side]).carriers[target];
      let receiver = pick(
        pool,
        forward ? v / low : back ? (v - high) / c.backward : (v - low) / (high - low),
      );
      if (receiver === slot) receiver = pool[(pool.indexOf(receiver) + 1) % pool.length];
      const marker = pick(sideLines(tactics[other]).markers[zone], r());
      const success = clamp(
        accuracy +
          (skill(side, slot, PASS) - 55) * c.passerWeight -
          (skill(other, marker, POSITION) - 55) * c.markerWeight +
          (forward ? -c.progressivePenalty : c.recyclingBonus) -
          (zone <= 1 ? lines[other].high : lines[other].low),
        0.3,
        0.97,
      );
      metrics[side][2]++;
      credit(side, slot, 2);
      if (zone <= 1) team[side][TD.buildUpPasses]++;
      else {
        team[side][TD.finalThirdPasses]++;
        note(side, slot, PD.finalThirdPasses);
      }
      if (r() < success) {
        metrics[side][3]++;
        credit(side, slot, 3);
        if (zone === 2) {
          team[side][TD.finalThirdCompleted]++;
          note(side, slot, PD.finalThirdCompleted);
        }
        if (forward) {
          team[side][TD.progressivePasses]++;
          note(side, slot, PD.progressivePasses);
        }
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver,
          opponent: marker,
          ok: true,
          zone: target,
        });
        lastPasser = slot;
        slot = receiver;
        zone = target;
        action = '패스';
        actor = slot;
      } else if ((lost = chance ? 1 : r()) < c.interceptShare) {
        // The marker closes the passer down (a tackle) or reads the pass (an interception).
        const tackled = lost < c.tackleShare;
        metrics[other][tackled ? 6 : 7]++;
        credit(other, marker, tackled ? 6 : 7);
        regain(side, zone, marker);
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver: tackled ? undefined : receiver,
          opponent: marker,
          ok: false,
          lost: true,
          zone,
        });
        carrier = { side: other, slot: marker, zone: (2 - zone) as Zone, won: true };
        action = tackled ? '태클' : '인터셉트';
        actor = marker;
        ended = true;
      } else {
        // A loose ball: the intended receiver's line recovers it where it landed.
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver,
          opponent: marker,
          ok: false,
          zone,
        });
        lastPasser = undefined;
        slot = receiver;
        actor = slot;
      }
    }
    if (chance && !ended) {
      const shooter = chooseShooter(side, r());
      const creator = shooter === slot ? undefined : slot;
      const defender = pick(sideLines(tactics[other]).markers[2], r());
      const attackValue =
        creator === undefined
          ? skill(side, shooter, DRIBBLE) * 0.7 + skill(side, shooter, PACE) * 0.3
          : skill(side, creator, VISION) * 0.5 + skill(side, shooter, FINISH) * 0.5;
      const margin =
        attackValue - (skill(other, defender, TACKLE) + skill(other, defender, POSITION)) / 2;
      const key = keyChance(margin);
      // The final ball is an attacking-third pass; a solo run is a take-on.
      if (creator !== undefined) {
        metrics[side][2]++;
        credit(side, creator, 2);
        team[side][TD.finalThirdPasses]++;
        note(side, creator, PD.finalThirdPasses);
      } else {
        team[side][TD.takeOns]++;
        note(side, shooter, PD.takeOns);
      }
      if (r() >= key) {
        // The marker reads the final ball or stops the run: the chance never becomes a shot.
        if (creator !== undefined) {
          metrics[other][7]++;
          credit(other, defender, 7);
          action = '인터셉트';
        } else {
          metrics[other][6]++;
          credit(other, defender, 6);
          action = '태클';
        }
        events?.push({
          t: 0,
          kind: creator === undefined ? 'dribble' : 'pass',
          side,
          actor: creator ?? shooter,
          receiver: creator === undefined ? undefined : shooter,
          opponent: defender,
          ok: false,
          lost: true,
          zone: 2,
        });
        carrier = { side: other, slot: defender, zone: 0 };
        actor = defender;
      } else {
        if (creator !== undefined) {
          metrics[side][3]++;
          credit(side, creator, 3);
          team[side][TD.finalThirdCompleted]++;
          note(side, creator, PD.finalThirdCompleted);
          if (zone < 2) {
            team[side][TD.progressivePasses]++;
            note(side, creator, PD.progressivePasses);
          }
          lastPasser = creator;
          events?.push({
            t: 0,
            kind: 'pass',
            side,
            actor: creator,
            receiver: shooter,
            opponent: defender,
            ok: true,
            zone: 2,
          });
        } else {
          metrics[side][8]++;
          credit(side, shooter, 8);
          // Beating the last man alone makes the chance his own: no key pass, no assist.
          lastPasser = undefined;
          events?.push({
            t: 0,
            kind: 'dribble',
            side,
            actor: shooter,
            opponent: defender,
            ok: true,
            zone: 2,
          });
        }
        const quality = chanceQuality(r(), margin, transition),
          chanceXg = quality.xg;
        const shooting = skill(side, shooter, FINISH);
        const goal = goalChance(chanceXg, shooting, skill(other, 0, KEEP)),
          onTarget = targetChance(goal, shooting);
        const blockChance = clamp(
          c.block + (skill(other, defender, POSITION) - 55) / 300,
          0.05,
          0.5,
        );
        const shotXg = Math.min(0.8, chanceXg * levelFactor);
        xg[side] += shotXg;
        metrics[side][4]++;
        credit(side, shooter, 4);
        const bigChance = quality.big,
          shotXg100 = Math.round(shotXg * 100);
        if (bigChance) team[side][TD.bigChances]++;
        if (quality.box) team[side][TD.boxShots]++;
        note(side, shooter, PD.xg, shotXg100);
        // The last completed pass before the shot is the key pass; it earns the shot's xG as xA.
        if (lastPasser !== undefined) {
          team[side][TD.keyPasses]++;
          note(side, lastPasser, PD.keyPasses);
          note(side, lastPasser, PD.xa, shotXg100);
          if (bigChance) note(side, lastPasser, PD.bigChancesCreated);
        }
        const shot = r();
        let outcome: NonNullable<MatchEvent['outcome']>;
        if (shot < onTarget) {
          metrics[side][5]++;
          credit(side, shooter, 5);
          if (shot < goal) {
            outcome = 'goal';
            metrics[side][0]++;
            credit(side, shooter, 0);
            if (bigChance) team[side][TD.bigChancesScored]++;
            if (lastPasser !== undefined) {
              metrics[side][1]++;
              credit(side, lastPasser, 1);
            }
            highlights.push({
              minute,
              side,
              player: squads[side][Math.min(shooter, squads[side].length - 1)].name,
              action: '골',
            });
            action = '골';
          } else {
            outcome = 'save';
            metrics[other][9]++;
            credit(other, 0, 9);
            carrier = { side: other, slot: 0, zone: 0, shot: 0 };
            action = '선방';
          }
        } else if ((shot - onTarget) / (1 - onTarget) < blockChance) {
          outcome = 'block';
          carrier = { side: other, slot: defender, zone: 0, shot: defender };
          action = '슛';
        } else {
          outcome = 'miss';
          // A goal kick; if the shooting side keeps the ball, it went wide off the defender.
          carrier = { side: other, slot: 0, zone: 0, shot: defender };
          action = '슛';
        }
        events?.push({
          t: 0,
          kind: 'shot',
          side,
          actor: shooter,
          opponent: outcome === 'save' || outcome === 'goal' ? 0 : defender,
          outcome,
          xg: Math.round(shotXg * 100) / 100,
          zone: 2,
        });
        actor = shooter;
      }
    }
    // Nothing lost and no shot: the same player keeps the ball into the next minute.
    if (!ended && !chance) carrier = { side, slot, zone };
    if (observe) {
      events!.forEach((event, index) => (event.t = eventTime(index, events!.length)));
      const last = events!.at(-1);
      const owner: Side = last?.lost ? other : side;
      const frame: MatchPlayback['frames'][number] = {
        minute,
        score: { home: metrics[0][0], away: metrics[1][0] },
        metrics: [metrics[0].slice(), metrics[1].slice()],
        ball: [owner === 0 ? 30 + zone * 25 : 70 - zone * 25, 50],
        side,
        player: actor,
        action,
        events,
        xg: [Math.round(xg[0] * 100) / 100, Math.round(xg[1] * 100) / 100],
      };
      Object.assign(frame, motion!.minute(frame));
      frames.push(frame);
    }
  }
  metrics[0][10] = 90;
  metrics[1][10] = 90;
  for (const ps of contributions) for (const s of ps) s[10] = 90;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    xg: [Math.round(xg[0] * 100) / 100, Math.round(xg[1] * 100) / 100],
    detail: team,
    players: recordPlayers
      ? squads.flatMap((ps, side) =>
          ps.map((p, i) => ({
            id: p.id,
            metrics: contributions[side][i],
            detail: personal[side][i],
          })),
        )
      : [],
    highlights,
    tactics,
  };
  return { record, frames, squads };
}
