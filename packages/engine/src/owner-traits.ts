/**
 * The owner's traits where they act (→OWNER-5): each accessor gives its `OWNER_TRAITS` setting
 * while the owner holds the trait and the neutral value otherwise, so a career without an owner
 * plays exactly as before. 성공한 사업가, 팬들의 친구 and 정치력 act in the owner's economy and 팬
 * 민심. A leaf: it imports only contracts and settings, so the UI may read it (→ARCH-4).
 */
import type { OwnerTrait, World } from '../../contracts/src/types';
import { OWNER_TRAITS } from './owner-config';

type Owned = Pick<World, 'owner'>;
/** The top of the ability scale a candidate's boost stops at. */
const MAX_ABILITY = 99;

/** Whether the owner took this trait at the start; never without an owner. */
export function hasTrait(w: Owned, trait: OwnerTrait): boolean {
  return w.owner?.traits.includes(trait) ?? false;
}

/** 승리의 부적: points on the own club's match strength, OVR scale (→OWNER-6, MATCH-2). */
export function talismanStrength(w: Owned): number {
  return hasTrait(w, 'talisman') ? OWNER_TRAITS.talisman.strength : 0;
}

/** 협상의 달인: the factor on an own player's wage demand in a contract talk (→CLUB-26). */
export function wageDemandFactor(w: Owned): number {
  return hasTrait(w, 'negotiator') ? OWNER_TRAITS.negotiator.wages : 1;
}
/** 협상의 달인: the factor on the transfer fee a selling club asks the own club (→CLUB-14). */
export function askedFeeFactor(w: Owned): number {
  return hasTrait(w, 'negotiator') ? OWNER_TRAITS.negotiator.fees : 1;
}

/** 마당발: candidates added to the manager and coach candidate lists (→STAFF-15, STAFF-17). */
export function networkCandidates(w: Owned): number {
  return hasTrait(w, 'networker') ? OWNER_TRAITS.networker.candidates : 0;
}
/** 마당발: ability added to every candidate those lists draw. */
export function networkAbility(w: Owned): number {
  return hasTrait(w, 'networker') ? OWNER_TRAITS.networker.ability : 0;
}
/**
 * A candidate drawn for the own club with 마당발's ability on top: the wage he was drawn with stays,
 * and his potential is never below his ability. Unchanged without the trait.
 */
export function networkedCandidate<T extends { ability: number; potential?: number }>(
  w: Owned,
  candidate: T,
): T {
  const boost = networkAbility(w);
  if (!boost) return candidate;
  const ability = Math.min(MAX_ABILITY, candidate.ability + boost);
  return { ...candidate, ability, potential: Math.max(ability, candidate.potential ?? ability) };
}

/** 원석 감별사: potential added to every academy prospect at the intake (→CLUB-16). */
export function intakePotential(w: Owned): number {
  return hasTrait(w, 'talentSpotter') ? OWNER_TRAITS.talentSpotter.potential : 0;
}
/** 원석 감별사: the factor on how wide another club's player's grades read (→PLAYER-18). */
export function scoutRangeScale(w: Owned): number {
  return hasTrait(w, 'talentSpotter') ? OWNER_TRAITS.talentSpotter.scoutRange : 1;
}

/** 마케팅 귀재: the factor on every sponsor offer (→ECON-8). */
export function sponsorFactor(w: Owned): number {
  return hasTrait(w, 'marketer') ? OWNER_TRAITS.marketer.sponsor : 1;
}
