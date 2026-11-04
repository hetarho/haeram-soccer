import { message as sourceMessage } from '../../contracts/src/messages';
import { MANAGER_GONE } from './staff-info';
export { MANAGER_GONE } from './staff-info';
import { cancelPromises } from './promises';
import { careerDate, closeEmployment, syncMentorExposures } from './person-careers';
import { onManagerChange } from './adaptation';
import type { Command, ContractTerm, Manager, World } from '../../contracts/src/types';
import type { ManagerDeparture } from '../../contracts/src/manager-history';
import { captureManagerChange } from './manager-history-capture';
import { addEvent } from './events';
import { clubOf } from './player-state';
import { makeManager, tacticLabel } from './world';
import { clamp, random, ratio } from './primitives';
import {
  checkTerm,
  hireStaff,
  MANAGER_TRAIT_INFO,
  releaseCost,
  releaseStaff,
  renewStaff,
  staffQuote,
  withTerm,
} from './staff';
import { coachSeason, MANAGER_CAREER } from './coaching';
import { pushInbox, readRelated } from './inbox';
import { FIREFIGHTER_ARRIVAL_MORALE, managerTerm, STYLE_INFO } from './styles';
import {
  bestFreeAgent,
  managerCandidates,
  managerHireCost,
  managerMatches,
  managerSearchReason,
  takeManager,
  type ManagerCandidate,
} from './managerMarket';
import { MORALE_START } from './morale';
import { managerCriteriaOf } from './hiring';
import { directionLine } from './direction';
import { debit } from './transactions';
import { moneyLabel } from './finance';
import { isDelegated } from './responsibilities';

/** Managers, coaches and delegation. */
export type StaffCommand = Extract<
  Command,
  { type: 'hire' | 'renew-manager' | 'hire-staff' | 'release-staff' | 'renew-staff' }
>;

/** "1951/52": the season whose close ends a contract that runs `until` that year. */
export function contractSeason(until: number) {
  return `${until - 1}/${String(until).slice(2)}`;
}
/**
 * The most seasons a manager may sign for from the season starting `start` (→STAFF-14): five, the
 * firefighter one, and never past his 70th year; older saves without an age have no age cap.
 */
export function managerTermLimit(m: Pick<Manager, 'style' | 'born'>, start: number) {
  const most = managerTerm(m) === 1 ? 1 : 5;
  return m.born === undefined ? most : Math.min(most, m.born + MANAGER_CAREER.retire - start);
}
/** The term a manager signs for when the owner names none: his school's length, within the limit. */
export function defaultManagerTerm(m: Pick<Manager, 'style' | 'born'>, start: number) {
  return Math.max(1, Math.min(managerTerm(m), managerTermLimit(m, start))) as ContractTerm;
}
/**
 * What replacing the manager today pays him: 25% of his annual wage for each season left on his
 * contract (→STAFF-11); an interim leaves freely.
 */
export function managerPayoff(w: World) {
  return w.manager.interim ? '0' : releaseCost(w, w.manager);
}
function termRefusal(m: Pick<Manager, 'style'>) {
  return managerTerm(m) === 1
    ? sourceMessage('copy.ops_staff.4517d9bc89')
    : sourceMessage('copy.ops_staff.8d560369b3');
}
/**
 * Terms for keeping the manager `term` more seasons (one when absent): the going wage, quote(120 +
 * ability) on the football index and fixed for the term, and a 10% signing fee. Only a contract
 * that ends at this season's close can be renewed, never an interim's or past his 70th year.
 */
export function managerRenewal(w: World, term?: ContractTerm) {
  const m = w.manager;
  if (m.interim || m.until > w.year + 1) return undefined;
  const start = Math.max(m.until, w.year + 1),
    limit = managerTermLimit(m, start);
  if (limit < 1) return undefined;
  const wage = staffQuote(w, 120 + m.ability);
  return { wage, fee: ratio(wage, 1n, 10n), until: start + (term ?? 1), limit };
}
/** Extends the manager's contract by `term` seasons; delegated staff pay the fee as a planned cost. */
export function renewManager(w: World, term?: ContractTerm, delegated = false) {
  checkTerm(term);
  const terms = managerRenewal(w, term);
  if (!terms) throw new Error(sourceMessage('copy.ops_staff.2628bc7495'));
  if (term !== undefined && term > terms.limit) throw new Error(termRefusal(w.manager));
  debit(w, terms.fee, delegated);
  w.manager = withTerm(
    { ...w.manager, wage: terms.wage, until: terms.until },
    delegated ? undefined : term,
  );
  readRelated(w, w.manager.id);
  addEvent(
    w,
    'manager-renew',
    sourceMessage('copy.finance.ddb2236cce'),
    sourceMessage('copy.ops_staff.2098553516', {
      p0: w.manager.name,
      p1: contractSeason(terms.until),
    }),
    terms.fee,
  );
  return terms;
}
/**
 * Puts a market candidate in charge for `term` seasons at the wage he asked, fixed for the term:
 * he leaves the market, the manager he replaces joins it (→STAFF-17) and his philosophy becomes
 * the tactic. `chosen` is the term the owner picked, kept with the contract.
 */
