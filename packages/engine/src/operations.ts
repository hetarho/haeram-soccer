import type { World, Command, MatchRecord, Sponsor, Tactic } from '../../contracts/src/types';
import {
  activePlayers,
  addEvent,
  clubOf,
  makeManager,
  makePlayer,
  overall,
  quote,
  tacticLabel,
  TACTICS,
} from './world';
import { clamp, integer, random, ratio } from './primitives';
import {
  campaignEffectiveness,
  FINANCE_CONFIG,
  seasonPrize,
  gateProjection,
  isLeagueMatch,
  matchBonus,
  operatingCosts,
  roundShare,
} from './finance';
import { setLineup } from './strategy';
import { setTrainingFocus } from './training';
import {
  hireStaff,
  MANAGER_TRAIT_INFO,
  releaseStaff,
  renewStaff,
  setCoaching,
  staffEffects,
} from './staff';
import { promoteYouth, releaseYouth } from './academy';
import { coachSeason, MANAGER_CAREER } from './coaching';
import { currentDay } from './calendar';
import { driftFans, fanIncome, MIN_FANS } from './fans';
import {
  assertTransferWindow,
  moneyLabel,
  placeBid,
  respondBid,
  setTransferStance,
} from './transfers';
import { pushInbox, readInbox, readRelated } from './inbox';
import { careOffer, outcomeText, resolveCare } from './care';
import { marketingFanGain, policyEffects, policyOf, setPolicy } from './policy';
import { FIREFIGHTER_ARRIVAL_MORALE, managerStyleEffects, managerTerm, STYLE_INFO } from './styles';
import { synergyEffects } from './synergy';
import { setBuild, buildEffects, reserveBuild } from './build';
import { managerCandidates, takeManager } from './managerMarket';
import { MORALE_START } from './morale';
import { facilityCostUnits, MAX_FACILITIES } from './facilities';
export function operatingCost(w: World) {
  return operatingCosts(w).annual;
}
export function credit(w: World, amount: string) {
  if (BigInt(amount) < 0) throw new Error('음수 수입');
  w.cash = (BigInt(w.cash) + BigInt(amount)).toString();
  w.income = (BigInt(w.income) + BigInt(amount)).toString();
}
export function debit(w: World, amount: string, mandatory = false) {
  if (BigInt(amount) < 0) throw new Error('음수 지출');
  if (!mandatory && BigInt(w.cash) < BigInt(amount)) throw new Error('보유 자금이 부족합니다.');
  w.cash = (BigInt(w.cash) - BigInt(amount)).toString();
  w.expense = (BigInt(w.expense) + BigInt(amount)).toString();
}
export function gate(w: World, m: MatchRecord) {
  if (m.home !== w.playerClub && m.away !== w.playerClub) return;
  const bonus = matchBonus(w, m);
  if (BigInt(bonus.amount) > 0n) {
    credit(w, bonus.amount);
    addEvent(
      w,
      'match-bonus',
      `${bonus.result} 성과 수입`,
      `${m.id} · 홈·원정 동일 기준`,
      bonus.amount,
    );
  }
  if (BigInt(bonus.sponsored) > 0n) {
    credit(w, bonus.sponsored);
    addEvent(
      w,
      'sponsor-bonus',
      `${bonus.result} 후원 성과 보너스`,
      `${w.sponsor!.name} · ${m.id}`,
      bonus.sponsored,
    );
  }
  if (
    w.sponsor &&
    w.sponsor.lastPaid < w.year &&
    w.sponsor.until > w.year &&
    ['league', 'lower'].includes(m.kind)
  ) {
    const games = w.fixtures.filter(
      (f) =>
        ['league', 'lower'].includes(f.kind) &&
        (f.home === w.playerClub || f.away === w.playerClub),
    ).length;
    const amount = roundShare(sponsorAnnual(w), w.tables[w.playerClub].played, games);
    credit(w, amount);
    addEvent(
      w,
      'sponsor-payment',
      '후원 노출 대금',
      `${w.sponsor.name} · 리그 경기 ${w.tables[w.playerClub].played}/${games} · ${m.id}`,
      amount,
    );
    if (w.tables[w.playerClub].played === games) w.sponsor.lastPaid = w.year;
  }
  if (m.home !== w.playerClub) return;
  const c = clubOf(w),
    r = random(`${w.seed}:gate:${m.id}`);
  const projection = gateProjection(w, m.id);
  const attendance = Math.round(
    projection.attendanceLow + r() * (projection.attendanceHigh - projection.attendanceLow),
  );
  const scale = isLeagueMatch(m.kind) ? projection.leagueFactor : 1;
  const income = quote(c.country, w.year, attendance * projection.perFan * scale);
  credit(w, income);
  addEvent(
    w,
    'gate',
    '홈 경기의 수입',
    `관중 ${attendance}명 · 티켓과 구단 상품${scale !== 1 ? ` · 시즌 46경기 기준 ×${scale.toFixed(2)}` : ''} · ${m.id}`,
    income,
  );
  const cost = quote(
    c.country,
    w.year,
    FINANCE_CONFIG.homeMatchBaseCost + attendance * FINANCE_CONFIG.homeMatchCostPerFan,
  );
  debit(w, cost, true);
  addEvent(w, 'match-cost', '홈 경기 개최비', `관중 ${attendance}명 · ${m.id}`, cost);
}
export function sponsorAnnual(w: World) {
  if (!w.sponsor) return '0';
  return w.sponsor.kind === 'indexed'
    ? ratio(
        w.sponsor.annual,
        BigInt(Math.round(w.priceIndex * 1000000)),
        BigInt(Math.round(w.sponsor.index * 1000000)),
      )
    : w.sponsor.annual;
}
function signSponsor(w: World, offer: Sponsor) {
  w.sponsor = offer;
  addEvent(
    w,
    'sponsor-sign',
    '우리의 첫 번째 파트너',
    `${offer.name} · ${offer.kind} · 연간 ${offer.annual} · ${offer.until}년까지`,
  );
}
/** With business delegated, the commercial staff fill an empty sponsor slot with the stable offer. */
export function delegatedBusiness(w: World) {
  if (!w.delegation?.business || w.sponsor) return;
  const offer = sponsorOffers(w).find((o) => o.kind === 'stable')!;
  signSponsor(w, offer);
  pushInbox(w, {
    kind: 'finance',
    title: `운영팀이 ${offer.name}와 후원 계약을 맺었어요`,
    detail: `안정형 · 연간 ${moneyLabel(w, offer.annual)} · ${offer.until}년까지 · 리그 경기마다 나눠 들어오고, 끝나면 운영팀이 다시 계약해요.`,
    attention: false,
  });
}
/** Season start without a sponsor: the owner is told once, unless the staff handle business. */
export function sponsorReminder(w: World) {
  if (w.sponsor || w.delegation?.business) return;
  pushInbox(w, {
    kind: 'finance',
    title: '후원 계약이 비어 있어요',
    detail:
      '구단 운영에서 후원사를 고르면 리그 경기마다 후원금이 들어와요. 운영을 스태프에게 맡기면 안정형 후원을 대신 맺어요.',
    attention: true,
  });
}
/**
 * Global fan income (→ECON-23) for this league round. The season keeps one ledger entry that
 * grows each round, so a century of rounds does not fill the save.
 */
