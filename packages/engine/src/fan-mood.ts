/**
 * 팬 민심, the supporters' standing of the owner (→OWNER-12/13), moved by the day loop's hooks: own
 * league results, each settled league round, the season close, completed transfers and a new
 * identity, and by the owner's own injections and dividends. Each returns at once in a career
 * without an owner, so founding careers live exactly as before.
 */
import type {
  Event,
  MatchRecord,
  OwnerSeasonRecord,
  TransferFact,
  World,
} from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { FAN_MOOD } from './owner-config';
import { hasTrait } from './owner-traits';
import { careerEnded } from './owner';
import { addEvent } from './events';
import { pushInbox } from './inbox';
import { activePlayers, clubOf, overall } from './player-state';
import { clamp } from './primitives';
import { isLeagueMatch, lastSeasonTurnover, seasonTurnover } from './finance';
import { DEFAULT_TICKET, TICKET_PRESETS } from './presets';
import { transferRanking } from './transfer-records';
import { transferWindow } from './transfer-window';

/** A live owner's career: the hooks act only while he owns the club and it plays on. */
function live(w: World) {
  return w.owner !== undefined && !careerEnded(w);
}
/**
 * Moves 팬 민심 by `change` within 0–100, a drop scaled by 팬들의 친구 (→OWNER-5), kept to
 * hundredths. A named driver leaves a `fan-mood` event, what moved it last (→WEB-114); league
 * results, the ticket price and the drift move it silently every round.
 */
function move(w: World, change: number, why?: { title: string; detail: string }) {
  const owner = w.owner!,
    scaled = change < 0 && hasTrait(w, 'fansFriend') ? change * FAN_MOOD.friendly : change,
    before = owner.fanMood;
  owner.fanMood = Math.round(clamp(before + scaled, FAN_MOOD.min, FAN_MOOD.max) * 100) / 100;
  if (!why) return;
  const moved = owner.fanMood - before;
  addEvent(
    w,
    'fan-mood',
    why.title,
    `${why.detail} · 팬 민심 ${moved >= 0 ? '+' : '−'}${Math.abs(moved).toFixed(1)} → ${owner.fanMood.toFixed(1)}`,
  );
}
/** `amount` as a percentage of `turnover`, to hundredths; undefined without a turnover. */
function percentOf(amount: bigint, turnover: bigint | undefined) {
  if (turnover === undefined || turnover <= 0n) return undefined;
  return Number((amount * 10000n) / turnover) / 100;
}

/** Preset steps a ticket price stands above the default (→ECON-17); a custom price counts those it passes. */
function ticketSteps(price: number) {
  return TICKET_PRESETS.filter((preset) => preset > DEFAULT_TICKET && preset <= price).length;
}
/** An own league result as it settles, from `recordMatch` (→OWNER-12: results, ticket price). */
export function fanMoodAfterLeagueMatch(w: World, result: MatchRecord) {
  if (!live(w) || !isLeagueMatch(result.kind)) return;
  const home = result.home === w.playerClub,
    own = home ? result.score.home : result.score.away,
    other = home ? result.score.away : result.score.home,
    { win, draw, defeat } = FAN_MOOD.result;
  move(w, own > other ? win : own === other ? draw : defeat);
  const steps = home ? ticketSteps(w.ticket) : 0;
  if (steps > 0) move(w, steps * FAN_MOOD.ticket.perStep);
}

/**
 * Each settled league round, after its settlement: the drift toward the start, then 퇴진 압박 —
 * a round below the floor counts one, the floor or above resets it, and the count at
 * FAN_MOOD.rounds forces the owner out (→OWNER-12/13).
 */