function installManager(
  w: World,
  candidate: ManagerCandidate,
  term: ContractTerm,
  chosen?: ContractTerm,
) {
  const {
    fee: _fee,
    source: _source,
    club: _club,
    compensation: _compensation,
    coachingRelease: _coachingRelease,
    ...manager
  } = candidate;
  void _fee;
  void _source;
  void _club;
  void _compensation;
  void _coachingRelease;
  readRelated(w, w.manager.id);
  takeManager(w, candidate, w.manager);
  const before = w.manager;
  w.manager = withTerm({ ...manager, trust: 65, since: w.year, until: w.year + term }, chosen);
  // A new tenure; the one he replaces, an interim's included, ends today (→HIST-18).
  captureManagerChange(w, w.manager);
  // The squad starts to learn its new manager (→PLAYER-13).
  onManagerChange(w, before, w.manager);
  syncMentorExposures(w);
  w.tactic = manager.philosophy;
  delete w.critical;
  // A firefighter's arrival lifts the dressing room at once.
  if (manager.style === 'firefighter')
    w.morale = Math.round(clamp((w.morale ?? MORALE_START) + FIREFIGHTER_ARRIVAL_MORALE));
  return manager;
}
/** " · 유망주 중용" for a manager with a selection trait. */
const traitNote = (m: Pick<Manager, 'trait'>) =>
  m.trait ? ` · ${MANAGER_TRAIT_INFO[m.trait].label}` : '';
/**
 * With the manager post delegated the staff fill a vacancy (→STAFF-18): the first match by the
 * owner's criteria for the criteria's term (the firefighter one, never past his 70th year), a
 * poached manager through the market so his club takes compensation and names a successor; with
 * none, 가장 나은 후보 takes the best affordable free agent, and 기다림 keeps the interim in charge
 * without stopping the clock, reported once while the staff look again daily.
 */
export function appointDelegatedManager(w: World) {
  const c = managerCriteriaOf(w),
    match = managerMatches(w)[0],
    pick = match ?? (c.whenNone === 'best' ? bestFreeAgent(w) : undefined);
  if (!pick) {
    reportManagerWait(w);
    return undefined;
  }
  const term = Math.min(c.term, managerTermLimit(pick, w.year)) as ContractTerm,
    cost = managerHireCost(pick).toString(),
    club = pick.club ? w.clubs.find((other) => other.id === pick.club)?.name : undefined;
  debit(w, cost, true);
  const manager = installManager(w, pick, term),
    school = STYLE_INFO[manager.style].label,
    ends = contractSeason(w.year + term);
  addEvent(
    w,
    'manager-hire',
    sourceMessage('copy.ops_staff.ba7d8bb916', { p0: manager.name }),
    sourceMessage('copy.ops_staff.6f85fa9bf8', {
      p0: club ? sourceMessage('copy.ops_staff.bd24ddbe15', { p0: club }) : '',
      p1: school,
      p2: tacticLabel[manager.philosophy],
      p3: traitNote(manager),
      p4: ends,
    }),
    cost,
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.ops_staff.5e6e13d3ea', { p0: school, p1: manager.name }),
    detail: [
      sourceMessage('copy.ops_staff.ad9572163a', {
        p0: match
          ? sourceMessage('copy.ops_staff.12466ea4e6')
          : sourceMessage('copy.ops_staff.3630736524'),
        p1: club
          ? sourceMessage('copy.ops_staff.0188f795bb', { p0: club })
          : sourceMessage('copy.ops_staff.f32e03025e'),
        p2: term,
      }),
      `OVR ${manager.ability}`,
      sourceMessage('copy.ScoutShortlist.572ddadbfc', { p0: moneyLabel(w, manager.wage) }),
      sourceMessage('copy.ops_staff.612034e799', { p0: moneyLabel(w, pick.fee) }),
      ...(pick.compensation
        ? [sourceMessage('copy.ops_staff.1024b0eddb', { p0: moneyLabel(w, pick.compensation) })]
        : []),
      sourceMessage('copy.ops_staff.feb2376490', { p0: ends }),
      directionLine(w, 'school'),
      directionLine(w, 'manager'),
    ]
      .join(' · ')
      .slice(0, 400),
    attention: false,
  });
  return manager;
}
/** Once per interim: nobody to appoint, so the interim carries on (→STAFF-18). */
function reportManagerWait(w: World) {
  const interim = w.manager.id;
  if (w.inbox?.some((item) => item.ref === interim)) return;
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.ops_staff.d87a7829d1'),
    detail: [
      managerSearchReason(w),
      directionLine(w, 'school'),
      directionLine(w, 'manager'),
      sourceMessage('copy.ops_staff.8901240968'),
    ]
      .join(' · ')
      .slice(0, 400),
    attention: true,
    ref: interim,
  });
}
/** The blocking alert a departure raises; the app offers hiring or carrying on with the interim. */
/**
 * The manager leaves and a basic interim steps in (→STAFF-7). With the post delegated the staff
 * appoint a successor by the owner's criteria at once and the clock runs on; when nobody fits the
 * interim stays, the owner is told and the staff keep looking. Otherwise the departure stops the
 * clock. `departure` is why his tenure ends, recorded with the interim's (→HIST-18).
 */
