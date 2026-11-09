import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
/**
 * What the 구단주 sheet, the crisis statuses and the game-over page read (→WEB-114, WEB-56,
 * OWNER-7–16): pure views over the world and the owner's named settings. Every rule number comes
 * from `owner-config.ts` by name; the engine (T659/T660) settles the owner's money and 팬 민심, so
 * an outlook here is the rule applied to today's figures, never a second settlement.
 *
 * Only read leaves are imported (catalogs, calendar, quotes, primitives, owner-config): the UI
 * never reaches the day loop (→ARCH-4); `careerOver` is the contracts' `careerEnded`.
 */
import { COUNTRIES, currency, priceIndex } from '../../../../../../packages/catalogs/src/index';
import {
  careerEnded,
  type DividendShare,
  type EndCause,
  type OwnerState,
  type OwnerTrait,
} from '../../../../../../packages/contracts/src/owner';
import type { World } from '../../../../../../packages/contracts/src/types';
import {
  SEASON_END_DAY,
  currentDay,
  seasonDayLabel,
  seasonDayOf,
} from '../../../../../../packages/engine/src/calendar';
import {
  FAN_MOOD,
  FFP,
  OWNER_BUSINESS,
  OWNER_DIVIDEND,
  OWNER_LIVING,
  OWNER_SETTLEMENTS,
  OWNER_TIERS,
  OWNER_TRAITS,
} from '../../../../../../packages/engine/src/owner-config';
import {
  lastSeasonTurnover,
  seasonResult,
  seasonTurnover,
} from '../../../../../../packages/engine/src/finance-read';
import { ownSeasons } from '../../../../../../packages/engine/src/player-state';
import { ratio } from '../../../../../../packages/engine/src/primitives';
import { quote } from '../../../../../../packages/engine/src/quotes';
import type { ClientState } from '../../../runtime/client';
import { gameActionsBlocked } from '../../../runtime/store';
import { compactMoney, number, seasonName, signed } from '../../../presentation/format';

/** Whether the career is over (→OWNER-16, ECON-24): the contracts' `careerEnded`, read in the UI. */
export const careerOver = careerEnded;
/** What ended the career: `w.ended`, or the club's bankruptcy a career before the owner recorded. */
export function endCause(w: Pick<World, 'bankrupt' | 'ended'>): EndCause | undefined {
  return w.ended ?? (w.bankrupt ? 'club' : undefined);
}

const ownClub = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;
/** An amount of the club's money in the HUD notation (→WEB-67). */
export function ownMoney(w: World, value: string | bigint) {
  return compactMoney(value.toString(), ownClub(w).country, w.year);
}
const has = (owner: OwnerState, trait: OwnerTrait) => owner.traits.includes(trait);
/** A 팬 민심 change as the owner feels it: drops shrink under 팬들의 친구, rises never (→OWNER-12). */
function felt(owner: OwnerState, change: number) {
  return change < 0 && has(owner, 'fansFriend') ? change * FAN_MOOD.friendly : change;
}
const positive = (value: bigint) => (value > 0n ? value : 0n);

/** The tier and the traits the owner took, as the sheet's header names them (→OWNER-3/5). */
export function ownerIdentity(owner: OwnerState) {
  return {
    tier: OWNER_TIERS[owner.tier].label,
    traits: owner.traits.map((trait) => OWNER_TRAITS[trait].label),
  };
}

/** A business settlement's success chance: 60%, 70% with 성공한 사업가 (→OWNER-7). */
export function businessChance(owner: OwnerState) {
  return has(owner, 'businessman') ? OWNER_TRAITS.businessman.success : OWNER_BUSINESS.chance;
}
/**
 * What a settlement wins or loses: OWNER_BUSINESS.swing percent of the stake's share of a fortune
 * above zero; a fortune at zero or below is not staked (→OWNER-7).
 */
export function stakeAmount(fortune: string, percent: number) {
  const value = BigInt(fortune);
  return value > 0n ? ratio(fortune, BigInt(percent * OWNER_BUSINESS.swing), 10000n) : '0';
}

