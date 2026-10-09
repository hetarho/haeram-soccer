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
import { fatigueLoad, rating, startingSquad, findClub } from './world';
import { moraleStrength } from './morale';
import { npcTactic, ownTacticalProfile, tacticalProfile, type TacticalProfile } from './strategy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { visionEffects } from './vision';
import { MatchMotion } from './motion';
export { MATCH_MOTION_CONFIG, playerTraits, teamMotionProfile } from './motion';
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
const ATTACK = 0,
  PASSING = 1,
  DEFENSE = 2,
  KEEPER = 3,
  STAMINA = 4;

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
  keyScale: 150,
  /** Big chance, box and long-range expected-goal bands. */
  chances: {
    big: [0.3, 0.54] as const,
    box: [0.085, 0.2] as const,
    long: [0.03, 0.07] as const,
  },
  bigShare: 0.13,
  boxShare: 0.52,
  /**
   * Expected goals scale by exp((shooter attack − keeper) / finishing) and by the shooter's own
   * attack against a 55 baseline, so sharper leagues finish more chances.
   */
  finishing: 45,
  sharpness: 150,
  onTarget: 0.4,
  block: 0.25,
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

/** Who carries the ball in each zone, and who marks there. */
const CARRIERS: readonly (readonly number[])[] = [
  [1, 2, 3, 4],
  [5, 6, 7],
  [8, 9, 10, 6],
];
const MARKERS: readonly (readonly number[])[] = [
  [8, 9, 10],
  [5, 6, 7],
  [1, 2, 3, 4],
];
const pick = (pool: readonly number[], u: number) =>
  pool[Math.min(pool.length - 1, Math.floor(u * pool.length))];

/** Seconds of the minute for event `index` of `count`, spaced evenly inside the minute. */
const eventTime = (index: number, count: number) =>
  Math.round((3 + ((index + 0.5) * 54) / Math.max(1, count)) * 10) / 10;

