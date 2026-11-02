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
    ? '소방수 감독은 1시즌만 계약합니다.'
    : '감독과는 70세가 되는 시즌까지만 계약할 수 있습니다.';
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
  if (!terms) throw new Error('재계약할 수 있는 감독이 아닙니다.');
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
    '감독 재계약',
    `${w.manager.name} 재계약 · ${contractSeason(terms.until)} 시즌 끝까지`,
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
    `${manager.name} 감독 선임`,
    `${club ? `${club}에서 영입 · ` : ''}${school} · ${tacticLabel[manager.philosophy]}${traitNote(manager)} · 계약 ${ends} 시즌 끝까지 · 단장 선임`,
    cost,
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: `${school} ${manager.name} 감독 선임`,
    detail: [
      `${match ? '단장이 선호 학파와 감독 기조에 맞는' : '선호 학파와 감독 기조에 맞는 감독이 없어 단장이 가장 나은'} ${club ? `${club} 감독을 웃돈을 주고` : '자유계약 감독을'} ${term}시즌 계약했어요`,
      `OVR ${manager.ability}`,
      `연봉 ${moneyLabel(w, manager.wage)}`,
      `계약금 ${moneyLabel(w, pick.fee)}`,
      ...(pick.compensation ? [`웃돈 ${moneyLabel(w, pick.compensation)}`] : []),
      `${ends} 시즌 끝까지`,
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
    title: '감독 선임 대기: 감독 기조에 맞는 감독이 없어요',
    detail: [
      managerSearchReason(w),
      directionLine(w, 'school'),
      directionLine(w, 'manager'),
      '임시 감독 체제로 계속해요',
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
    `${old.name} 감독의 마지막 날`,
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
const TRUST_COLLAPSE = '구단주와의 신뢰가 무너져 사임했습니다.';

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
      `${m.name} 감독, 사임 고민`,
      `구단주 신뢰 ${m.trust} · 관계가 바닥까지 내려앉았어요`,
    );
    pushInbox(w, {
      kind: 'staff-report',
      title: `${m.name} 감독이 사임을 고민하고 있어요`,
      detail: [
        `구단주와의 신뢰가 ${m.trust}까지 떨어졌어요`,
        '이대로면 어느 라운드에든 사임할 수 있어요',
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
        `${m.name} 감독 ${next.ability > m.ability ? '성장' : '노쇠'}`,
        `${age}세 · 지도력 ${m.ability} → ${next.ability} · 잠재력 ${next.potential}`,
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
    resign(w, '긴 지도자 생활을 마치고 은퇴했습니다.', 'retired');
  // No manager renews himself (→STAFF-14): an unrenewed contract ends at the close.
  else if (m.until <= w.year && !m.interim)
    resign(
      w,
      managerTerm(m) === 1
        ? '시즌 종료까지의 단기 계약을 마치고 떠났습니다.'
        : '재계약 없이 계약 기간을 마치고 떠났습니다.',
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
      if (!candidate) throw new Error('지금 선임할 수 없는 감독입니다.');
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
        `${w.manager.name} 감독 교체`,
        `${w.manager.since}–${w.year} · 구단의 선택`,
      );
      const manager = installManager(w, candidate, term, cmd.term);
      const club = candidate.club ? w.clubs.find((c) => c.id === candidate.club)?.name : undefined;
      addEvent(
        w,
        'manager-hire',
        `${manager.name} 감독 선임`,
        `${club ? `${club}에서 영입 · ` : ''}${STYLE_INFO[manager.style].label} · ${tacticLabel[manager.philosophy]}${traitNote(manager)} · 계약 ${contractSeason(w.year + term)} 시즌 끝까지`,
        fee.toString(),
      );
      break;
    }
  }
}