export interface Settlement {
  /** Its season day (→LEAGUE-9). */
  day: number;
  /** Its date as the calendar writes it. */
  date: string;
  /** Days from today. */
  days: number;
  /** The season's close day rather than one of the monthly settlements. */
  close: boolean;
}
/** The season's close day, the day after its final round (→LEAGUE-9). */
const CLOSE_DAY = SEASON_END_DAY + 1;
/** Every settlement day of a season in order, the close last (→OWNER-7). */
function settlementDays(year: number) {
  return [
    ...OWNER_BUSINESS.dates
      .map(({ month, date }) => seasonDayOf(year, month, date))
      .filter((day) => day < CLOSE_DAY)
      .sort((a, b) => a - b),
    CLOSE_DAY,
  ];
}
/**
 * The next business settlement after today (→OWNER-7): the 1st of the next month from September
 * to June or the season's close day. Today's own settlement has already settled when the clock
 * reads it.
 */
export function nextSettlement(w: World): Settlement {
  const today = currentDay(w);
  const day = settlementDays(w.year).find((day) => day > today) ?? CLOSE_DAY;
  return {
    day,
    date: seasonDayLabel(w.year, day),
    days: Math.max(0, day - today),
    close: day === CLOSE_DAY,
  };
}
/** The season close's date and days left, the end of 구단주 파산 위기 (→OWNER-14). */
function seasonClose(w: World) {
  return {
    date: seasonDayLabel(w.year, CLOSE_DAY),
    days: Math.max(0, CLOSE_DAY - currentDay(w)),
  };
}

/** Price precision for the living-cost factor; the money itself stays exact (→ECON-1). */
const FACTOR_SCALE = 1_000_000_000n;
/**
 * The next settlement's living costs (→OWNER-8): its even share of the season's
 * `OWNER_LIVING.season` of the tier's starting fortune, grown with the country's prices since the
 * takeover and carried into today's money (→ECON-2/6).
 */
export function livingCost(w: World) {
  const owner = w.owner!;
  const code = ownClub(w).country,
    then = owner.takeover.year,
    grown = (OWNER_LIVING.season * priceIndex(code, w.year).value) / priceIndex(code, then).value;
  const index = settlementDays(w.year).indexOf(nextSettlement(w).day) + 1;
  const season = ratio(
      owner.takeover.fortune,
      BigInt(Math.round(grown * Number(FACTOR_SCALE))),
      FACTOR_SCALE,
    ),
    share = (count: number) => BigInt(ratio(season, BigInt(count), BigInt(OWNER_SETTLEMENTS))),
    base = (share(index) - share(index - 1)).toString();
  const before = currency(code, then),
    after = currency(code, w.year);
  if (before.code === after.code) return base;
  return ratio(
    base,
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  );
}

/** The business stake's outlook at today's fortune (→OWNER-7/8), as the slider states it. */
export function stakeOutlook(w: World, percent: number) {
  const owner = w.owner!;
  const amount = stakeAmount(owner.fortune, percent),
    living = livingCost(w),
    fortune = BigInt(owner.fortune);
  return {
    chance: businessChance(owner),
    amount,
    living,
    /** The fortune after the next settlement's living costs, won or lost. */
    win: (fortune + BigInt(amount) - BigInt(living)).toString(),
    lose: (fortune - BigInt(amount) - BigInt(living)).toString(),
    /** Whether anything is staked: a fortune at zero or below never is. */
    staked: fortune > 0n,
    next: nextSettlement(w),
  };
}

/**
 * Euros in the club's money of this season at ECON-35's rates: a euro club's money is the euro; any
 * other converts at the game's own rate, the mean over the playable euro countries of what one
 * 1901 price unit quotes in each money (→ECON-26/35).
 */
function eurosInClubMoney(w: World, euros: number) {
  const code = ownClub(w).country,
    money = currency(code, w.year);
  if (money.code === 'EUR') return String(BigInt(Math.round(euros)) * BigInt(money.units));
  // One quote's size: large enough that rounding to minor units leaves the rate exact enough.
  const UNITS = 1000;
  const own = Number(quote(code, w.year, UNITS));
  // The club's minor units per euro in each euro country's quote of the same price units.
  const rates = COUNTRIES.filter((c) => currency(c.code, w.year).code === 'EUR').map(
    (c) => (own / Number(quote(c.code, w.year, UNITS))) * currency(c.code, w.year).units,
  );
  if (!rates.length) return '0';
  const perEuro = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  return String(Math.round(euros * perEuro));
}

