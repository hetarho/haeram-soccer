/**
 * 팬 민심, the supporters' standing of the owner (→OWNER-12/13), moved by the day loop's hooks: own
 * league results, each settled league round, the season close, completed transfers and a new
 * identity. Each returns at once in a career without an owner, so founding careers live exactly as
 * before.
 */
import type { MatchRecord, TransferFact, World } from '../../contracts/src/types';

/** An own league result as it settles, from `recordMatch` (→OWNER-12: results, ticket price). */
export function fanMoodAfterLeagueMatch(w: World, result: MatchRecord) {
  if (!w.owner) return;
  void result;
}

/** Each settled league round, after its settlement: the drift and 퇴진 압박 (→OWNER-12/13). */
export function fanMoodRound(w: World) {
  if (!w.owner) return;
}

/**
 * The season close, from `closeSeason` once promotion and relegation are known: titles, promotion,
 * relegation, last place and the owner's season record (→OWNER-12, OWNER-17).
 */
export function fanMoodClose(w: World) {
  if (!w.owner) return;
}

/** A completed own fee signing or sale, just recorded: a record fee or a star sale (→OWNER-12). */
export function fanMoodTransfer(w: World, fact: TransferFact) {
  if (!w.owner) return;
  void fact;
}

/** A designer draft adopted as the club's identity (→OWNER-12, KIT-9). */
export function fanMoodIdentity(w: World) {
  if (!w.owner) return;
}
