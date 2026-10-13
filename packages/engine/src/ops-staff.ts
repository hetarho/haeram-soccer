import type {
  Command,
  ContractTerm,
  Manager,
  ManagerRule,
  ManagerStyle,
  Tactic,
  World,
} from '../../contracts/src/types';
import { addEvent, clubOf, makeManager, quote, tacticLabel, TACTICS } from './world';
import { clamp, random, ratio } from './primitives';
import {
  checkTerm,
  DELEGATED_TERM,
  hireStaff,
  MANAGER_TRAIT_INFO,
  releaseCost,
  releaseStaff,
  renewStaff,
  setCoaching,
  staffQuote,
  withTerm,
} from './staff';
import { coachSeason, MANAGER_CAREER } from './coaching';
import { currentDay } from './calendar';
import { pushInbox, readRelated } from './inbox';
import { FIREFIGHTER_ARRIVAL_MORALE, managerStyleEffects, managerTerm, STYLE_INFO } from './styles';
import {
  delegatedManagerPick,
  MANAGER_RULE_INFO,
  MANAGER_RULES,
  managerCandidates,
  managerRuleOf,
  takeManager,
  type ManagerCandidate,
} from './managerMarket';
import { MORALE_START } from './morale';
import {
  coachKey,
  DELEGATION_KEYS,
  setCoachCriteria,
  setManagerCriteria,
  setTalkRule,
} from './hiring';
import { debit } from './operations';
import { moneyLabel } from './finance';

/** Managers and their tactical requests, coaches, coaching investment and delegation. */
export type StaffCommand = Extract<
  Command,
  {
    type:
      | 'hire'
      | 'renew-manager'
      | 'manager-rule'
      | 'tactics'
      | 'accept-condition'
      | 'hire-staff'
      | 'release-staff'
      | 'renew-staff'
      | 'coaching'
      | 'delegate'
      | 'hiring'
      | 'talk-rule';
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
    ...manager
  } = candidate;
  void _fee;
  void _source;
  void _club;
  void _compensation;
  readRelated(w, w.manager.id);
  takeManager(w, candidate, w.manager);
  w.manager = withTerm(
    { ...manager, trust: 65, conflicts: 0, since: w.year, until: w.year + term },
    chosen,
  );
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
 * With the manager post delegated the staff fill it (→STAFF-18): the free agent the owner's rule
 * picks among those the club can afford, for two seasons (the firefighter one, never past his 70th
 * year), reported in the inbox. Nobody affordable leaves the post as it is.
 */
export function appointDelegatedManager(w: World, departing?: ManagerStyle) {
  const pick = delegatedManagerPick(w, departing);
  if (!pick) return undefined;
  const term = Math.min(DELEGATED_TERM, managerTermLimit(pick, w.year)) as ContractTerm;
  debit(w, pick.fee, true);
  const manager = installManager(w, pick, term),
    school = STYLE_INFO[manager.style].label,
    ends = contractSeason(w.year + term);
  addEvent(
    w,
    'manager-hire',
    `${manager.name} 감독 선임`,
    `${school} · ${tacticLabel[manager.philosophy]}${traitNote(manager)} · 계약 ${ends} 시즌 끝까지 · 스태프 위임 선임`,
    pick.fee,
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: `${school} ${manager.name} 감독 선임`,
    detail: `스태프가 ${MANAGER_RULE_INFO[managerRuleOf(w)].label} 기준으로 자유계약 감독 중에서 ${term}시즌 계약했어요 · OVR ${manager.ability} · 연봉 ${moneyLabel(w, manager.wage)} · 계약금 ${moneyLabel(w, pick.fee)} · ${ends} 시즌 끝까지`,
    attention: false,
  });
  return manager;
}
/** The blocking alert a departure raises; the app offers hiring or carrying on with the interim. */
export const MANAGER_GONE = '감독이 떠났습니다. 새 감독을 선임하세요.';
/**
 * The manager leaves and a basic interim steps in (→STAFF-7). With the post delegated the staff
 * appoint a successor at once and the clock runs on; when nobody is affordable the interim stays,
 * the owner is told and the staff keep looking. Otherwise the departure stops the clock.
 */
function resign(w: World, reason: string) {
  const old = w.manager;
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
    `${w.seed}:interim:${w.year}:${currentDay(w)}:${departures}`,
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
  if (!w.delegation?.manager) {
    w.critical = MANAGER_GONE;
    return;
  }
  if (appointDelegatedManager(w, old.style)) return;
  pushInbox(w, {
    kind: 'staff-report',
    title: `${old.name} 감독이 떠나 임시 감독 체제예요`,
    detail:
      '자금 여력에 맞는 자유계약 감독이 없어 임시 감독이 팀을 맡아요. 스태프가 매일 다시 찾고, 감독 교체에서 직접 선임할 수도 있어요.',
    attention: true,
    ref: interim.id,
  });
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
  }
  if (!m.interim && (age !== undefined ? age >= MANAGER_CAREER.retire : m.since + 25 <= w.year))
    resign(w, '긴 지도자 생활을 마치고 은퇴했습니다.');
  // No manager renews himself (→STAFF-14): an unrenewed contract ends at the close.
  else if (m.until <= w.year && !m.interim)
    resign(
      w,
      managerTerm(m) === 1
        ? '시즌 종료까지의 단기 계약을 마치고 떠났습니다.'
        : '재계약 없이 계약 기간을 마치고 떠났습니다.',
    );
  delete w.manager.lastRequest;
  delete w.manager.requestHistory;
  delete w.manager.pending;
  delete w.requested;
}
/** The rule delegated staff appoint a manager by (→STAFF-18); the default 같은 학파 우선 is not stored. */
function setManagerRule(w: World, rule: ManagerRule) {
  if (!MANAGER_RULES.includes(rule)) throw new Error('감독 선임 기준을 확인하세요.');
  if (rule === 'school') delete w.managerRule;
  else w.managerRule = rule;
}
export function staffCommand(w: World, cmd: StaffCommand) {
  switch (cmd.type) {
    case 'manager-rule':
      setManagerRule(w, cmd.rule);
      break;
    case 'hire-staff':
      hireStaff(w, cmd.role, cmd.candidate, cmd.term);
      break;
    case 'release-staff': {
      releaseStaff(w, cmd.role);
      // Releasing a coach takes that department's hiring back (→STAFF-13), so the staff do not
      // refill the post at once; the other departments stay as they are.
      const key = coachKey(cmd.role);
      if (w.delegation?.[key]) w.delegation = { ...w.delegation, [key]: false };
      break;
    }
    case 'hiring':
      if (cmd.role === 'manager') setManagerCriteria(w, cmd.criteria);
      else setCoachCriteria(w, cmd.role, cmd.criteria);
      break;
    case 'talk-rule':
      setTalkRule(w, cmd.rule);
      break;
    case 'renew-staff':
      renewStaff(w, cmd.role, cmd.term);
      break;
    case 'renew-manager':
      renewManager(w, cmd.term);
      break;
    case 'coaching':
      setCoaching(w, cmd.role, cmd.level);
      break;
    case 'delegate':
      if (!DELEGATION_KEYS.includes(cmd.key) || typeof cmd.value !== 'boolean')
        throw new Error('스태프에게 맡길 결정을 확인하세요.');
      w.delegation = { ...w.delegation, [cmd.key]: cmd.value };
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
        resign(w, '구단주의 강한 전술 간섭');
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
      const fee =
        BigInt(candidate.fee) + BigInt(candidate.compensation ?? '0') + BigInt(managerPayoff(w));
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