export interface FfpRoom {
  /** The cap in force, in euros and in the club's money (→OWNER-10). */
  euros: number;
  cap: string;
  /** Owner money put in over the window, and what is left of the cap. */
  used: string;
  left: string;
  /** The window's first season; it ends with this one. */
  from: number;
}
/**
 * UEFA financial fair play's room (→OWNER-10): from the 2011/12 season, while the club plays its
 * country's top flight, the cap in force less the owner money put in over this season and the two
 * before. Undefined while it does not apply.
 */
export function ffpRoom(w: World): FfpRoom | undefined {
  const owner = w.owner;
  if (!owner || w.year < FFP.start || ownClub(w).tier !== 0) return undefined;
  const euros = FFP.caps.filter((cap) => cap.from <= w.year).at(-1)!.euros;
  const from = w.year - FFP.window + 1;
  const used = owner.ffpInjections
    .filter((entry) => entry.season >= from && entry.season <= w.year)
    .reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
  const cap = eurosInClubMoney(w, euros);
  return {
    euros,
    cap,
    used: used.toString(),
    left: positive(BigInt(cap) - used).toString(),
    from,
  };
}
/** The most the owner can put in now: his fortune above zero, within the FFP room (→OWNER-9/10). */
export function injectionLimit(w: World) {
  const ffp = ffpRoom(w);
  const fortune = positive(BigInt(w.owner!.fortune));
  const max = ffp && BigInt(ffp.left) < fortune ? BigInt(ffp.left) : fortune;
  return { max: max.toString(), ffp };
}
/** The 자금 투입 dial's steps, in percent of what can be put in now. */
const INJECTION_STEPS = [25, 50, 75, 100] as const;
/** Each step's amount, distinct and above zero; none when nothing can be put in. */
export function injectionSteps(w: World) {
  const { max } = injectionLimit(w);
  const amounts = INJECTION_STEPS.map((step) => ratio(max, BigInt(step), 100n)).filter(
    (amount) => BigInt(amount) > 0n,
  );
  return [...new Set(amounts)];
}

/** The percent of `base` that `amount` is, unrounded. */
const share = (amount: string, base: string) => (Number(amount) / Number(base)) * 100;
/**
 * The 팬 민심 an injection of `amount` raises (→OWNER-12): +1 per 1% of last season's turnover, at
 * most +10. Undefined when the club has no closed season to measure it by.
 */
export function injectionMood(w: World, amount: string) {
  const takeover = w.owner?.takeover;
  const turnover =
    lastSeasonTurnover(w) ?? (takeover?.year === w.year ? takeover.lastIncome : undefined);
  if (!turnover || BigInt(turnover) <= 0n) return undefined;
  return Math.min(FAN_MOOD.injection.max, share(amount, turnover) * FAN_MOOD.injection.perPercent);
}
/** What an injection of `amount` leaves (→OWNER-9, WEB-114): both pots and 팬 민심's rise. */
export function injectionOutlook(w: World, amount: string) {
  return {
    cash: (BigInt(w.cash) + BigInt(amount)).toString(),
    fortune: (BigInt(w.owner!.fortune) - BigInt(amount)).toString(),
    mood: injectionMood(w, amount),
  };
}

/**
 * What the 배당 dial would take at the close on today's books (→OWNER-11): `share` of the season's
 * result so far when positive, never more than the cash above zero, and the 팬 민심 it costs by
 * its share of the season's turnover so far. The close settles on the whole season.
 */
export function dividendOutlook(w: World, dividend: DividendShare) {
  // The close's own result: an injection is the owner's money, not profit (→OWNER-11).
  const result = BigInt(seasonResult(w));
  const profit = positive(result),
    cash = positive(BigInt(w.cash));
  let amount = BigInt(ratio(profit.toString(), BigInt(dividend), 100n));
  if (amount > cash) amount = cash;
  const turnover = seasonTurnover(w);
  const percent = turnover > 0n ? share(amount.toString(), turnover.toString()) : 100;
  const mood = amount > 0n ? felt(w.owner!, percent * FAN_MOOD.dividend.perPercent) : 0;
  return { result: result.toString(), amount: amount.toString(), mood };
}
/** The last dividend the owner took, in the money of its season (→OWNER-11/17). */
export function lastDividend(owner: OwnerState) {
  return owner.seasonRecords.findLast((record) => BigInt(record.dividend) > 0n);
}
/** The 배당 dial's settings, in percent (→OWNER-11). */
export const DIVIDEND_DIAL = OWNER_DIVIDEND.shares;