function settleFanIncome(w: World) {
  const amount = fanIncome(w);
  if (BigInt(amount) <= 0n) return;
  credit(w, amount);
  const entry = w.events.findLast(
    (event) =>
      event.kind === 'fan-income' && event.year === w.year && event.currency === w.currency,
  );
  const fans = `서포터 ${clubOf(w).fans.toLocaleString('en-US')}명 · 온라인·상품·중계`;
  if (entry) {
    entry.amount = (BigInt(entry.amount!) + BigInt(amount)).toString();
    entry.detail = fans;
  } else addEvent(w, 'fan-income', '글로벌 팬 수익', fans, amount);
}
/** Fixed-cost rounds left in cash below which the owner is warned, once per season. */
export const CASH_WARNING_ROUNDS = 13;
function cashWarning(w: World, perRound: string) {
  const cash = BigInt(w.cash),
    cost = BigInt(perRound);
  if (cash < 0n || cost <= 0n || cash >= cost * BigInt(CASH_WARNING_ROUNDS)) return;
  if (w.events.some((e) => e.year === w.year && e.kind === 'cash-warning')) return;
  const weeks = Number(cash / cost);
  addEvent(w, 'cash-warning', '운영자금 경고', `라운드 운영비 약 ${weeks}회분 남음`);
  pushInbox(w, {
    kind: 'finance',
    title: `운영자금이 약 ${weeks}주분 남았어요`,
    detail: `라운드마다 급여·운영비 ${moneyLabel(w, perRound)}가 나가요. 후원 계약, 선수 매각, 선수단 투자·마케팅 축소나 구단주 출자로 버틸 시간을 늘리세요. 잔고가 바닥난 채 ${BANKRUPTCY_ROUNDS}라운드가 지나면 구단이 파산해요.`,
    // A status, not a stop: the HUD and the warning band show it in red (→ECON-24).
    attention: false,
  });
}
export function settleSeasonPrize(w: World, rank: number, clubs: number) {
  if (w.events.some((event) => event.year === w.year && event.kind === 'season-prize')) return;
  const amount = seasonPrize(w, rank, clubs);
  if (amount === '0') return;
  credit(w, amount);
  addEvent(
    w,
    'season-prize',
    '리그 최종 순위 상금',
    `${rank}/${clubs}위 · 하위권 상금 없음`,
    amount,
  );
}
export function sponsorOffers(w: World) {
  const c = clubOf(w);
  // A commercial club negotiates bigger deals; a community club smaller ones.
  const scale = buildEffects(w).sponsor * synergyEffects(w).sponsor;
  return (['stable', 'performance', 'exclusive', 'indexed'] as const).map((kind, i) => ({
    name: `${c.name.split(' ')[0]} ${['Cooperative', 'Motors', 'Textiles', 'Foundry'][i]}`,
    kind,
    annual: quote(
      c.country,
      w.year,
      (150 + c.reputation * 5 + c.fans / 50) * [1, 0.65, 1.6, 0.9][i] * scale,
    ),
    bonus: quote(c.country, w.year, kind === 'performance' ? 220 + c.reputation * 3 : 0),
    until: w.year + (kind === 'exclusive' ? 4 : 2),
    lastPaid: w.year - 1,
    index: w.priceIndex,
  }));
}
export const CAMPAIGNS = [
  { kind: 'outreach', label: '동네와 함께', units: 25, fans: 0.08 },
  { kind: 'tickets', label: '새로운 관중', units: 50, fans: 0.12 },
  { kind: 'merchandise', label: '클럽을 입다', units: 80, fans: 0.04 },
  { kind: 'player', label: '선수의 이야기', units: 120, fans: 0.16 },
];
export function campaignOffers(w: World) {
  const income = buildEffects(w).campaignIncome;
  return CAMPAIGNS.map((c) => ({
    ...c,
    cost: quote(clubOf(w).country, w.year, c.units),
    min: quote(
      clubOf(w).country,
      w.year,
      c.units *
        0.25 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000) *
        income,
    ),
    max: quote(
      clubOf(w).country,
      w.year,
      c.units *
        1.8 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000) *
        income,
    ),
    rounds: 4,
  }));
}
export function settleRound(w: World) {
  const cost = operatingCosts(w, w.round);
  debit(w, cost.nextRound, true);
  const club = clubOf(w),
    fansGained = marketingFanGain(
      club.fans,
      policyEffects(policyOf(w)).fanGrowth * buildEffects(w).marketingFans,
    );
  // Supporters drift toward the following the club's reputation commands, without a ceiling.
  club.fans = driftFans(club.fans + fansGained, club.reputation);
  settleFanIncome(w);
  addEvent(
    w,
    'operating-cost',
    '급여와 시설 유지비',
    `선수 ${cost.payments.playerWages} · 감독 ${cost.payments.managerWage} · 시설 ${cost.payments.maintenance}${cost.payments.marketing ? ` · 마케팅 ${cost.payments.marketing}` : ''}${cost.payments.academy ? ` · 유소년 ${cost.payments.academy}` : ''} ${w.currency}${fansGained ? ` · 마케팅 팬 +${fansGained}명` : ''}`,
    cost.nextRound,
  );
  for (const c of w.campaigns) {
    c.remaining--;
    if (c.remaining > 0) continue;
    const offer = CAMPAIGNS.find((o) => o.kind === c.kind)!;
    const r = random(`${w.seed}:campaign:${c.id}`);
    const saturation = Math.max(0.2, 1 - clubOf(w).fans / 1000000);
    const fit = campaignEffectiveness(w, c.kind);
    const income = ratio(
      c.cost,
      BigInt(
        Math.round((0.25 + r() * 1.55) * fit * saturation * buildEffects(w).campaignIncome * 1000),
      ),
      1000n,
    );
    const fans = Math.round(clubOf(w).fans * offer.fans * (0.5 + r()) * fit * saturation);
    credit(w, income);
    clubOf(w).fans = Math.max(MIN_FANS, Math.round(clubOf(w).fans + fans));
    c.income = income;
    c.fans = fans;
    addEvent(
      w,
      'campaign-result',
      `${offer.label} 결과`,
      `팬 +${fans}명 · 비용 ${c.cost} · 순수익 ${BigInt(income) - BigInt(c.cost)} ${w.currency}`,
      income,
    );
  }
  w.campaigns = w.campaigns.filter((c) => c.remaining > 0);
  cashWarning(w, cost.nextRound);
  if (
    BigInt(w.cash) < 0 &&
    !w.events.some((e) => e.year === w.year && e.kind === 'budget-warning')
  ) {
    addEvent(
      w,
      'budget-warning',
      '운영자금 경고',
      '필수 비용으로 잔고가 음수가 되었습니다. 지출 조정, 매각, 명시적인 구단주 출자로 회복할 수 있습니다. 자동 지원금은 없습니다.',
    );
  }
  insolvency(w, cost.annual);
}
/** League rounds in debt before the club goes bankrupt, or debt deeper than half a year's costs. */
export const BANKRUPTCY_ROUNDS = 8;
/**
 * Debt no longer freezes the club (→ECON-24): it plays on under a red warning, and after eight
 * settled rounds in a row below zero, or at once if the debt passes half a season's fixed costs,
 * it goes bankrupt and the career ends. Getting back above zero resets the count.
 */
