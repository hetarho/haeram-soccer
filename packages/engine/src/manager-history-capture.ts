/**
 * The live world's adapter to the manager-history facts (→HIST-18/19, SAVE-24): it reads the world
 * at the engine's settlement points and hands T304's pure operations (`manager-history.ts`) the
 * identity, date and source they need, storing the facts they return. Tenure and source policy
 * stays there. A world without facts is a career not yet tracked: every hook leaves it as it is,
 * so missing attribution stays absent. Nothing here draws, pays or changes a result.
 */
import {
  currentManagerTenure,
  managerHistoryDateKey,
  type ManagerDeparture,
  type ManagerHistoryFacts,
  type ManagerHistoryIdentity,
  type ManagerOutcomeSource,
} from '../../contracts/src/manager-history';
import type { CareerDate, Manager, MatchRecord, World } from '../../contracts/src/types';
import {
  attributeManagerMatch,
  attributeManagerOutcome,
  createManagerHistoryFacts,
  recordManagerTenureChange,
} from './manager-history';
import { careerDate } from './person-careers';
import { clubOf } from './world';

/**
 * Who a tenure names. `since`, his known first season, is kept only where the appointment itself
 * was not seen (`knownSince`); an appointment recorded here has its exact date instead.
 */
const identityOf = (m: Manager, since?: number): ManagerHistoryIdentity => ({
  id: m.id,
  name: m.name,
  interim: m.interim,
  ...(m.person ? { person: m.person } : {}),
  ...(since !== undefined ? { since } : {}),
});

/**
 * The world's facts, created when absent: tracked from the founding when the world stands on its
 * founding day with nothing settled (the founding manager appointed then), else from today as an
 * activation, keeping the manager's known first season without presenting today as his
 * appointment. The boundary names the world's current revision; callers own any revision move.
 */
export function ensureManagerHistory(w: World): ManagerHistoryFacts {
  if (w.managerHistory) return w.managerHistory;
  const at = careerDate(w);
  const founding =
    w.history.length === 0 && w.ownMatches.length === 0 && w.round === 0 && at.day === 0;
  // A service year after today is no known earlier year: it is left out, never moved.
  const since = w.manager.since <= at.year ? w.manager.since : undefined;
  return (w.managerHistory = createManagerHistoryFacts({
    club: w.playerClub,
    at: { ...at, revision: w.revision },
    coverage: founding ? 'founding' : 'activation',
    manager: identityOf(w.manager, since),
  }));
}

/**
 * Today, when it precedes none of `floors` (the facts' latest change or outcome): a settlement
 * point the facts can take. Day by day it always does; a hook never stops a season over it.
 */
function settlementDate(w: World, ...floors: (CareerDate | undefined)[]) {
  const at = careerDate(w);
  return floors.every(
    (floor) => !floor || managerHistoryDateKey(at) >= managerHistoryDateKey(floor),
  )
    ? at
    : undefined;
}

/**
 * `manager` now in charge (→STAFF-7/17/18): a new tenure on today's date, the one he replaces
 * closed with `departure` (an appointment replaces by default). A renewal or a tactic change is no
 * call here: it continues the tenure. Each call is one actual appointment, so its key names the
 * manager, the day and the tenure it opens: the same manager reappointed later, even on the same
 * day, is a new tenure (→HIST-18).
 */
export function captureManagerChange(w: World, manager: Manager, departure?: ManagerDeparture) {
  const facts = w.managerHistory;
  if (!facts) return;
  const last = facts.tenures.at(-1)!;
  const at = settlementDate(w, last.ended ?? last.trackedFrom, facts.outcomes.at(-1)?.at);
  if (!at) return;
  w.managerHistory = recordManagerTenureChange(facts, {
    kind: 'appointment',
    key: `${manager.id}@${at.year}:${at.day}#${facts.serial + 1}`,
    at,
    manager: identityOf(manager),
    ...(departure ? { departure } : {}),
  });
}

/**
 * The own record about to be kept, with the tenure in charge frozen on it (→HIST-18): once, when it
 * settles, so a reload or a later appointment never moves it. Unchanged without facts.
 */
export function attributeOwnMatch(w: World, record: MatchRecord): MatchRecord {
  const facts = w.managerHistory,
    current = facts && currentManagerTenure(facts);
  if (!facts || !current) return record;
  const at = settlementDate(w, current.trackedFrom);
  if (!at || at.year !== record.year) return record;
  return attributeManagerMatch(facts, record, { at });
}

/** One finalised outcome credited to the tenure in charge when it settles, at most once. */
function captureOutcome(w: World, source: ManagerOutcomeSource) {
  const facts = w.managerHistory,
    current = facts && currentManagerTenure(facts);
  if (!facts || !current) return;
  const at = settlementDate(w, current.trackedFrom, facts.outcomes.at(-1)?.at);
  if (at) w.managerHistory = attributeManagerOutcome(facts, source, { at });
}

/**
 * A cup the own club won, when its final is decided (→HIST-19): `competition` is the season
 * archive's key, `cup` for the domestic cup and the tournament key for a continental one, the
 * Super Cup included whatever its prize or news.
 */
export function captureCupTitle(w: World, competition: string) {
  captureOutcome(w, { kind: 'cup-title', year: w.year, competition });
}

/**
 * The season close's settled league facts (→HIST-19), before any departure at the close: the final
 * finish in the division and group the season was played in, and a promotion when the club
 * actually moved up a tier. A move between groups of one tier is no promotion.
 */
export function captureSeasonClose(w: World, played: { tier: number; group: number }) {
  const club = clubOf(w),
    from = { country: club.country, tier: played.tier, group: played.group };
  captureOutcome(w, { kind: 'league-finish', year: w.year, ...from });
  if (club.tier < played.tier)
    captureOutcome(w, {
      kind: 'promotion',
      year: w.year,
      club: club.id,
      from,
      to: { country: club.country, tier: club.tier, group: club.group },
    });
}