function resign(w: World, reason: string, departure: ManagerDeparture) {
  const old = w.manager;
  cancelPromises(w, old.id, reason);
  if (old.person) closeEmployment(w, old.person, 'manager');
  // His renewal reminder is moot once he has gone.
  readRelated(w, old.id);
  addEvent(
    w,
    'manager-departure',
    sourceMessage('copy.ops_staff.1ef8ab17e1', { p0: old.name }),
    `${old.since}–${w.year} · ${reason}`,
  );
  // Counting this departure keeps two caretakers on the same day apart.
  const departures = w.events.filter((event) => event.kind === 'manager-departure').length;
  const interim = makeManager(
    clubOf(w).country,
    `${w.seed}:interim:${w.year}:${careerDate(w).day}:${departures}`,
    w.year,
    99,
  );
  interim.ability = 35;
  // A caretaker steps in for now; he is not a bet on the future.
  interim.potential = 35;
  interim.youth = 30;
  interim.wage = staffQuote(w, 40);
  interim.interim = true;
  w.manager = interim;
  // The interim's tenure is recorded even if a successor follows at once without a match.
  captureManagerChange(w, interim, departure);
  onManagerChange(w, old, interim);
  syncMentorExposures(w);
  if (!isDelegated(w, 'manager')) {
    w.critical = MANAGER_GONE;
    return;
  }
  appointDelegatedManager(w);
}

/**
 * The floor of the owner's trust (→STAFF-47): at `warn` or less a manager may resign each settled
 * league round, with `chance`, or `zeroChance` at trust 0.
 */
export const TRUST_FLOOR_CONFIG = { warn: 10, chance: 0.1, zeroChance: 0.25 } as const;
const TRUST_COLLAPSE = sourceMessage('copy.ops_staff.1caf0d4a92');

/**
 * Once per settled league round (→STAFF-47): the first round a manager is at the floor warns the
 * owner without a draw; later rounds draw his resignation from a stream of his own, so matches
 * and other draws stay put. Interims never resign this way.
 */
export function settleManagerTrust(w: World) {
  const m = w.manager;
  // Recovering above the floor lifts the warning; a later fall warns again.
  if (m.trust > TRUST_FLOOR_CONFIG.warn) {
    delete m.trustWarned;
    return;
  }
  if (m.interim) return;
  if (!m.trustWarned) {
    m.trustWarned = true;
    addEvent(
      w,
      'manager-trust-warning',
      sourceMessage('copy.ops_staff.816e053b3e', { p0: m.name }),
      sourceMessage('copy.ops_staff.787bae4090', { p0: m.trust }),
    );
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.ops_staff.9969ee0134', { p0: m.name }),
      detail: [
        sourceMessage('copy.ops_staff.649ed6929c', { p0: m.trust }),
        sourceMessage('copy.ops_staff.997b4d159b'),
      ].join(' · '),
      attention: true,
      ref: m.id,
    });
    return;
  }
  const odds = m.trust === 0 ? TRUST_FLOOR_CONFIG.zeroChance : TRUST_FLOOR_CONFIG.chance;
  if (random(`${w.seed}:trust-floor:${m.id}:${w.year}:${w.round}`)() < odds)
    resign(w, TRUST_COLLAPSE, 'resigned');
}

