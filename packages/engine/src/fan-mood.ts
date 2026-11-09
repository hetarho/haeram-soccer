import { message as sourceMessage } from '../../contracts/src/messages';
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
import { fanMoodAfter, percentOf } from './fan-mood-read';
import { careerEnded } from './owner';
import { addEvent } from './events';
import { pushInbox } from './inbox';
import { activePlayers, clubOf, overall } from './player-state';
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
    before = owner.fanMood;
  owner.fanMood = fanMoodAfter(w, change);
  if (!why) return;
  const moved = owner.fanMood - before;
  addEvent(
    w,
    'fan-mood',
    why.title,
    sourceMessage('copy.fan_mood.8447102cff', {
      p0: why.detail,
      p1: moved >= 0 ? '+' : '−',
      p2: Math.abs(moved).toFixed(1),
      p3: owner.fanMood.toFixed(1),
    }),
  );
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
      sourceMessage('copy.stories.4e6b8dec47'),
      sourceMessage('copy.fan_mood.dc235a5468', {
        p0: owner.fanMood.toFixed(1),
        p1: rounds,
        p2: FAN_MOOD.floor,
      }),
    );
    return;
  }
  if (rounds === 1)
    pushInbox(w, {
      kind: 'finance',
      title: sourceMessage('copy.fan_mood.0590215d59', { p0: FAN_MOOD.rounds, p1: FAN_MOOD.floor }),
      detail: sourceMessage('copy.fan_mood.d1e688664c', {
        p0: owner.fanMood.toFixed(1),
        p1: FAN_MOOD.floor,
        p2: FAN_MOOD.rounds,
      }),
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
    ...(season.rank === 1 ? [sourceMessage('start.history.champions')] : []),
    ...(season.champions.find((c) => c.country === own.country)?.cup === w.playerClub
      ? [sourceMessage('copy.managerHistoryView.5b012994d1')]
      : []),
    ...season.europe
      .filter((t) => t.winner === w.playerClub)
      .map((t) => sourceMessage('copy.CareerRecordBook.2bfc53c804', { p0: t.name })),
  ];
  for (const title of titles)
    move(w, FAN_MOOD.title, { title, detail: sourceMessage('copy.OwnerSheet.ce1c739e52') });
  if (own.tier < season.tier)
    move(w, FAN_MOOD.promotion, {
      title: sourceMessage('copy.AcademyPanel.8e70a8dda1'),
      detail: sourceMessage('copy.fan_mood.93306a044e', { p0: season.tier + 1, p1: own.tier + 1 }),
    });
  else if (own.tier > season.tier)
    move(w, FAN_MOOD.relegation, {
      title: sourceMessage('copy.CareerRecordBook.7e6e321ef0'),
      detail: sourceMessage('copy.fan_mood.93306a044e', { p0: season.tier + 1, p1: own.tier + 1 }),
    });
  const lowest = country(own.country).groups.length - 1,
    clubs = season.standings.filter((row) => row[1] === season.tier && row[2] === season.group);
  if (season.tier === lowest && season.rank === clubs.length)
    move(w, FAN_MOOD.lastInLowest, {
      title: sourceMessage('copy.fan_mood.b7bcb3bb83'),
      detail: sourceMessage('copy.fan_mood.aba5fd4e60', { p0: season.tier + 1 }),
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
      move(w, FAN_MOOD.recordSigning, {
        title: sourceMessage('copy.fan_mood.4dbaafd6be'),
        detail: fact.name,
      });
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
      title: sourceMessage('copy.fan_mood.19741d722e'),
      detail: `${fact.name} · OVR ${ovr}`,
    });
  }
}

/** A designer draft adopted as the club's identity (→OWNER-12, KIT-9). */
export function fanMoodIdentity(w: World) {
  if (!live(w)) return;
  move(w, FAN_MOOD.identity, {
    title: sourceMessage('copy.fan_mood.2d44d44e0c'),
    detail: sourceMessage('copy.fan_mood.6902fa4e38'),
  });
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
    title: sourceMessage('copy.fan_mood.3881f2a2d6'),
    detail:
      percent === undefined
        ? sourceMessage('copy.fan_mood.c084fa3596')
        : sourceMessage('copy.fan_mood.f85507dce3', { p0: percent.toFixed(1) }),
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
    title: sourceMessage('copy.fan_mood.eb9f33a674'),
    detail: sourceMessage('copy.fan_mood.65d2c22e42', { p0: percent.toFixed(1) }),
  });
}

/** The latest named movers of 팬 민심, newest first (→WEB-114). */
export function fanMoodMovers(w: Pick<World, 'events'>, count = 5): Event[] {
  const movers: Event[] = [];
  for (let i = w.events.length - 1; i >= 0 && movers.length < count; i--)
    if (w.events[i]!.kind === 'fan-mood') movers.push(w.events[i]!);
  return movers;
}