function insolvency(w: World, annual: string) {
  if (BigInt(w.cash) >= 0n) {
    delete w.insolvent;
    return;
  }
  w.insolvent = (w.insolvent ?? 0) + 1;
  if (w.insolvent >= BANKRUPTCY_ROUNDS || BigInt(w.cash) * 2n < -BigInt(annual)) {
    w.bankrupt = { year: w.year, round: w.round, day: currentDay(w) };
    delete w.critical;
    addEvent(
      w,
      'bankruptcy',
      `${clubOf(w).name} 파산`,
      `잔고 ${moneyLabel(w, w.cash)} · ${w.insolvent}라운드 연속 적자 · 구단이 문을 닫았어요.`,
    );
    return;
  }
  if (w.insolvent === 1)
    pushInbox(w, {
      kind: 'finance',
      title: `파산 위기 · ${BANKRUPTCY_ROUNDS}라운드 안에 흑자로 돌아오세요`,
      detail: `잔고가 ${moneyLabel(w, w.cash)}예요. 적자인 채로 ${BANKRUPTCY_ROUNDS}라운드가 정산되거나 빚이 연간 고정 지출의 절반을 넘으면 구단이 파산해 게임이 끝나요. 선수 매각, 지출 축소, 후원 계약, 구단주 출자로 흑자를 만드세요.`,
      attention: false,
    });
}
/** "1951/52": the season whose close ends a contract that runs `until` that year. */
export function contractSeason(until: number) {
  return `${until - 1}/${String(until).slice(2)}`;
}
/** The going wage a manager asks to stay, the same at the season boundary and in a renewal. */
function managerWage(w: World) {
  return quote(clubOf(w).country, w.year, 120 + w.manager.ability);
}
/**
 * Terms for keeping the manager one more season: the going wage and a 10% signing fee. Only a
 * contract that ends at this season's close can be renewed; an interim is never kept.
 */