/** Season boundary for the manager: a season of growth or fading, retirement and his contract. */
export function yearlyStaff(w: World) {
  const m = w.manager,
    age = m.born === undefined ? undefined : w.year - m.born;
  // A season of learning or, past 60, of fading (→STAFF-16); older saves keep their level.
  if (age !== undefined && m.potential !== undefined && !m.interim) {
    const next = coachSeason(
      `${w.seed}:manager-growth:${m.id}:${w.year}`,
      m.ability,
      m.potential,
      age,
    );
    if (next.ability !== m.ability)
      addEvent(
        w,
        'manager-growth',
        sourceMessage('copy.ops_staff.f6683ec2e5', {
          p0: m.name,
          p1:
            next.ability > m.ability
              ? sourceMessage('team.column.growth')
              : sourceMessage('copy.ops_staff.ce2cc8c95a'),
        }),
        sourceMessage('copy.ops_staff.b46b52928a', {
          p0: age,
          p1: m.ability,
          p2: next.ability,
          p3: next.potential,
        }),
      );
    m.ability = next.ability;
    m.potential = next.potential;
    if (m.person && w.people?.[m.person]?.management)
      Object.assign(w.people[m.person].management!, next);
  }
  // A manager still at trust 0 leaves before retirement, expiry or renewal (→STAFF-47).
  if (!m.interim && m.trust === 0) resign(w, TRUST_COLLAPSE, 'resigned');
  else if (
    !m.interim &&
    (age !== undefined ? age >= MANAGER_CAREER.retire : m.since + 25 <= w.year)
  )
    resign(w, sourceMessage('copy.ops_staff.91648c3b7d'), 'retired');
  // No manager renews himself (→STAFF-14): an unrenewed contract ends at the close.
  else if (m.until <= w.year && !m.interim)
    resign(
      w,
      managerTerm(m) === 1
        ? sourceMessage('copy.ops_staff.dd7292cb64')
        : sourceMessage('copy.ops_staff.0e3349a2cf'),
      'expired',
    );
}
export function staffCommand(w: World, cmd: StaffCommand) {
  switch (cmd.type) {
    case 'hire-staff':
      hireStaff(w, cmd.role, cmd.candidate, cmd.term, cmd.candidateId);
      break;
    case 'release-staff':
      // Delegation stays as the settings set it: a delegated department refills the post by 코치
      // 기조 on the daily look (→STAFF-13, STAFF-15).
      releaseStaff(w, cmd.role);
      break;
    case 'renew-staff':
      renewStaff(w, cmd.role, cmd.term);
      break;
    case 'renew-manager':
      renewManager(w, cmd.term);
      break;
    case 'hire': {
      checkTerm(cmd.term);
      const candidate = managerCandidates(w).find((offer) => offer.id === cmd.id);
      if (!candidate) throw new Error(sourceMessage('copy.ops_staff.633b8b7f0b'));
      const limit = managerTermLimit(candidate, w.year);
      if (limit < 1 || (cmd.term !== undefined && cmd.term > limit))
        throw new Error(termRefusal(candidate));
      const term = cmd.term ?? defaultManagerTerm(candidate, w.year);
      // Another club also takes compensation for its manager (→STAFF-17).
      const fee = managerHireCost(candidate) + BigInt(managerPayoff(w));
      debit(w, fee.toString());
      addEvent(
        w,
        'manager-departure',
        sourceMessage('copy.ops_staff.2d935a0dbe', { p0: w.manager.name }),
        sourceMessage('copy.ops_staff.78180d8343', { p0: w.manager.since, p1: w.year }),
      );
      const manager = installManager(w, candidate, term, cmd.term);
      const club = candidate.club ? w.clubs.find((c) => c.id === candidate.club)?.name : undefined;
      addEvent(
        w,
        'manager-hire',
        sourceMessage('copy.ops_staff.ba7d8bb916', { p0: manager.name }),
        sourceMessage('copy.ops_staff.c29f9e7d96', {
          p0: club ? sourceMessage('copy.ops_staff.bd24ddbe15', { p0: club }) : '',
          p1: STYLE_INFO[manager.style].label,
          p2: tacticLabel[manager.philosophy],
          p3: traitNote(manager),
          p4: contractSeason(w.year + term),
        }),
        fee.toString(),
      );
      break;
    }
  }
}
