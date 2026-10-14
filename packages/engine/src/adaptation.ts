import type { Club, Manager, Player, Tactic, World } from '../../contracts/src/types';
import type { Position, PositionLevel } from '../../contracts/src/player';
import {
  ADAPTABILITY_RATE,
  adaptationAfter,
  adaptationMultiplier,
  FORMATIONS,
  gainLevelFactor,
  managerChangeLoss,
  MATCH_GAIN,
  schoolFactor,
} from './player';
import { addEvent } from './world';

/**
 * Adaptation and 조직력 as the world lives them (→PLAYER-4, PLAYER-12–14, LEAGUE-12): starts settle
 * a player and retrain him at the positions he plays, a new manager costs part of it, a stay
 * that never settles is reported once, and every other club's 조직력 rises and falls the same way.
 */
export const ADAPTATION_CONFIG = {
  /** Settled league rounds after which a player still below the bar has failed to settle. */
  unsettledRounds: 23,
  unsettledBelow: 0.5,
  /** Starts at a position that raise his level there: 미숙→어색, 어색→준수, 준수→최상 (→PLAYER-4). */
  retrain: [20, 40, 60] as const,
  /** 조직력 per settled league round, below and above 0.80 (→LEAGUE-12). */
  cohesionRise: { below: 0.01, above: 0.005 },
  /** 조직력 a summer's change costs: a takeover or a new project, a promotion or a relegation. */
  cohesionDrop: { investment: 0.15, move: 0.1 },
  cohesionFloor: 0.3,
} as const;

const round4 = (value: number) => Math.round(value * 10000) / 10000;
const neutral = (m: Pick<Manager, 'style' | 'interim'>) => m.interim || !m.style;

/** How fast a player settles under the manager in charge: his 적응력 and the school's taste. */
export function settleRate(w: World, p: Player) {
  return (
    ADAPTABILITY_RATE[p.personality.adaptability - 1] *
    schoolFactor(
      { style: w.manager.style, neutral: neutral(w.manager) },
      { attrs: p.attrs, traits: p.traits, age: w.year - p.born },
    )
  );
}

/** A start at a position he is not 최상 at counts toward the next level there (→PLAYER-4). */
function retrain(p: Player, position: Position) {
  const level = p.positions[position] ?? 0;
  if (level === 3) return;
  const starts = (p.positionStarts?.[position] ?? 0) + 1;
  if (starts >= ADAPTATION_CONFIG.retrain[level]) {
    p.positions = { ...p.positions, [position]: (level + 1) as PositionLevel };
    const rest = { ...p.positionStarts };
    delete rest[position];
    if (Object.keys(rest).length) p.positionStarts = rest;
    else delete p.positionStarts;
    return;
  }
  p.positionStarts = { ...p.positionStarts, [position]: starts };
}

/**
 * An own match: each starter settles by his start at the slot he played (→PLAYER-12) and the
 * start counts toward retraining there (→PLAYER-4). `xi` is the side's XI in slot order.
 */
export function settleStarts(w: World, xi: readonly Player[], tactic: Tactic) {
  const slots = FORMATIONS[tactic].slots;
  xi.forEach((starter, i) => {
    const p = w.players.find((one) => one.id === starter.id);
    const slot = slots[i];
    if (!p || !slot) return;
    const gain = MATCH_GAIN.start * settleRate(w, p) * gainLevelFactor(p.positions, slot.position);
    p.adaptation = adaptationAfter(p.adaptation, gain);
    retrain(p, slot.position);
  });
}

/** A new manager in charge: every own player loses part of how settled he was (→PLAYER-13). */
export function onManagerChange(w: World, before: Manager, after: Manager) {
  if (before.id === after.id) return;
  const same = !neutral(before) && !neutral(after) && before.style === after.style;
  for (const p of w.players)
    if (p.status === 'active') p.adaptation = managerChangeLoss(p.adaptation, same);
}

/**
 * A settled league round: each player's stay lengthens, and one still below the bar after 23
 * rounds has failed to settle, reported once per stay (→PLAYER-14).
 */
export function settleClubRounds(w: World) {
  const c = ADAPTATION_CONFIG;
  for (const p of w.players) {
    if (p.status !== 'active') continue;
    p.clubRounds = (p.clubRounds ?? 0) + 1;
    if (p.clubRounds < c.unsettledRounds || p.adaptation >= c.unsettledBelow) continue;
    if (p.unsettled !== undefined) continue;
    p.unsettled = w.year;
    addEvent(
      w,
      'unsettled',
      `${p.name} 적응 실패`,
      `${p.position} · ${p.clubRounds}라운드째 적응도 ${p.adaptation.toFixed(2)} · 기량의 ${Math.round(
        100 * adaptationMultiplier(p.adaptation),
      )}%로 뛰고 있어요`,
    );
  }
}

const cohesion = (club: Club) => club.cohesion ?? 0.8;
/** 조직력 of every club nobody owns rises with each settled league round (→LEAGUE-12). */
export function settleCohesion(w: World) {
  const { below, above } = ADAPTATION_CONFIG.cohesionRise;
  for (const club of w.clubs) {
    if (club.id === w.playerClub) continue;
    const now = cohesion(club);
    if (now >= 1) continue;
    club.cohesion = round4(Math.min(1, now + (now < 0.8 ? below : above)));
  }
}
/** A club nobody owns names a new manager (→LEAGUE-12): as an own squad would (→PLAYER-13). */
export function cohesionAfterManager(club: Club, sameSchool: boolean) {
  club.cohesion = managerChangeLoss(cohesion(club), sameSchool);
}
/** A summer's change of squad costs 조직력: an investment, then a change of division (→LEAGUE-12). */
export function cohesionAfterSummer(club: Club, change: { investment: boolean; move: boolean }) {
  const { investment, move } = ADAPTATION_CONFIG.cohesionDrop;
  const drop = (change.investment ? investment : 0) + (change.move ? move : 0);
  if (!drop) return;
  club.cohesion = round4(Math.max(ADAPTATION_CONFIG.cohesionFloor, cohesion(club) - drop));
}
