import { MANAGER_GONE } from './staff-info';
export { MANAGER_GONE } from './staff-info';
import { cancelPromises } from './promises';
import { careerDate, closeEmployment, syncMentorExposures } from './person-careers';
import { onManagerChange } from './adaptation';
import type { Command, ContractTerm, Manager, Tactic, World } from '../../contracts/src/types';
import type { ManagerDeparture } from '../../contracts/src/manager-history';
import { captureManagerChange } from './manager-history-capture';
import { addEvent } from './events';
import { clubOf } from './player-state';
import { makeManager, tacticLabel, TACTICS } from './world';
import { quote } from './quotes';
import { clamp, random, ratio } from './primitives';
import {
  checkTerm,
  fillDelegatedPost,
  hireStaff,
  MANAGER_TRAIT_INFO,
  releaseCost,
  releaseStaff,
  renewStaff,
  STAFF_ROLES,
  staffQuote,
  withTerm,
} from './staff';
import { coachSeason, MANAGER_CAREER } from './coaching';
import { pushInbox, readRelated } from './inbox';
import { FIREFIGHTER_ARRIVAL_MORALE, managerStyleEffects, managerTerm, STYLE_INFO } from './styles';
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
import { coachDelegated, managerCriteriaOf } from './hiring';
import { directionLine, setDirection } from './direction';
import { debit } from './transactions';
import { moneyLabel } from './finance';
import { INTERVENTION_LEVELS } from './intervention';
import { isDelegated } from './responsibilities';
import { orderTraining } from './coach-training';
import { legacySettings } from './responsibilities';

/** Managers and their tactical requests, coaches, delegation and the staff's criteria. */
export type StaffCommand = Extract<
  Command,
  {
    type:
      | 'hire'
      | 'renew-manager'
      | 'tactics'
      | 'accept-condition'
      | 'hire-staff'
      | 'release-staff'
      | 'renew-staff'
      | 'intervention'
      | 'coach-training'
      | 'direction';
  }
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
  w.manager = withTerm(
    { ...manager, trust: 65, conflicts: 0, since: w.year, until: w.year + term },
    chosen,
  );
  // A new tenure; the one he replaces, an interim's included, ends today (→HIST-18).
  captureManagerChange(w, w.manager);
  // The squad starts to learn its new manager (→PLAYER-13).
  onManagerChange(w, before, w.manager);
  syncMentorExposures(w);
  w.tactic = manager.philosophy;
  delete w.requested;
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

const requestTones = { respect: 12, evidence: 16, support: 8, demand: -25 } as const;

function validateTacticRequest(tactic: Tactic, tone: string) {
  if (!TACTICS.includes(tactic) || !Object.hasOwn(requestTones, tone))
    throw new Error('전술 요청을 확인하세요.');
}

/** Shared response calculation excludes only the unchanged seeded ±6 noise. */
function requestScoreBase(w: World, tactic: Tactic, tone: string) {
  const m = w.manager;
  return (
    m.flexibility * 0.45 +
    m.trust * 0.55 +
    requestTones[tone as keyof typeof requestTones] -
    (tactic === m.philosophy ? 0 : 24) -
    m.pride * (tone === 'demand' ? 0.3 : 0.05) -
    m.conflicts * 5 +
    managerStyleEffects(w).requestBonus
  );
}

function responseLabel(score: number) {
  return score >= 65
    ? '수락'
    : score >= 50
      ? '마지못해 수락'
      : score >= 30
        ? '조건부 수락'
        : '거절';
}

export function tacticRequestOutlook(w: World, tactic: Tactic, tone: string) {
  validateTacticRequest(tactic, tone);
  const base = requestScoreBase(w, tactic, tone),
    min = base - 6,
    max = base + 6,
    low = responseLabel(min),
    high = responseLabel(max),
    history = w.manager.requestHistory;
  const trustAfterDemand = clamp(w.manager.trust - (tone === 'demand' ? 18 : 0));
  const resignationRisk =
    w.manager.pride >= 75 &&
    trustAfterDemand <= 25 &&
    (w.manager.conflicts >= 2 || tone === 'demand');
  return {
    label: resignationRisk ? '사직 위험' : low === high ? low : `${low} ~ ${high}`,
    min,
    max,
    trustRisk: tone === 'demand' ? 18 : min < 30 ? 4 : min < 65 && max >= 50 ? 3 : 0,
    alreadyAnswered:
      history?.at === `${w.year}:${w.round}` && history.keys.includes(`${tactic}:${tone}`),
  };
}

function currentRequestHistory(w: World) {
  const at = `${w.year}:${w.round}`;
  if (w.manager.requestHistory?.at !== at)
    w.manager.requestHistory = { at, keys: [], trustAwarded: false };
  return w.manager.requestHistory;
}

function awardRequestTrust(w: World, amount: number) {
  const history = currentRequestHistory(w);
  if (history.trustAwarded) return;
  w.manager.trust = clamp(w.manager.trust + amount);
  history.trustAwarded = true;
}

