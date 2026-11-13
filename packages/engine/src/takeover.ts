import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * The takeover (→ECON-38, CLUB-1, OWNER-4, WORLD-5): the owner buys a club of the world nobody
 * owns as it stands, and the career starts there. The club keeps its squad, manager, identity and
 * books' cash; its debt becomes the takeover loan; its price leaves the owner's fortune; and the
 * own-club state a founding writes is written for it, the takeover standing where the founding
 * stood (→OWNER-4).
 */
import { country, currency, priceIndex } from '../../catalogs/src/index';
import {
  OWNER_TRAIT_IDS,
  WEALTH_TIER_IDS,
  type OwnerState,
  type StartChoice,
  type TakeoverLoan,
} from '../../contracts/src/owner';
import type { Club, Manager, Player, Position, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { clubFollowing, facilityStage, fromPounds, pricedClubs, tierFortune } from './club-value';
import { settleClauses } from './contracts';
import { addEvent } from './events';
import { divisionLabel, EXPENSE_CONFIG, operatingExpensesAt } from './finance';
import { installMissingIdentities } from './club-identity';
import { pays } from './listing';
import { activateMatchModel, MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model';
import { ensureManagerHistory } from './manager-history-capture';
import { clubManager, openManagerMarket } from './managerMarket';
import { openStaffMarket } from './club-staff';
import { MORALE_START } from './morale';
import { clubPlayers, invalidateNpcSquad, joinClub, makePlayer, refillPlace } from './world';
import {
  activeCoachingEmployment,
  closeEmployment,
  openEmployment,
  retainPerson,
} from './person-careers';
import { formationOf } from './player-state';
import { lineOf, type Slot } from './player';
import {
  CLUB_TAKEOVER,
  FAN_MOOD,
  OWNER_BUSINESS,
  OWNER_DIVIDEND,
  OWNER_TRAIT_LIMIT,
  TAKEOVER_DEBT,
} from './owner-config';
import { hasOwner } from './owner';
import { DEFAULT_TICKET, foundWithPreset, presetById } from './presets';
import { hash, scaleBy } from './primitives';
import { currencyChange } from './books';
import { trackingBoundary } from './npc-stats';
import { defaultSettings } from './responsibilities';
import { prepareSeason } from './season';
import { openShortlistWindow } from './signings';
import { basicStaff } from './staff';

/**
 * The takeover loan of a debt (→ECON-38): equal installments, one a season over
 * `TAKEOVER_DEBT.seasons`, that repay it with `TAKEOVER_DEBT.rate` a year on what is still owed.
 */
export function takeoverLoan(debt: string): TakeoverLoan {
  const { seasons, rate } = TAKEOVER_DEBT;
  return {
    balance: debt,
    installment: scaleBy(debt, rate / (1 - (1 + rate) ** -seasons), 1_000_000n),
    seasonsLeft: seasons,
  };
}

/** A position a player plays well enough to fill a slot there: 최상 or 준수 (→PLAYER-4). */
const fits = (p: Player, slot: Slot) => (p.positions[slot.position] ?? 0) >= 2;
/**
 * The slots of a formation no player covers at 최상 or 준수, one player to a slot, on the best
 * pairing (each slot takes a player another slot can spare).
 */
export function uncoveredSlots(players: readonly Player[], slots: readonly Slot[]): Slot[] {
  const held = new Map<Player, number>();
  const assign = (slot: number, seen: Set<Player>): boolean => {
    for (const p of players) {
      if (seen.has(p) || !fits(p, slots[slot]!)) continue;
      seen.add(p);
      const other = held.get(p);
      if (other === undefined || assign(other, seen)) {
        held.set(p, slot);
        return true;
      }
    }
    return false;
  };
  return slots.filter((_, slot) => !assign(slot, new Set()));
}

/**
 * The squad taken over (→CLUB-1): the club's own players as it fielded them, then players generated at its
 * level for every slot of the manager's formation nobody covers, keepers up to
 * `CLUB_TAKEOVER.goalkeepers` and the bench up to `CLUB_TAKEOVER.squad`.
 */
function takenSquad(w: World, club: Club, roster: Player[], manager: Manager): Player[] {
  const players = [...roster];
  if (players.length >= CLUB_TAKEOVER.squad) return players;
  let serial = 0;
  const add = (position: Position, role?: Slot['role']) =>
    players.push(
      makePlayer(
        club.country,
        w.seed,
        `${club.id}:takeover:${w.year}:${serial++}`,
        w.year,
        club.strength,
        position,
        undefined,
        club.tier,
        role,
      ),
    );
  for (const slot of uncoveredSlots(players, formationOf(manager.philosophy)))
    add(slot.position, slot.role);
  while (players.filter((p) => lineOf(p.position) === 'GK').length < CLUB_TAKEOVER.goalkeepers)
    add('GK');
  while (players.length < CLUB_TAKEOVER.squad) add(refillPlace(manager.philosophy, players));
  return players;
}

/**
 * The operating expenses of the owner's first season (→ECON-30): `EXPENSE_CONFIG.share` of last
 * season's turnover, the books' income (→ECON-36), never below the division's amount; a club
 * without books, or relegated at the close the world archived last, pays the division's amount.
 */
export function takeoverExpenses(w: World, club: Club, turnover?: string) {
  const floor = operatingExpensesAt(club.country, w.year, club.tier),
    archived = w.history.at(-1),
    lastTier =
      archived?.year === w.year - 1
        ? archived.standings.find((row) => w.clubs[row[0]!]?.id === club.id)?.[1]
        : undefined;
  if (turnover === undefined || (lastTier !== undefined && lastTier < club.tier)) return floor;
  const share = scaleBy(turnover, EXPENSE_CONFIG.share, 10000n);
  return BigInt(share) > BigInt(floor) ? share : floor;
}

/** Why a start's choices cannot stand: the tier, or the traits (→OWNER-2, OWNER-5). */
function checkChoice(choice: Pick<StartChoice, 'tier' | 'traits'>) {
  if (!WEALTH_TIER_IDS.includes(choice.tier))
    throw new Error(sourceMessage('copy.takeover.49aba94987'));
  if (
    choice.traits.length > OWNER_TRAIT_LIMIT ||
    new Set(choice.traits).size !== choice.traits.length ||
    choice.traits.some((trait) => !OWNER_TRAIT_IDS.includes(trait))
  )
    throw new Error(sourceMessage('copy.takeover.b9a9035cad'));
}

/**
 * The owner takes `clubId` over on the first day of a season nobody owns a club in (→WORLD-13),
 * with the start's tier and traits and the direction `preset` chosen at the takeover (→WEB-15;
 * absent is 기본 방향). It refuses a club that is not for sale or that the tier's fortune does not
 * pay for. With `release` on, the full match model records the career from the takeover
 * (→SAVE-23), as at a founding.
 */
export function takeOver(
  w: World,
  clubId: string,
  choice: Pick<StartChoice, 'tier' | 'traits'>,
  preset?: string,
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): World {
  if (hasOwner(w)) throw new Error(sourceMessage('copy.takeover.681e15ae2f'));
  if (w.round !== 0 || currentDay(w) !== 0)
    throw new Error(sourceMessage('copy.takeover.d5938c0c2f'));
  checkChoice(choice);
  if (preset !== undefined && !presetById(preset))
    throw new Error(sourceMessage('copy.presets.c7db97e536'));
  const priced = pricedClubs(w),
    bought = priced.find((entry) => entry.club.id === clubId);
  if (!bought) throw new Error(sourceMessage('copy.host.fd5ef98e05'));
  const club = bought.club,
    code = club.country,
    year = w.year;
  const fortunePounds = tierFortune(w, choice.tier, priced);
  if (!pays(w, bought, fortunePounds)) throw new Error(sourceMessage('copy.takeover.ff34635620'));
  const fortune = fromPounds(code, year, fortunePounds),
    price = bought.price;
  // What the club stands at while nobody owns it, read before it becomes the owner's.
  const stage = facilityStage(w, club),
    following = clubFollowing(w, club),
    books = club.books,
    cash = books && BigInt(books.cash) > 0n ? books.cash : '0',
    debt = books && BigInt(books.debt) > 0n ? books.debt : '0',
    last = books?.seasons.find((season) => season.year < year),
    // Its last season's income in the money of the season taken over (→ECON-6): the turnover
    // the first season's expenses and 팬 민심 read until the owner's own season closes.
    lastIncome = last && (currencyChange(code, last.year, year)?.(last.income) ?? last.income),
    roster = clubPlayers(w, club);

  w.playerClub = club.id;
  if (w.squads) delete w.squads[club.id];
  invalidateNpcSquad(w, club.id);
  // The manager stays with his school, style and level (→OWNER-4); his formation is the squad's.
  const manager: Manager = clubManager(w, club);
  w.manager = { ...manager };
  w.tactic = manager.philosophy;
  const players = takenSquad(w, club, roster, manager);
  for (const p of players) {
    p.status = 'active';
    p.fatigue = 0;
    p.clauses = settleClauses(w.seed, p, p.agent!, year, 0);
    // Every player taken over starts at the club's 조직력 (→OWNER-4, LEAGUE-12).
    joinClub(p, 'founding', year);
    if (club.cohesion !== undefined) p.adaptation = club.cohesion;
  }
  w.players = players;
  for (const p of players)
    if (p.qualities) {
      retainPerson(w, p, club.id, true);
      openEmployment(w, p.id, 'player', club.id);
    }
  // The club is the owner's now: its books, 조직력 and project were a club nobody owns's, and
  // so were its coaches, who leave as the owner's staff starts as a new club's (→OWNER-4).
  for (const { person, job } of activeCoachingEmployment(w))
    if (job.club === club.id) closeEmployment(w, person.id, job.role);
  delete club.books;
  delete club.cohesion;
  delete club.project;
  club.fans = following;

  w.cash = cash;
  w.income = '0';
  w.expense = '0';
  w.currency = currency(code, year).code;
  w.priceIndex = priceIndex(code, year).value;
  w.operatingExpenses = takeoverExpenses(w, club, lastIncome);
  w.stadium = stage.stadium;
  w.trainingGround = stage.trainingGround;
  w.academyFacility = stage.academyFacility;
  delete w.facilityWorks;
  w.ticket = DEFAULT_TICKET;
  w.campaigns = [];
  for (const key of [
    'sponsors',
    'build',
    'policy',
    'direction',
    'localBase',
    'globalReach',
  ] as const)
    delete w[key];
  w.ownMatches = [];
  w.receiptIds = [];

  const owner: OwnerState = {
    tier: choice.tier,
    traits: [...choice.traits],
    fortune: (BigInt(fortune) - BigInt(price)).toString(),
    stake: OWNER_BUSINESS.stake.start,
    dividendShare: OWNER_DIVIDEND.start,
    fanMood: FAN_MOOD.start,
    ffpInjections: [],
    takeover: {
      year,
      clubId: club.id,
      price,
      debt,
      fortune,
      currency: w.currency,
      ...(lastIncome !== undefined ? { lastIncome } : {}),
    },
    seasonRecords: [],
  };
  w.owner = owner;
  // The career is this owner's: the same seed and decade make the same world for any club, so the
  // career's ID names the season, the club and the start (→SAVE-14's slots tell games apart).
  w.id = `world:${hash(`${w.seed}:${year}:${club.id}:${choice.tier}:${choice.traits.join(',')}`)}`;
  if (BigInt(debt) > 0n) w.loan = takeoverLoan(debt);
  else delete w.loan;
  // The owner's era starts with the takeover (→HIST-5).
  w.events = [];
  addEvent(
    w,
    'takeover',
    sourceMessage('copy.takeover.12c307b7f9'),
    sourceMessage('copy.takeover.aa7fe12572', {
      p0: club.name,
      p1: country(code).name,
      p2: divisionLabel(club.tier),
    }),
    price,
  );

  // The season as the owner's club plays it: its league's table, scorers and snapshots, its cups
  // and Europe, drawn again on the same first day with nothing played (→LEAGUE-11).
  delete w.rankHistory;
  delete w.scorerSeason;
  prepareSeason(w, true, false);
  // Then the founding's own-club steps (→OWNER-4): identities, the staff a new club has, an
  // empty academy, the default responsibilities, the direction, the summer window's shortlist,
  // the match model's coverage and own-manager attribution.
  installMissingIdentities(w);
  w.staff = basicStaff(w);
  w.academy = { players: [] };
  w.settings = defaultSettings();
  w.bids = [];
  w.inbox = [];
  w.morale = MORALE_START;
  // The world before kept no free agent: the season's candidates open the market (→STAFF-17),
  // and the season's opening pools the staff markets (→STAFF-49).
  openManagerMarket(w);
  openStaffMarket(w);
  foundWithPreset(w, preset);
  openShortlistWindow(w);
  activateMatchModel(w, release);
  // The takeover is the career's founding moment (→OWNER-4, SAVE-23): a model the world before it
  // ran since 1930 is tracked from today, as at a founding, and so is the manager's history.
  if (w.matchModel) {
    const trackedFrom = trackingBoundary(w);
    w.matchModel = {
      ...w.matchModel,
      activated: { year, day: currentDay(w), revision: w.revision },
      trackedFrom,
      coverage: 'founding',
    };
    if (w.npcSeason) w.npcSeason = { ...w.npcSeason, trackedFrom };
  }
  delete w.managerHistory;
  ensureManagerHistory(w, true);
  return w;
}