export interface FanMover {
  label: string;
  /** The change in 팬 민심 when the rule states it; a direction alone otherwise. */
  change?: number;
  direction: 'up' | 'down' | 'none';
}
/**
 * What moved 팬 민심 last (→OWNER-12), newest first, read from what the world records: the latest
 * own league result, the drift each settled round brings, this season's injections and the last
 * close (its dividend and the change since). Transfers and a new identity move it too, but the world
 * keeps no per-change log of them, so the sheet does not guess them.
 */
export function fanMovers(w: World): FanMover[] {
  const owner = w.owner!;
  const movers: FanMover[] = [];
  const direction = (change: number) => (change > 0 ? 'up' : change < 0 ? 'down' : 'none');
  const match = w.ownMatches
    .filter((m) => m.year === w.year && m.kind === 'league')
    .sort((a, b) => a.round - b.round)
    .at(-1);
  if (match) {
    const home = match.home === w.playerClub;
    const [gf, ga] = home
      ? [match.score.home, match.score.away]
      : [match.score.away, match.score.home];
    const result = gf > ga ? 'win' : gf < ga ? 'defeat' : 'draw';
    const change = felt(owner, FAN_MOOD.result[result]);
    const rival = w.clubs.find((club) => club.id === (home ? match.away : match.home));
    movers.push({
      label: sourceMessage('copy.ownerFigures.ac3373014d', {
        p0: match.round,
        p1: rival?.name ?? '',
        p2: gf,
        p3: ga,
        p4:
          result === 'win'
            ? sourceMessage('result.win.label')
            : result === 'defeat'
              ? sourceMessage('result.loss.label')
              : sourceMessage('result.draw.label'),
      }),
      change,
      direction: direction(change),
    });
  }
  const drift = felt(owner, (FAN_MOOD.start - owner.fanMood) * FAN_MOOD.drift);
  if (Math.abs(drift) >= 0.05)
    movers.push({
      label: sourceMessage('copy.ownerFigures.5648870692', {
        p0: FAN_MOOD.start,
        p1:
          drift > 0
            ? sourceMessage('copy.TrainingView.de755cc2f7')
            : sourceMessage('copy.ClubOverview.7b0c422662'),
      }),
      change: drift,
      direction: direction(drift),
    });
  const injected = owner.ffpInjections.find((entry) => entry.season === w.year);
  if (injected && BigInt(injected.amount) > 0n)
    movers.push({
      label: sourceMessage('copy.ownerFigures.32472d4af2', { p0: ownMoney(w, injected.amount) }),
      direction: 'up',
    });
  const record = owner.seasonRecords.at(-1);
  if (record) {
    if (BigInt(record.dividend) > 0n)
      movers.push({
        label: sourceMessage('copy.ownerFigures.6ca7be66b2', {
          p0: seasonName(record.year),
          p1: compactMoney(record.dividend, ownClub(w).country, record.year),
        }),
        direction: 'down',
      });
    const since = owner.fanMood - record.fanMood;
    movers.push({
      label: sourceMessage('copy.ownerFigures.286a8fe495', {
        p0: seasonName(record.year),
        p1: number(record.fanMood),
      }),
      change: since,
      direction: direction(since),
    });
  }
  return movers;
}
/** A 팬 민심 figure as the sheet writes it: one decimal at most. */
export const mood = (value: number) => number(Math.round(value * 10) / 10);
/** A 팬 민심 change with its sign and one decimal when it has one. */
export const moodChange = (value: number) =>
  signed(Math.round(value * 10) / 10, Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1);

export interface OwnerStatus {
  id: 'owner' | 'fans';
  title: string;
  detail: string;
}
/**
 * The owner's crises as statuses beside the cash band, never a modal (→WEB-56, OWNER-13–15):
 * 구단주 파산 위기 to the season close and 퇴진 압박 with the rounds left.
 */
export function ownerStatuses(w: World): OwnerStatus[] {
  const owner = w.owner;
  if (!owner || careerOver(w)) return [];
  const statuses: OwnerStatus[] = [];
  if (owner.ownerCrisis) {
    const close = seasonClose(w);
    statuses.push({
      id: 'owner',
      title: sourceMessage('copy.ownerFigures.f20b1ae1c7'),
      detail: sourceMessage('copy.ownerFigures.32a7b90384', {
        p0: ownMoney(w, owner.fortune),
        p1: close.date,
        p2: close.days,
      }),
    });
  }
  const rounds = owner.fanCrisis?.rounds ?? 0;
  if (rounds > 0)
    statuses.push({
      id: 'fans',
      title: sourceMessage('copy.ownerFigures.c505853f74'),
      detail: sourceMessage('copy.ownerFigures.38f609e242', {
        p0: mood(owner.fanMood),
        p1: FAN_MOOD.floor,
        p2: rounds,
        p3: Math.max(0, FAN_MOOD.rounds - rounds),
      }),
    });
  return statuses;
}

