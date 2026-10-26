import type { Player, World } from '../../contracts/src/types';
import { buildEffects, buildOf } from './build';
import { policyEffects, policyOf } from './policy';
import { credit } from './transactions';
import { activePlayers, clubOf } from './player-state';
import { addEvent } from './events';
import { footballQuote } from './quotes';

/**
 * 지역 기반 and 글로벌 인지도 (→ECON-34): two bases, 0–100, that the 지역 and 글로벌 rows build
 * over years and that fade when the club stops investing. Results build reputation; these build
 * the club's ties to its town and its name abroad, and neither raises reputation.
 */
export const BASE_CONFIG = {
  /** Share of the gap to the target closed each settled league round. */
  rise: 0.02,
  fall: 0.01,
  /** What a short and a long summer tour add to 글로벌 인지도 at once. */
  tourReach: [0, 5, 10],
  /** Tour income in 1901 football units: a fixed fee and a share per reputation point. */
  tourFee: [0, 20, 40],
  tourPerReputation: [0, 2, 4],
  /** Fatigue a tour leaves on every player as the season starts. */
  tourFatigue: [0, 10, 20],
};

export function localBaseOf(w: Pick<World, 'localBase'>) {
  return w.localBase ?? 0;
}
export function globalReachOf(w: Pick<World, 'globalReach'>) {
  return w.globalReach ?? 0;
}
const clampBase = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100) / 100));
/** One step of a base toward its target: faster up than down (→ECON-34). */
export function stepBase(value: number, target: number, rate = 1) {
  const share = target >= value ? BASE_CONFIG.rise * rate : BASE_CONFIG.fall;
  return clampBase(value + (target - value) * share);
}

/** Each settled league round both bases move toward the targets the rows set; 0 is never stored. */
export function settleBases(w: World) {
  const { baseTargets } = policyEffects(policyOf(w));
  const local = stepBase(localBaseOf(w), baseTargets.local, buildEffects(w).localBaseRate),
    global = stepBase(globalReachOf(w), baseTargets.global);
  if (local) w.localBase = local;
  else delete w.localBase;
  if (global) w.globalReach = global;
  else delete w.globalReach;
}

/** What the bases do (→ECON-34); all neutral at 0. */
export function baseEffects(w: Pick<World, 'localBase' | 'globalReach' | 'build'>) {
  const local = localBaseOf(w),
    global = globalReachOf(w),
    youth = buildOf(w).youth;
  return {
    /** Added to home gate demand, as a share. */
    gate: local / 1000,
    /** Multiplies the 지역 후원 slot's offers, and every other slot's. */
    localSponsor: 1 + local / 200,
    globalSponsor: 1 + global / 250,
    /** Multiplies the following reputation commands (→ECON-23). */
    following: 1 + global / 100,
    /** The academy intake's potential and size, through the youth card that draws on a base. */
    intakePotential:
      youth === 'homegrown'
        ? Math.floor(local / 25)
        : youth === 'worldwide'
          ? Math.floor(global / 33)
          : 0,
    intake: youth === 'homegrown' && local >= 50 ? 1 : 0,
  };
}

/** What a tour at `tour` (0 none, 1 short, 2 long) pays and does as a season starts (→ECON-16). */
export function tourTerms(w: World, tour: number) {
  const club = clubOf(w);
  return {
    income: tour
      ? footballQuote(
          club.country,
          w.year,
          BASE_CONFIG.tourFee[tour] + BASE_CONFIG.tourPerReputation[tour] * club.reputation,
        )
      : '0',
    reach: BASE_CONFIG.tourReach[tour],
    fatigue: BASE_CONFIG.tourFatigue[tour],
  };
}

/**
 * The summer tour (→ECON-16) as a season starts: its income, the reach it adds at once and the
 * fatigue it leaves on every player. Nothing without a tour.
 */
export function seasonTour(w: World) {
  const tour = policyEffects(policyOf(w)).tour;
  if (!tour) return;
  const terms = tourTerms(w, tour);
  credit(w, terms.income);
  const reach = clampBase(globalReachOf(w) + terms.reach);
  if (reach) w.globalReach = reach;
  const tired = (p: Player) => {
    p.fatigue = Math.min(100, p.fatigue + terms.fatigue);
  };
  activePlayers(w).forEach(tired);
  addEvent(
    w,
    'tour',
    tour === 2 ? '긴 해외 투어' : '짧은 해외 투어',
    `글로벌 인지도 +${terms.reach} · 모든 선수 피로 +${terms.fatigue}`,
    terms.income,
  );
}