export function fanMoodRound(w: World) {
  if (!live(w)) return;
  const owner = w.owner!,
    mood = owner.fanMood + (FAN_MOOD.start - owner.fanMood) * FAN_MOOD.drift;
  owner.fanMood = Math.round(mood * 100) / 100;
  if (owner.fanMood >= FAN_MOOD.floor) {
    delete owner.fanCrisis;
    return;
  }
  const rounds = (owner.fanCrisis?.rounds ?? 0) + 1;
  owner.fanCrisis = { rounds };
  if (rounds >= FAN_MOOD.rounds) {
    w.ended = 'fans';
    delete w.critical;
    addEvent(
      w,
      'owner-ousted',
      '구단주 퇴진',
      `팬 민심 ${owner.fanMood.toFixed(1)} · ${rounds}라운드 연속 ${FAN_MOOD.floor} 아래 · 팬들의 퇴진 요구에 구단을 떠나요.`,
    );
    return;
  }
  if (rounds === 1)
    pushInbox(w, {
      kind: 'finance',
      title: `퇴진 압박 · ${FAN_MOOD.rounds}라운드 안에 팬 민심을 ${FAN_MOOD.floor} 이상으로`,
      detail: `팬 민심이 ${owner.fanMood.toFixed(1)}예요. ${FAN_MOOD.floor} 아래로 ${FAN_MOOD.rounds}라운드가 이어지면 구단주가 물러나 게임이 끝나요.`,
      // A status, not a stop (→OWNER-15).
      attention: false,
    });
}

/** The season close's honours and fate (→OWNER-12, LEAGUE-16), from the archive just written. */
function closeDrivers(w: World) {
  const season = w.history.at(-1),
    own = clubOf(w);
  if (!season || season.year !== w.year) return;
  const titles = [
    ...(season.rank === 1 ? ['리그 우승'] : []),
    ...(season.champions.find((c) => c.country === own.country)?.cup === w.playerClub
      ? ['컵 우승']
      : []),
    ...season.europe.filter((t) => t.winner === w.playerClub).map((t) => `${t.name} 우승`),
  ];
  for (const title of titles) move(w, FAN_MOOD.title, { title, detail: '시즌 마감' });
  if (own.tier < season.tier)
    move(w, FAN_MOOD.promotion, {
      title: '승격',
      detail: `${season.tier + 1}부 → ${own.tier + 1}부`,
    });
  else if (own.tier > season.tier)
    move(w, FAN_MOOD.relegation, {
      title: '강등',
      detail: `${season.tier + 1}부 → ${own.tier + 1}부`,
    });
  const lowest = country(own.country).groups.length - 1,
    clubs = season.standings.filter((row) => row[1] === season.tier && row[2] === season.group);
  if (season.tier === lowest && season.rank === clubs.length)
    move(w, FAN_MOOD.lastInLowest, {
      title: '최하위',
      detail: `${season.tier + 1}부 꼴찌로 시즌 마감`,
    });
}
/** The season's owner money of one event kind, in the money it closed in. */
function seasonSum(w: World, kind: Event['kind']) {
  return w.events
    .filter((e) => e.kind === kind && e.year === w.year && e.currency === w.currency && e.amount)
    .reduce((sum, e) => sum + BigInt(e.amount!), 0n)
    .toString();
}
/**
 * The season close, from `closeSeason` once promotion and relegation are known: titles, promotion,
 * relegation, last place, then the owner's season record (→OWNER-12, OWNER-17).
 */
export function fanMoodClose(w: World) {
  const owner = w.owner;
  if (!owner) return;
  if (!careerEnded(w)) closeDrivers(w);
  // Even the season that ended the career is recorded.
  const record: OwnerSeasonRecord = {
    year: w.year,
    currency: w.currency,
    fortune: owner.fortune,
    business: seasonSum(w, 'owner-business'),
    living: seasonSum(w, 'owner-living'),
    injected: seasonSum(w, 'owner-injection'),
    dividend: seasonSum(w, 'owner-dividend'),
    fanMood: owner.fanMood,
  };
  owner.seasonRecords.push(record);
}