/**
 * Why the owner's controls are locked (→WEB-97), or undefined while they are open: the career's
 * end, a blocking club alert, a read-only tab, the running clock or work still settling, and a
 * sheet opened where no command can be sent.
 */
export function ownerLock(state: ClientState, connected: boolean): string | undefined {
  const w = state.view?.world;
  if (!w || careerOver(w)) return sourceMessage('copy.ownerFigures.13ed83a888');
  if (w.critical) return sourceMessage('copy.ownerFigures.37b69c4bc8');
  if (state.readonly) return sourceMessage('copy.ownerFigures.05d3f0c469');
  if (state.clockRunning || state.processing) return sourceMessage('copy.ownerFigures.dd737e80ef');
  if (gameActionsBlocked(state)) return sourceMessage('copy.ownerFigures.60c01a5709');
  if (!connected) return sourceMessage('copy.ownerFigures.ff6cbf3618');
  return undefined;
}

export interface GameOverFacts {
  cause: EndCause;
  title: string;
  /** The club, named apart when the title names the owner. */
  club?: string;
  season: number;
  line: string;
  seasons: number;
  best: string;
  titles: number;
  peak: number;
}
/**
 * The game-over page's facts (→WEB-56, OWNER-16): its cause — 구단 파산, 구단주 파산 or 구단주
 * 퇴진 — the season it ended in, and the career's seasons played, best finish, titles and peak
 * supporters.
 */
export function gameOverFacts(w: World): GameOverFacts {
  const own = ownClub(w);
  const cause = endCause(w) ?? 'club';
  // The seasons a career counts: from the takeover on, or every season of a founded club.
  const seasons = ownSeasons(w);
  const best = seasons.reduce<(typeof seasons)[number] | undefined>(
    (top, season) =>
      !top || season.tier < top.tier || (season.tier === top.tier && season.rank < top.rank)
        ? season
        : top,
    undefined,
  );
  // Leagues, cups and continental titles recorded season by season (the event tail is bounded).
  const titles = seasons.reduce(
    (count, season) =>
      count +
      season.champions.filter((title) => title.club === own.id).length +
      season.europe.filter((tournament) => tournament.winner === own.id).length,
    0,
  );
  const peak = Math.max(own.fans, ...seasons.map((season) => season.fans));
  const season =
    cause === 'club'
      ? (w.bankrupt?.year ?? w.year)
      : cause === 'owner'
        ? (w.history.at(-1)?.year ?? w.year)
        : w.year;
  const kept = sourceMessage('copy.ownerFigures.bb36ff7e9c');
  const line =
    cause === 'club'
      ? sourceMessage('copy.ownerFigures.628dfc9d8f', {
          p0: seasonName(season),
          p1: w.insolvent ?? 0,
          p2: kept,
        })
      : cause === 'owner'
        ? sourceMessage('copy.ownerFigures.b2200caa15', {
            p0: seasonName(season),
            p1: ownMoney(w, w.owner?.fortune ?? '0'),
            p2: own.name,
            p3: kept,
          })
        : sourceMessage('copy.ownerFigures.8fc80aaaac', {
            p0: seasonName(season),
            p1: FAN_MOOD.floor,
            p2: FAN_MOOD.rounds,
            p3: kept,
          });
  return {
    cause,
    title:
      cause === 'club'
        ? sourceMessage('copy.ownerFigures.f933e937de', { p0: own.name })
        : cause === 'owner'
          ? sourceMessage('copy.stories.ca78f66cf8')
          : sourceMessage('copy.stories.4e6b8dec47'),
    club: cause === 'club' ? undefined : own.name,
    season,
    line,
    seasons: seasons.length,
    best: best
      ? sourceMessage('copy.ownerFigures.fc474da2fc', { p0: best.tier + 1, p1: best.rank })
      : '—',
    titles,
    peak,
  };
}
