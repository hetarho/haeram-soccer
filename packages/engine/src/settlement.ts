import type { MatchRecord, World } from '../../contracts/src/types';
import { addEvent, clubOf, quote } from './world';
import { random, ratio } from './primitives';
import {
  campaignEffectiveness,
  FINANCE_CONFIG,
  gateProjection,
  isLeagueMatch,
  matchBonus,
  moneyLabel,
  operatingCosts,
  roundShare,
  seasonPrize,
} from './finance';
import { currentDay } from './calendar';
import { driftFans, fanIncome, MIN_FANS } from './fans';
import { pushInbox } from './inbox';
import { marketingFanGain, policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { credit, debit } from './operations';
import { CAMPAIGNS, sponsorAnnual } from './ops-commercial';

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
    detail: `라운드마다 급여·운영비 ${moneyLabel(w, perRound)}가 나가요. 후원 계약, 선수 매각, 마케팅·유소년 투자 축소나 구단주 출자로 버틸 시간을 늘리세요. 잔고가 바닥난 채 ${BANKRUPTCY_ROUNDS}라운드가 지나면 구단이 파산해요.`,
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
  const money = (amount: string) => moneyLabel(w, amount);
  addEvent(
    w,
    'operating-cost',
    '급여와 시설 유지비',
    `선수 ${money(cost.payments.playerWages)} · 감독 ${money(cost.payments.managerWage)} · 시설 ${money(cost.payments.maintenance)}${cost.payments.marketing ? ` · 마케팅 ${money(cost.payments.marketing)}` : ''}${cost.payments.academy ? ` · 유소년 ${money(cost.payments.academy)}` : ''}${fansGained ? ` · 마케팅 팬 +${fansGained}명` : ''}`,
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