/**
 * A completed own fee signing or sale, just recorded (→OWNER-12): a signing for a fee above the
 * club's previous record in today's money, or the sale of one of its highest-OVR players.
 */
export function fanMoodTransfer(w: World, fact: TransferFact) {
  if (!live(w) || fact.loan) return;
  if (fact.direction === 'in') {
    // The club's fees in, highest first: this one, and the record it had to beat.
    const rows = transferRanking(w, { direction: 'in' }),
      signing = rows.find((row) => row.source === 'fact' && row.fact === fact),
      record = rows.find((row) => row !== signing);
    if (signing && record && BigInt(signing.today) > BigInt(record.today))
      move(w, FAN_MOOD.recordSigning, { title: '구단 최고 이적료 영입', detail: fact.name });
    return;
  }
  // Ties count against the sale: he is one of the three only with fewer than three others at his
  // OVR or above, so a squad of equals has no star to sell.
  const sold = w.players.find((p) => p.id === fact.player);
  if (!sold) return;
  const ovr = overall(sold),
    level = activePlayers(w).filter((p) => overall(p) >= ovr).length;
  const window = transferWindow(w),
    owner = w.owner!;
  if (
    level < FAN_MOOD.starSale.top &&
    window.open &&
    window.kind &&
    (owner.starSaleWindow?.year !== w.year || owner.starSaleWindow.kind !== window.kind)
  ) {
    owner.starSaleWindow = { year: w.year, kind: window.kind };
    move(w, FAN_MOOD.starSale.change, {
      title: '주축 선수 매각',
      detail: `${fact.name} · OVR ${ovr}`,
    });
  }
}

/** A designer draft adopted as the club's identity (→OWNER-12, KIT-9). */
export function fanMoodIdentity(w: World) {
  if (!live(w)) return;
  move(w, FAN_MOOD.identity, { title: '구단 정체성 변경', detail: '디자이너 시안 적용' });
}

/**
 * An injection (→OWNER-9/12): +1 per 1% of last season's turnover put in, at most
 * FAN_MOOD.injection.max an injection; with no turnover known yet, the most.
 */
export function fanMoodInjection(w: World, amount: bigint) {
  if (!live(w)) return;
  const last = lastSeasonTurnover(w) ?? takeoverIncome(w),
    percent = percentOf(amount, last === undefined ? undefined : BigInt(last)),
    { perPercent, max } = FAN_MOOD.injection;
  move(w, percent === undefined ? max : Math.min(max, percent * perPercent), {
    title: '구단주 자금 투입',
    detail:
      percent === undefined ? '직전 시즌 매출 없음' : `직전 시즌 매출의 ${percent.toFixed(1)}%`,
  });
}
/**
 * The bought club's last income before the takeover (→ECON-36), kept with the takeover's facts in
 * its money: the turnover of the owner's first season, before any season of his has closed.
 */
function takeoverIncome(w: World) {
  const takeover = w.owner?.takeover;
  return takeover?.year === w.year ? takeover.lastIncome : undefined;
}

/**
 * A dividend taken at the close (→OWNER-11/12), scaled by its share of the season's turnover;
 * without turnover it counts as 100%.
 */
export function fanMoodDividend(w: World, amount: bigint) {
  if (!live(w) || amount <= 0n) return;
  const percent = percentOf(amount, seasonTurnover(w)) ?? 100;
  move(w, percent * FAN_MOOD.dividend.perPercent, {
    title: '구단주 배당',
    detail: `시즌 매출의 ${percent.toFixed(1)}%`,
  });
}

/** The latest named movers of 팬 민심, newest first (→WEB-114). */
export function fanMoodMovers(w: Pick<World, 'events'>, count = 5): Event[] {
  const movers: Event[] = [];
  for (let i = w.events.length - 1; i >= 0 && movers.length < count; i--)
    if (w.events[i]!.kind === 'fan-mood') movers.push(w.events[i]!);
  return movers;
}