interface MatchSetup {
  w: World;
  f: Fixture;
  r: () => number;
  squads: [Player[], Player[]];
  strength: number[];
  tactics: [Tactic, Tactic];
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
  // The own club's manager style, vision and synergies; clubs nobody owns play their tactic.
  const ownSide = home.id === w.playerClub ? 0 : away.id === w.playerClub ? 1 : undefined;
  const style = ownSide === undefined ? undefined : managerStyleEffects(w);
  const synergy = ownSide === undefined ? undefined : synergyEffects(w);
  const ownStrength = (side: 0 | 1) =>
    (w.manager.ability - 50) / 4 +
    moraleStrength(w) +
    style!.strength +
    (side === 0 ? visionEffects(w).homeStrength : 0);
  const strength = [
    rating(w, home) + 3 + (ownSide === 0 ? ownStrength(0) : 4),
    rating(w, away) + (ownSide === 1 ? ownStrength(1) : 4),
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
    tactics,
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

/** Team-level minutes for fixtures nobody watches or records players for. */
function summaryMatch({ f, r, squads, strength, tactics, profiles, possessionChance }: MatchSetup) {
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const highlights: MatchRecord['highlights'] = [];
  for (let minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionChance ? 0 : 1;
    const other: Side = side === 0 ? 1 : 0;
    const actor = integer(r, 8, 10),
      passCount = integer(r, 5, 12);
    const accuracy = clamp(
      68 + strength[side] / 6 + profiles[side].pass - profiles[other].pressure + integer(r, -8, 8),
      35,
      96,
    );
    const passes = Math.round((passCount * accuracy) / 100);
    metrics[side][11]++;
    metrics[side][2] += passCount;
    metrics[side][3] += passes;
    const dribble = r() < 0.24;
    const shot = r() < clamp(18 + profiles[side].shot - profiles[other].defense, 7, 30) / 100;
    const shooter = squads[side][actor],
      keeper = squads[other][0];
    const onTarget =
      r() < clamp(42 + (shooter.attack - fatigueLoad(shooter.fatigue) / 8) / 4, 35, 78) / 100;
    const goal =
      r() <
      clamp(
        25 +
          (shooter.attack -
            fatigueLoad(shooter.fatigue) / 8 -
            keeper.keeper +
            fatigueLoad(keeper.fatigue) / 10) /
            3,
        8,
        48,
      ) /
        100;
    if (dribble) metrics[side][8]++;
    if (!shot && passes < passCount) {
      metrics[other][6]++;
      metrics[other][7]++;
    }
    if (shot) {
      metrics[side][4]++;
      if (onTarget) {
        metrics[side][5]++;
        if (goal) {
          metrics[side][0]++;
          metrics[side][1]++;
          highlights.push({ minute, side, player: shooter.name, action: '골' });
        } else metrics[other][9]++;
      }
    }
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
  { f, r, squads, strength, tactics, profiles, possessionChance, lines, drain: drains }: MatchSetup,
  motion: MatchMotion | undefined,
  recordPlayers: boolean,
): MatchPlayback {
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
  // Effective skills per slot (pre-match fatigue applied) and in-match drain per minute. A short
  // list repeats its last player so no slot indexes past the end.
  const base = squads.map((ps) => {
    const table = new Float64Array(11 * 5);
    for (let slot = 0; slot < 11; slot++) {
      const p = ps[Math.min(slot, ps.length - 1)];
      const load = fatigueLoad(p.fatigue);
      table[slot * 5 + ATTACK] = p.attack - load / 8;
      table[slot * 5 + PASSING] = p.passing - load / 8;
      table[slot * 5 + DEFENSE] = p.defense - load / 8;
      table[slot * 5 + KEEPER] = p.keeper - load / 10;
      table[slot * 5 + STAMINA] = p.stamina - load / 8;
    }
    return table;
  });
  const drain = squads.map((ps, side) => {
    const rate = new Float64Array(11);
    for (let slot = 0; slot < 11; slot++)
      rate[slot] =
        ((100 - ps[Math.min(slot, ps.length - 1)].stamina) *
          c.drainPerStamina *
          (tactics[side] === 'press' ? c.pressDrain : 1) *
          drains[side]) /
        90;
    return rate;
  });
  let minute = 0;
  const skill = (side: Side, slot: number, key: number) =>
    base[side][slot * 5 + key] - drain[side][slot] * minute;
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
  // Forwards take most shots, midfielders some, defenders the occasional set piece.
  // xG is recorded for an average finisher and keeper of this match's level, so goals minus xG
  // shows real finishing and goalkeeping instead of a constant gap in weaker leagues.
  const levelShooting =
      base.reduce((sum, table) => sum + table[8 * 5] + table[9 * 5] + table[10 * 5], 0) / 6,
    levelKeeping = (base[0][KEEPER] + base[1][KEEPER]) / 2;
  const levelFactor =
    Math.exp((levelShooting - levelKeeping) / c.finishing) *
    (1 + (levelShooting - 55) / c.sharpness);
  const shooterWeights = base.map((table) =>
    Array.from(
      { length: 11 },
      (_, slot) =>
        Math.max(1, table[slot * 5 + ATTACK]) *
        (slot >= 8 ? 3 : slot >= 5 ? 1.1 : slot >= 1 ? 0.2 : 0),
    ),
  );
  const shooterTotals = shooterWeights.map((weights) => weights.reduce((sum, n) => sum + n, 0));
  const chooseShooter = (side: Side, u: number) => {
    let target = u * shooterTotals[side];
    const weights = shooterWeights[side];
    for (let slot = 1; slot < 11; slot++) {
      target -= weights[slot];
      if (target <= 0) return slot;
    }
    return 9;
  };
  /** Who holds the ball as the minute ends; absent after a goal, when play restarts at kickoff. */
  let carrier: { side: Side; slot: number; zone: Zone; won?: boolean } | undefined;
  for (minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionChance ? 0 : 1;
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
      r() < Math.min(0.6, (chanceRate / c.keyRealized) * (transition ? c.transition.chance : 1));
    metrics[side][11]++;
    let zone: Zone, slot: number;
    if (!carrier) {
      zone = 1;
      slot = 6;
    } else if (carrier.side === side) {
      zone = carrier.zone;
      slot = carrier.slot;
    } else {
      // Won straight back where the other side held it: deep for them is high up for us.
      zone = (2 - carrier.zone) as Zone;
      slot = pick(CARRIERS[zone], r());
    }
    carrier = undefined;
    const events: MatchEvent[] | undefined = observe ? [] : undefined;
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
      const canDribble = !chance && zone >= 1 && slot >= 5;
      if (canDribble && u < c.dribbleShare) {
        const defender = pick(MARKERS[zone], u / c.dribbleShare);
        const beat = clamp(
          0.55 +
            (skill(side, slot, ATTACK) * 0.7 +
              skill(side, slot, STAMINA) * 0.3 -
              skill(other, defender, DEFENSE)) /
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
      const pool = CARRIERS[target];
      let receiver = pick(
        pool,
        forward ? v / low : back ? (v - high) / c.backward : (v - low) / (high - low),
      );
      if (receiver === slot) receiver = pool[(pool.indexOf(receiver) + 1) % pool.length];
      const marker = pick(MARKERS[zone], r());
      const success = clamp(
        accuracy +
          (skill(side, slot, PASSING) - 55) * c.passerWeight -
          (skill(other, marker, DEFENSE) - 55) * c.markerWeight +
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
      const defender = pick(MARKERS[2], r());
      const attackValue =
        creator === undefined
          ? skill(side, shooter, ATTACK) * 0.7 + skill(side, shooter, STAMINA) * 0.3
          : skill(side, creator, PASSING) * 0.5 + skill(side, shooter, ATTACK) * 0.5;
      const margin = attackValue - skill(other, defender, DEFENSE);
      const key = clamp(c.keySuccess + margin / c.keyScale, 0.25, 0.92);
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
        // One draw sets the chance type and its quality; a wider duel margin makes better chances.
        const u = r();
        const big = transition
            ? clamp(c.bigShare + c.transition.big + margin / 400, 0.05, 0.5)
            : clamp(c.bigShare + margin / 400, 0.05, 0.3),
          box = big + c.boxShare;
        const band = u < big ? c.chances.big : u < box ? c.chances.box : c.chances.long;
        const within = u < big ? u / big : u < box ? (u - big) / c.boxShare : (u - box) / (1 - box);
        const chanceXg = band[0] + (band[1] - band[0]) * within;
        const shooting = skill(side, shooter, ATTACK),
          keeping = skill(other, 0, KEEPER);
        const goalChance = clamp(
          chanceXg *
            Math.exp((shooting - keeping) / c.finishing) *
            (1 + (shooting - 55) / c.sharpness),
          0.01,
          0.8,
        );
        const targetChance = clamp(
          goalChance + c.onTarget + (shooting - 55) / 250,
          goalChance + 0.05,
          0.95,
        );
        const blockChance = clamp(
          c.block + (skill(other, defender, DEFENSE) - 55) / 300,
          0.05,
          0.5,
        );
        const shotXg = Math.min(0.8, chanceXg * levelFactor);
        xg[side] += shotXg;
        metrics[side][4]++;
        credit(side, shooter, 4);
        const bigChance = u < big,
          shotXg100 = Math.round(shotXg * 100);
        if (bigChance) team[side][TD.bigChances]++;
        if (u < box) team[side][TD.boxShots]++;
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
        if (shot < targetChance) {
          metrics[side][5]++;
          credit(side, shooter, 5);
          if (shot < goalChance) {
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
            carrier = { side: other, slot: 0, zone: 0 };
            action = '선방';
          }
        } else if ((shot - targetChance) / (1 - targetChance) < blockChance) {
          outcome = 'block';
          carrier = { side: other, slot: defender, zone: 0 };
          action = '슛';
        } else {
          outcome = 'miss';
          carrier = { side: other, slot: 0, zone: 0 };
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