export function managerRenewal(w: World) {
  const m = w.manager;
  if (m.interim || m.until > w.year + 1) return undefined;
  const wage = managerWage(w);
  return { wage, fee: ratio(wage, 1n, 10n), until: Math.max(m.until, w.year + 1) + 1 };
}
/** Extends the manager's contract by one season; delegated staff pay the fee as a planned cost. */
export function renewManager(w: World, delegated = false) {
  const terms = managerRenewal(w);
  if (!terms) throw new Error('재계약할 수 있는 감독이 아닙니다.');
  debit(w, terms.fee, delegated);
  w.manager.wage = terms.wage;
  w.manager.until = terms.until;
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
/** The season market; `year` reproduces an earlier season's list for negotiations in progress. */
export function transferOffers(w: World, year = w.year) {
  const roles = ['GK', 'DEF', 'MID', 'FWD'] as const;
  const profile = policyEffects(policyOf(w)).offer,
    scouting = staffEffects(w),
    build = buildEffects(w),
    synergy = synergyEffects(w);
  const count = Math.max(4, scouting.scoutCandidates + build.marketCandidates);
  return Array.from({ length: count }, (_, i) => {
    const r = random(`${w.seed}:market:${year}:${i}`);
    const p = makePlayer(
      clubOf(w).country,
      w.seed,
      `market:${year}:${i}`,
      year,
      Math.min(95, integer(r, profile.ability[0], profile.ability[1]) + build.marketAbility),
      roles[i % 4],
      integer(r, profile.age[0], profile.age[1]),
    );
    const potentialBonus =
      profile.potentialBonus +
      scouting.scoutPotential +
      build.marketPotential +
      synergy.marketPotential;
    // A ceiling is never below what the player already shows.
    p.potential = Math.max(overall(p), Math.min(99, p.potential + potentialBonus));
    return {
      player: p,
      fee: quote(
        clubOf(w).country,
        year,
        i === 0
          ? 0
          : Math.max(
              0,
              Math.round(
                ((overall(p) - 25) * 9 + (p.potential - overall(p)) * 3) *
                  profile.feeMultiplier *
                  scouting.feeMultiplier *
                  synergy.feeMultiplier,
              ),
            ),
      ),
      loanFee: quote(clubOf(w).country, year, Math.max(15, overall(p) * 1.5)),
      /** A player without a club signs outside transfer windows. */
      freeAgent: i === 0,
      available: !w.players.some((owned) => owned.id === p.id),
    };
  });
}
/** The blocking alert a departure raises; the app offers hiring or carrying on with the interim. */
export const MANAGER_GONE = '감독이 떠났습니다. 새 감독을 선임하세요.';
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
  interim.wage = quote(clubOf(w).country, w.year, 40);
  interim.interim = true;
  w.manager = interim;
  w.critical = MANAGER_GONE;
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

export function yearlyStaff(w: World) {
  if (w.sponsor && w.sponsor.until <= w.year) {
    addEvent(w, 'sponsor-end', '후원 계약 만료', w.sponsor.name);
    delete w.sponsor;
  }
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
  else if (m.until <= w.year && !m.interim) {
    // A season-long deal ends unless the owner renewed it; other contracts renew for three.
    if (managerTerm(m) === 1) resign(w, '시즌 종료까지의 단기 계약을 마치고 떠났습니다.');
    else {
      m.until = w.year + 3;
      m.wage = managerWage(w);
      addEvent(w, 'manager-renew', '감독 계약 갱신', `${m.name} · 3년`);
    }
  }
  delete w.manager.lastRequest;
  delete w.manager.requestHistory;
  delete w.manager.pending;
  delete w.requested;
}
/** Refusal for a bankrupt club: the career is over, only its records remain. */
export const BANKRUPT_MESSAGE = '구단이 파산했어요. 기록을 내보내거나 새 클럽을 창단하세요.';
export function operate(w: World, cmd: Exclude<Command, { type: 'advance' | 'season' }>) {
  if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
  const code = clubOf(w).country;
  switch (cmd.type) {
    case 'hire-staff':
      hireStaff(w, cmd.role, cmd.candidate);
      break;
    case 'release-staff':
      releaseStaff(w, cmd.role);
      // Releasing a coach takes hiring back, so delegated staff do not refill the post at once.
      if (w.delegation?.staff) w.delegation = { ...w.delegation, staff: false };
      break;
    case 'renew-staff':
      renewStaff(w, cmd.role);
      break;
    case 'renew-manager':
      renewManager(w);
      break;
    case 'coaching':
      setCoaching(w, cmd.role, cmd.level);
      break;
    case 'promote-youth':
      promoteYouth(w, cmd.id);
      break;
    case 'release-youth':
      releaseYouth(w, cmd.id);
      break;
    case 'delegate':
      w.delegation = { ...w.delegation, [cmd.key]: cmd.value };
      break;
    case 'bid':
      placeBid(w, cmd.candidate, cmd.fee, cmd.loan);
      break;
    case 'respond-bid':
      respondBid(w, cmd.id, cmd.accept);
      break;
    case 'read-inbox':
      readInbox(w, cmd.id);
      break;
    case 'lineup':
      setLineup(w, cmd.ids);
      break;
    case 'training':
      setTrainingFocus(w, cmd.focus);
      break;
    case 'policy':
      setPolicy(w, cmd.key, cmd.level);
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
    case 'care': {
      const offer = careOffer(w, cmd.kind);
      if (!offer.available) throw new Error(`${offer.label} · ${offer.reason}`);
      if (BigInt(offer.cost) > 0n) debit(w, offer.cost);
      if (BigInt(offer.income) > 0n) credit(w, offer.income);
      const outcome = resolveCare(w, cmd.kind);
      addEvent(
        w,
        `care:${cmd.kind}`,
        offer.label,
        `${offer.by} · ${outcomeText(outcome)}${offer.outcomes.length > 1 ? ` (${outcome.chance}% 결과)` : ''} · ${offer.cooldown}라운드 뒤 다시 가능`,
        BigInt(offer.cost) > 0n ? offer.cost : BigInt(offer.income) > 0n ? offer.income : undefined,
      );
      break;
    }
    case 'build':
      if (cmd.next) reserveBuild(w, cmd.build, cmd.name);
      else setBuild(w, cmd.build, cmd.name);
      break;
    case 'accept-condition': {
      if (!w.manager.pending) throw new Error('대기 중인 조건이 없습니다.');
      const cost = quote(code, w.year, 30);
      debit(w, cost);
      w.tactic = w.manager.pending;
      delete w.manager.pending;
      awardRequestTrust(w, 3);
      addEvent(w, 'training', '훈련 지원과 전술 전환', tacticLabel[w.tactic], cost);
      break;
    }
    case 'hire': {
      const candidate = managerCandidates(w).find((offer) => offer.id === cmd.id);
      if (!candidate) throw new Error('지금 선임할 수 없는 감독입니다.');
      // Replacing a contracted manager pays him a quarter of his wage; another club also takes
      // compensation for its manager (→STAFF-17).
      const fee =
        BigInt(candidate.fee) +
        BigInt(candidate.compensation ?? '0') +
        (w.manager.interim ? 0n : BigInt(ratio(w.manager.wage, 1n, 4n)));
      debit(w, fee.toString());
      addEvent(
        w,
        'manager-departure',
        `${w.manager.name} 감독 교체`,
        `${w.manager.since}–${w.year} · 구단의 선택`,
      );
      const {
        fee: _fee,
        source: _source,
        club: from,
        compensation: _compensation,
        ...manager
      } = candidate;
      void _fee;
      void _source;
      void _compensation;
      readRelated(w, w.manager.id);
      takeManager(w, candidate, w.manager);
      w.manager = {
        ...manager,
        trust: 65,
        conflicts: 0,
        since: w.year,
        until: w.year + STYLE_INFO[manager.style].term,
      };
      w.tactic = manager.philosophy;
      delete w.requested;
      delete w.critical;
      // A firefighter's arrival lifts the dressing room at once.
      if (manager.style === 'firefighter')
        w.morale = Math.round(clamp((w.morale ?? MORALE_START) + FIREFIGHTER_ARRIVAL_MORALE));
      const club = from ? w.clubs.find((c) => c.id === from)?.name : undefined;
      addEvent(
        w,
        'manager-hire',
        `${manager.name} 감독 선임`,
        `${club ? `${club}에서 영입 · ` : ''}${STYLE_INFO[manager.style].label} · ${tacticLabel[manager.philosophy]}${manager.trait ? ` · ${MANAGER_TRAIT_INFO[manager.trait].label}` : ''} · 계약 ${contractSeason(w.year + STYLE_INFO[manager.style].term)} 시즌 끝까지`,
        fee.toString(),
      );
      break;
    }
    case 'recruit': {
      const o = transferOffers(w)[cmd.candidate];
      if (!o?.available) throw new Error('이미 계약했거나 없는 선수입니다.');
      if (activePlayers(w).length >= 26) throw new Error('선수단 정원은 26명입니다.');
      assertTransferWindow(w, o.freeAgent && !cmd.loan);
      const cost = cmd.loan ? o.loanFee : o.fee;
      debit(w, cost);
      if (cmd.loan) o.player.loanUntil = w.year + 1;
      w.players.push(o.player);
      addEvent(
        w,
        'transfer-in',
        `${o.player.name} ${cmd.loan ? '임대' : '영입'}`,
        `${o.player.role} · ${w.year - o.player.born}세 · 연봉 ${o.player.wage} · 계약 ${o.player.until}년`,
        cost,
      );
      break;
    }
    case 'transfer-stance':
      setTransferStance(w, cmd.id, cmd.stance);
      break;
    case 'campaign': {
      const o = campaignOffers(w).find((c) => c.kind === cmd.kind);
      if (!o || w.campaigns.some((c) => c.kind === cmd.kind))
        throw new Error('이미 진행 중이거나 없는 캠페인입니다.');
      if (w.sponsor?.kind === 'exclusive' && cmd.kind === 'merchandise')
        throw new Error('독점 후원 계약 중에는 자체 상품 캠페인을 진행할 수 없습니다.');
      debit(w, o.cost);
      w.campaigns.push({
        // One campaign of a kind runs at a time, so its round names it.
        id: `${w.year}:${w.round}:${o.kind}`,
        kind: o.kind,
        cost: o.cost,
        started: w.round,
        remaining: 4,
        income: '0',
        fans: 0,
      });
      addEvent(
        w,
        'campaign',
        `${o.label} 시작`,
        '4라운드 후 수입과 신규 팬을 확인합니다. 수익은 보장되지 않습니다.',
        o.cost,
      );
      break;
    }
    case 'sponsor': {
      if (w.sponsor) throw new Error('기존 주 후원 계약이 남아 있습니다.');
      const offer = sponsorOffers(w).find((o) => o.kind === cmd.kind);
      if (!offer) throw new Error('없는 후원 제안');
      signSponsor(w, offer);
      break;
    }
    case 'facility': {
      if (w.facilities >= MAX_FACILITIES) throw new Error('시설 확장 한도입니다.');
      const fee = quote(code, w.year, facilityCostUnits(w.facilities + 1));
      debit(w, fee);
      w.facilities++;
      addEvent(
        w,
        'facility',
        '더 나은 내일의 운동장',
        `시설 ${w.facilities}단계 · 관중 수용과 선수 성장 개선 · 운영비 증가`,
        fee,
      );
      break;
    }
    case 'ticket': {
      if (!Number.isFinite(cmd.price) || cmd.price < 0.01 || cmd.price > 0.5)
        throw new Error('티켓 기본가격은 0.01–0.5입니다.');
      w.ticket = cmd.price;
      addEvent(w, 'ticket', '티켓 가격 조정', `1901년 기준 기본가격 ${cmd.price} · 현재 물가 반영`);
      break;
    }
    case 'support': {
      const limit = buildEffects(w).ownerCapital;
      if (w.events.filter((e) => e.kind === 'support' && e.year === w.year).length >= limit)
        throw new Error(`구단주 추가 출자는 시즌당 ${limit}회입니다.`);
      const amount = quote(code, w.year, 150);
      credit(w, amount);
      w.support++;
      clubOf(w).reputation = clamp(clubOf(w).reputation - 2);
      if (BigInt(w.cash) >= 0 && w.critical === '운영자금이 부족합니다.') delete w.critical;
      addEvent(
        w,
        'support',
        '구단주 추가 출자',
        `운영 매출과 별도 · 시즌당 최대 ${limit}회 · 자금 조달 의존으로 평판 -2`,
        amount,
      );
      break;
    }
  }
  w.revision++;
}
export type SponsorKind = Sponsor['kind'];