/**
 * The floor of the owner's trust (→STAFF-47): at `warn` or less a manager may resign each settled
 * league round, with `chance`, or `zeroChance` at trust 0.
 */
export const TRUST_FLOOR_CONFIG = { warn: 10, chance: 0.1, zeroChance: 0.25 } as const;
const TRUST_COLLAPSE = '구단주와의 신뢰가 무너져 사임했습니다.';

/**
 * Once per settled league round (→STAFF-47): the first round a manager is at the floor warns the
 * owner without a draw, so he can back him first (→CLUB-20); later rounds draw his resignation
 * from a stream of his own, so matches and other draws stay put. Interims never resign this way.
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
        '공개 신임(감독 재신임 발표)이 신뢰를 되살릴 수 있어요',
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
  delete w.manager.lastRequest;
  delete w.manager.requestHistory;
  delete w.manager.pending;
  delete w.requested;
}
export function staffCommand(w: World, cmd: StaffCommand) {
  switch (cmd.type) {
    case 'hire-staff':
      hireStaff(w, cmd.role, cmd.candidate, cmd.term, cmd.candidateId);
      break;
    case 'release-staff':
      // Delegation stays as the level sets it: a delegated department refills the post by 코치
      // 기조 on the daily look (→STAFF-13, STAFF-15).
      releaseStaff(w, cmd.role);
      break;
    case 'direction':
      setDirection(w, cmd.key, cmd.option);
      // A new 코치 기조 acts at once on a vacancy or a volunteer's post (→STAFF-15).
      if (cmd.key === 'coaches')
        for (const role of STAFF_ROLES) if (coachDelegated(w, role)) fillDelegatedPost(w, role);
      break;
    case 'renew-staff':
      renewStaff(w, cmd.role, cmd.term);
      break;
    case 'renew-manager':
      renewManager(w, cmd.term);
      break;
    case 'coach-training':
      orderTraining(w, cmd.coach, cmd.focus, !!cmd.force, cmd.player);
      break;
    case 'intervention':
      if (!INTERVENTION_LEVELS.includes(cmd.level)) throw new Error('개입 수준을 확인하세요.');
      w.intervention = cmd.level;
      w.settings = legacySettings(cmd.level);
      // A department handed to the staff has its vacancy or volunteer's post filled at once.
      for (const role of STAFF_ROLES) if (coachDelegated(w, role)) fillDelegatedPost(w, role);
      break;
    case 'tactics': {
      validateTacticRequest(cmd.tactic, cmd.tone);
      const m = w.manager,
        key = `${cmd.tactic}:${cmd.tone}`,
        history = currentRequestHistory(w);
      if (history.keys.includes(key)) throw new Error('동일한 요청에 이번 라운드 이미 답했습니다.');
      history.keys.push(key);
      m.lastRequest = key;
      w.requested = cmd.tactic;
      delete m.pending;
      const noise = random(`${w.seed}:request:${w.year}:${w.round}:${m.id}:${key}`)() * 12 - 6;
      const score = requestScoreBase(w, cmd.tactic, cmd.tone) + noise;
      if (cmd.tone === 'demand') {
        m.trust = clamp(m.trust - 18);
        m.conflicts++;
      }
      if (m.pride >= 75 && m.trust <= 25 && (m.conflicts >= 2 || cmd.tone === 'demand')) {
        addEvent(
          w,
          'manager-response',
          '감독의 사직서',
          '제 판단을 존중받을 수 없다면 함께할 수 없습니다.',
        );
        resign(w, '구단주의 강한 전술 간섭', 'resigned');
        break;
      }
      let response: string;
      if (score >= 65) {
        w.tactic = cmd.tactic;
        awardRequestTrust(w, 2);
        response = '수락했습니다. 선수들과 새로운 방향을 준비하겠습니다.';
      } else if (score >= 50) {
        w.tactic = cmd.tactic;
        m.trust = clamp(m.trust - 3);
        response = '마음에 들지는 않지만 시도하겠습니다. 결과를 함께 봅시다.';
      } else if (score >= 30) {
        m.pending = cmd.tactic;
        response = '조건부 수락입니다. 훈련 지원금이 확보되면 전환하겠습니다.';
      } else {
        m.trust = clamp(m.trust - 4);
        m.conflicts++;
        response = '거절합니다. 현재 선수단과 제 철학에는 맞지 않습니다.';
      }
      addEvent(
        w,
        'manager-response',
        `${m.name}의 답변`,
        `${tacticLabel[cmd.tactic]} 요청 · ${response}`,
      );
      break;
    }
    case 'accept-condition': {
      if (!w.manager.pending) throw new Error('대기 중인 조건이 없습니다.');
      const cost = quote(clubOf(w).country, w.year, 30);
      debit(w, cost);
      w.tactic = w.manager.pending;
      delete w.manager.pending;
      awardRequestTrust(w, 3);
      addEvent(w, 'training', '훈련 지원과 전술 전환', tacticLabel[w.tactic], cost);
      break;
    }
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
