import type { MatchRecord, World } from '../../contracts/src/types';
import { addEvent, clubOf, footballQuote, quote } from './world';
import { random, ratio } from './primitives';
import {
  campaignEffectiveness,
  divisionLabel,
  EXPENSE_CONFIG,
  FINANCE_CONFIG,
  gateProjection,
  isLeagueMatch,
  leagueMerit,
  leagueShare,
  matchBonus,
  moneyLabel,
  operatingCosts,
  operatingExpensesAt,
  ownLeagueGames,
  parachutePayment,
  roundShare,
  SPONSOR_SLOT_LABELS,
} from './finance';
import { currentDay, SEASON_ROUNDS } from './calendar';
import { driftFans, MIN_FANS } from './fans';
import { pushInbox } from './inbox';
import { marketingFanGain, policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { credit, debit } from './operations';
import { CAMPAIGNS } from './ops-commercial';
import { sponsorAnnual } from './sponsors';

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
  if (isLeagueMatch(m.kind)) paySponsors(w, m, bonus.result, bonus.sponsored);
  if (m.home !== w.playerClub) return;
  const c = clubOf(w),
    r = random(`${w.seed}:gate:${m.id}`);
  const projection = gateProjection(w, m.id, m.away);
  const attendance = Math.round(
    projection.attendanceLow + r() * (projection.attendanceHigh - projection.attendanceLow),
  );
  const scale = isLeagueMatch(m.kind) ? projection.leagueFactor : 1;
  const income = footballQuote(c.country, w.year, attendance * projection.perFan * scale);
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
/**
 * Every sponsor contract's league payments (→ECON-14): a base installment per scheduled league
 * game played since signing, never for earlier ones, and the main sponsor's bonus for a win or a
 * draw, each on its slot's ledger line.
 */
function paySponsors(w: World, m: MatchRecord, result: string, resultBonus: string) {
  const played = w.tables[w.playerClub].played,
    games = ownLeagueGames(w);
  for (const contract of w.sponsors ?? []) {
    const label = SPONSOR_SLOT_LABELS[contract.slot];
    if (contract.lastPaid < w.year && contract.until > w.year) {
      accrue(
        w,
        `sponsor:${contract.slot}`,
        label,
        `${contract.name} · 리그 경기 ${played}/${games}`,
        roundShare(sponsorAnnual(w, contract), played, games),
      );
      if (played === games) contract.lastPaid = w.year;
    }
    if (contract.slot === 'shirt')
      accrue(
        w,
        'sponsor:shirt',
        `${label} 경기 보너스`,
        `${contract.name} · 리그 ${result} · ${m.id}`,
        resultBonus,
      );
  }
}
/**
 * One installment of a season-long payment. The season keeps one ledger entry per kind and title
 * that grows each round, so a century of rounds does not fill the save.
 */
function accrue(w: World, kind: string, title: string, detail: string, amount: string) {
  if (BigInt(amount) <= 0n) return;
  credit(w, amount);
  book(w, kind, title, detail, amount);
}
/** Adds an installment already paid or charged to the season's one ledger entry of its kind. */
function book(w: World, kind: string, title: string, detail: string, amount: string) {
  if (BigInt(amount) <= 0n) return;
  const entry = w.events.findLast(
    (event) =>
      event.kind === kind &&
      event.title === title &&
      event.year === w.year &&
      event.currency === w.currency,
  );
  if (entry) {
    entry.amount = (BigInt(entry.amount!) + BigInt(amount)).toString();
    entry.detail = detail;
  } else addEvent(w, kind, title, detail, amount);
}
/**
 * The league distribution's round installment (→ECON-28): the division's equal share, carrying
 * its broadcasting money, and in the season after a relegation the parachute.
 */
function settleDistribution(w: World) {
  const c = clubOf(w),
    division = divisionLabel(c.country, c.tier),
    paid = `${w.round}/${SEASON_ROUNDS}라운드 분할`;
  accrue(
    w,
    'league-share',
    '리그 분배금',
    `${division} 균등 배분·중계권 · ${paid}`,
    roundShare(leagueShare(w), w.round),
  );
  const parachute = roundShare(parachutePayment(w), w.round);
  if (parachute === '0') return;
  const from = divisionLabel(c.country, w.history.at(-1)!.tier);
  accrue(
    w,
    'parachute',
    '강등 보전금',
    `${from} → ${division} 강등 · 줄어든 분배금의 절반 · ${paid}`,
    parachute,
  );
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
    detail: `라운드마다 급여·시설 유지·운영 경비 ${moneyLabel(w, perRound)}가 나가요. 후원 계약, 선수 매각, 마케팅·유소년 투자 축소나 구단주 출자로 버틸 시간을 늘리세요. 잔고가 바닥난 채 ${BANKRUPTCY_ROUNDS}라운드가 지나면 구단이 파산해요.`,
    // A status, not a stop: the HUD and the warning band show it in red (→ECON-24).
    attention: false,
  });
}
/** The league's merit payment for the final rank, once at the close (→ECON-28). */
export function settleLeagueMerit(w: World, rank: number, clubs: number) {
  if (w.events.some((event) => event.year === w.year && event.kind === 'league-merit')) return;
  const amount = leagueMerit(w, rank, clubs);
  if (amount === '0') return;
  credit(w, amount);
  addEvent(
    w,
    'league-merit',
    '리그 순위 배분금',
    `${rank}/${clubs}위 · 최하위는 균등 배분금만`,
    amount,
  );
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
  settleDistribution(w);
  const money = (amount: string) => moneyLabel(w, amount);
  addEvent(
    w,
    'operating-cost',
    '급여와 시설 유지비',
    `선수 ${money(cost.payments.playerWages)} · 감독 ${money(cost.payments.managerWage)} · 시설 ${money(cost.payments.maintenance)}${cost.payments.marketing ? ` · 마케팅 ${money(cost.payments.marketing)}` : ''}${cost.payments.academy ? ` · 유소년 ${money(cost.payments.academy)}` : ''}${fansGained ? ` · 마케팅 팬 +${fansGained}명` : ''}`,
    (BigInt(cost.nextRound) - BigInt(cost.payments.expenses)).toString(),
  );
  // Operating expenses keep one ledger line a season, grown each round (→ECON-30, ECON-10); the
  // line says whether last season's turnover or the division's floor set them.
  const floor =
    BigInt(cost.expenses) <= BigInt(operatingExpensesAt(club.country, w.year, club.tier));
  book(
    w,
    'operating-expenses',
    '운영 경비',
    `${floor ? `${divisionLabel(club.country, club.tier)} 최저 수준` : `직전 시즌 매출의 ${Math.round(EXPENSE_CONFIG.share * 100)}%`} · 경기 운영·원정·행정·의료·용품·직원 · ${w.round}/${SEASON_ROUNDS}라운드 분할`,
    cost.payments.expenses,
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
      `팬 +${fans}명 · 비용 ${money(c.cost)} · 순수익 ${money((BigInt(income) - BigInt(c.cost)).toString())}`,
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
