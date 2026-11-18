import { renewalAnswer, renewalContext, RENEWAL } from './renewal-answer';
import { pruneRenewalBids } from './renewal-bids';
import { retirePlayerRecord, settleAbsentPlayerRecords } from './player-records';
import { recordRetirementNews } from './news';
/** The shared summer of every playable club nobody owns (→WORLD-16). */
import type { Club, Player, World } from '../../contracts/src/types';
import { atCareerDate } from './person-careers';
import { announceNpcRetirements, RETIREMENT, retirePerson, retirementAnnounceDay } from './careers';
import { TRAINING_GROUND } from './facility-model';
import { clubManager } from './managerMarket';
import { CLUB_LEVELS, enrollSquadPlayer, followLevels, foundSquads } from './persisted-squads';
import { lineOf, mainOvr } from './player';
import { clamp, integer, random } from './primitives';
import { CLUB_TAKEOVER } from './owner-config';
import { drawProdigies, landOnOvr } from './prodigies';
import { clubRegistration, registrationExempt } from './registration';
import { departmentMultiplier } from './staff';
import { clubStyle } from './tactics';
import { marketWageAt } from './market-prices';
import { npcCanPay } from './books';
import { capFreeAgents, closeFreeAgents, joinFreeAgents, refreshFreeAgents } from './free-agents';
import { compareIds } from './primitives';
import { currentDay } from './calendar';
import { transferWindowDays } from './transfer-window';
import { npcNeedsRefill, returnNpcLoans } from './npc-market';
import { developAnnually, settlePlayerGrowth } from './training';
import {
  clubById,
  divisionLevel,
  generatedPlayer,
  joinClub,
  invalidateNpcSquad,
  invalidateNpcSquads,
  clubStrength,
  refreshNpcSquads,
  startingSquad,
  LINE_MINIMUM,
  NPC_SQUAD,
  PRESS_LOAD_FATIGUE,
  refillPlace,
} from './world';

/**
 * Youth intakes of clubs nobody owns (→WORLD-16): an academy level's count of youngsters, and any
 * more the standing size or a line needs. Starting values; T950 tunes them.
 */
export const NPC_YOUTH = {
  ages: [17, 18],
  byAcademy: [{ count: 2 }, { count: 2 }, { count: 3 }, { count: 3 }, { count: 4 }, { count: 5 }],
  /** Potential points per academy level above or below its division's ladder value. */
  divisionCentre: 3,
  /**
   * The spread of an intake's potential around its centre, as a quantile table of one uniform
   * draw: most end below it, about a third at or above and about 5% 10 or more above (the
   * anchors sit half a point low, so the rounded potential splits at them).
   */
  skew: [
    [0, -20],
    [2 / 3, -0.5],
    [0.95, 9.5],
    [1, 14],
  ],
  /** A youngster taken only to refill the standing size is centred this far below the level. */
  refillBelow: 10,
  headroom: [12, 24],
  /**
   * A skipped war summer's refill (→WORLD-14/16) is drawn ready to play: aged `ages`, his OVR
   * `below` under the division's level and his potential `headroom` above his OVR (T950: at the
   * level, so the 1946–1951 top divisions restart nearest it).
   */
  warRefill: { ages: [19, 24], below: 0, headroom: 4 },
} as const;

/** The potential offset at quantile `u` of `NPC_YOUTH.skew`, linear between its anchors. */
export function youthSkew(u: number) {
  const table = NPC_YOUTH.skew;
  for (let i = 1; i < table.length; i++) {
    const [u1, v1] = table[i]!;
    if (u <= u1 || i === table.length - 1) {
      const [u0, v0] = table[i - 1]!;
      return v0 + ((v1 - v0) * (Math.min(u, u1) - u0)) / (u1 - u0);
    }
  }
  return 0;
}

/**
 * Where an intake's potential centres (→WORLD-16): its division's level (→WORLD-15), moved
 * `divisionCentre` points for each level its academy stands from its division's ladder value
 * (→WORLD-17); a refill youngster's at the division's bench level, `refillBelow` under it.
 */
export function youthCentre(c: Club, academy: number, refill: boolean) {
  const level = divisionLevel(c.tier);
  if (refill) return level - NPC_YOUTH.refillBelow;
  const ladder = CLUB_TAKEOVER.facilities.division;
  const value = ladder[Math.min(c.tier, ladder.length - 1)]!.academy;
  return level + (academy - value) * NPC_YOUTH.divisionCentre;
}

/** Called at the market cadence and at close; the marker survives a save/load. */
export function settleNpcGrowth(w: World) {
  if (!w.squads || w.round <= 0) return;
  const from = w.npcGrowthAt?.year === w.year ? w.npcGrowthAt.round : 0;
  const rounds = w.round - from;
  if (rounds <= 0) return;
  for (const [id, players] of Object.entries(w.squads)) {
    const c = clubById(w, id);
    if (!c?.levels) continue;
    const manager = clubManager(w, c);
    const coaching = departmentMultiplier(CLUB_LEVELS.coachingAbility[c.levels.coaching]!);
    for (const p of players) {
      if (w.year - p.born >= 27) continue;
      settlePlayerGrowth(
        p,
        {
          age: w.year - p.born,
          youth: manager.youth,
          ground: TRAINING_GROUND[c.levels.ground]!.growth,
          focus: 'balanced',
          adaptation: c.cohesion ?? 0.8,
        },
        rounds,
        () => coaching,
      );
    }
  }
  // Growth refreshes the held XI's rating without changing the stored matchday choice.
  invalidateNpcSquads(w);
  for (const c of w.clubs) clubStrength(w, c);
  w.npcGrowthAt = { year: w.year, round: w.round };
}

function lacksLine(players: Player[]) {
  return (Object.keys(LINE_MINIMUM) as (keyof typeof LINE_MINIMUM)[]).some(
    (line) => players.filter((p) => lineOf(p.position) === line).length < LINE_MINIMUM[line],
  );
}

/**
 * A youngster's age, OVR and potential (→WORLD-16). An intake's come from its youth stream: the
 * potential around its centre, the OVR a headroom below it. A skipped war summer's refill comes
 * ready to play from a stream of its own (`<seed>:war-refill:<id>`), so no other draw moves.
 */
function youthDraw(w: World, c: Club, id: string, refill: boolean, war: boolean) {
  if (war) {
    const { ages, below, headroom } = NPC_YOUTH.warRefill;
    const r = random(`${w.seed}:war-refill:${id}`);
    const level = clamp(divisionLevel(c.tier) - below, 15, 92);
    return { age: integer(r, ages[0], ages[1]), level, potential: clamp(level + headroom, 15, 99) };
  }
  const r = random(`${w.seed}:youth:${id}`);
  const age = integer(r, NPC_YOUTH.ages[0], NPC_YOUTH.ages[1]);
  const centre = youthCentre(c, c.levels!.academy, refill);
  const potential = clamp(Math.round(centre + youthSkew(r())), 15, 99);
  const level = clamp(potential - integer(r, NPC_YOUTH.headroom[0], NPC_YOUTH.headroom[1]), 15, 92);
  return { age, level, potential };
}

/** Academy draws alone can produce a golden generation, with no club-level event. */
function npcYouthIds(w: World) {
  return new Set([
    ...Object.values(w.squads ?? {}).flatMap((players) => players.map((p) => p.id)),
    ...w.players.map((p) => p.id),
    ...(w.academy?.players ?? []).map((p) => p.id),
    ...(w.freeAgents ?? []).map((p) => p.id),
    ...Object.keys(w.people ?? {}),
    ...Object.keys(w.playerRecords ?? {}),
  ]);
}
/**
 * A club's youth intake (→WORLD-16): its academy's count, then any youngsters its standing size or
 * a line needs. A war-gap summer (`refillOnly`) takes only the refills, ready to play (→WORLD-14).
 */
export function intakeNpcYouth(
  w: World,
  c: Club,
  year = w.year + 1,
  used = npcYouthIds(w),
  refillOnly = false,
) {
  const players = w.squads?.[c.id];
  if (!players || !c.levels) return;
  const count = refillOnly ? 0 : NPC_YOUTH.byAcademy[c.levels.academy]!.count;
  let added = 0;
  for (
    let serial = 0;
    added < count || players.length < NPC_SQUAD.size || lacksLine(players);
    serial++
  ) {
    const state = clubRegistration(c, year, players);
    if (state.total >= state.ceiling) break;
    const id = `${c.id}:y:${year}:${serial}`;
    if (used.has(id)) continue;
    const { age, level, potential } = youthDraw(w, c, id, added >= count, refillOnly);
    const p = generatedPlayer(
      c.country,
      w.seed,
      id,
      year,
      level,
      refillPlace(clubStyle(c), players),
      age,
      c.tier,
    );
    // A war refill's OVR lands on its drawn value, as a prodigy's does (→WORLD-18).
    if (refillOnly) landOnOvr(p, level);
    p.potential = Math.max(mainOvr(p), potential);
    // Its wage is quoted on that final OVR and potential: a young player's quote reads both.
    if (refillOnly) p.wage = marketWageAt(c.country, year, c.tier, p);
    joinClub(p, 'academy', year);
    p.fatigue = clubStyle(c) === 'press' ? PRESS_LOAD_FATIGUE : 0;
    p.until = year + integer(random(`${w.seed}:${id}:contract`), 1, 5);
    if (!registrationExempt(state.rule, year, p) && state.counted >= state.allowed) break;
    players.push(p);
    used.add(p.id);
    enrollSquadPlayer(w, c, p);
    added++;
  }
}

/** Scoped observation only: immutable facts, never live club/player objects. */
export const NPC_RENEWAL_FLOW: {
  observe?: (
    event: Readonly<{
      club: string;
      kind: 'offered' | 'accepted' | 'refused' | 'releasedUnoffered';
    }>,
  ) => void;
} = {};
const renewalEvent = (
  club: string,
  kind: Parameters<NonNullable<typeof NPC_RENEWAL_FLOW.observe>>[0]['kind'],
) => NPC_RENEWAL_FLOW.observe?.(Object.freeze({ club, kind }));

/** The close offers needed expiring players terms; only an actually expired contract is released. */
export function renewNpcContracts(w: World, c: Club, year = w.year + 1) {
  const players = w.squads?.[c.id];
  if (!players) return;
  for (const p of players) pruneRenewalBids(w, p, c);
  const xi = new Set(startingSquad(w, c).map((p) => p.id));
  const cover = new Set<string>();
  const counts = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const p of players) if (xi.has(p.id)) counts[lineOf(p.position)]++;
  for (const p of players) {
    const line = lineOf(p.position);
    if (!xi.has(p.id) && counts[line] < LINE_MINIMUM[line]) {
      cover.add(p.id);
      counts[line]++;
    }
  }
  const expiring = players
    .filter((p) => p.until < year)
    .sort(
      (a, b) =>
        Number(xi.has(b.id)) - Number(xi.has(a.id)) ||
        mainOvr(b) - mainOvr(a) ||
        compareIds(a.id, b.id),
    );
  const renewing: Player[] = [];
  for (const p of expiring) {
    const needed =
      xi.has(p.id) ||
      cover.has(p.id) ||
      (year - p.born <= RENEWAL.prospectAge &&
        p.potential >= divisionLevel(c.tier) + RENEWAL.prospectAbove);
    if (needed) renewing.push(p);
    else {
      joinFreeAgents(w, p, year, c.id);
      renewalEvent(c.id, 'releasedUnoffered');
    }
  }
  for (const p of renewing) {
    const wage = marketWageAt(c.country, year, c.tier, p);
    if (!npcCanPay(w, c, wage, p.id, year)) {
      joinFreeAgents(w, p, year, c.id);
      renewalEvent(c.id, 'releasedUnoffered');
      continue;
    }
    renewalEvent(c.id, 'offered');
    const answer = renewalAnswer(w, p, renewalContext(w, c, p, wage, wage, year));
    renewalEvent(c.id, answer.accept ? 'accepted' : 'refused');
    if (!answer.accept) {
      joinFreeAgents(w, p, year, c.id);
      continue;
    }
    p.wage = wage;
    const term = year - p.born >= RENEWAL.veteranTermAge ? 1 : RENEWAL.maxTerm;
    p.until = year + term - 1;
    const job = w.people?.[p.id]?.employment.find((j) => j.role === 'player' && !j.to);
    if (job) job.contractUntil = { year: p.until, day: 365 };
  }
}

/** Both worlds close the same windows; the summer safety net uses the existing youth intake. */
export function closeNpcWindow(w: World) {
  const day = currentDay(w),
    dates = transferWindowDays(w.year);
  let used: Set<string> | undefined;
  if (day === dates.summerClose)
    for (const c of w.clubs)
      if (c.id !== w.playerClub && !c.representative && w.squads?.[c.id] && npcNeedsRefill(w, c))
        intakeNpcYouth(w, c, w.year, (used ??= npcYouthIds(w)));
  if (day === dates.summerClose || day === dates.winterClose) refreshNpcSquads(w);
}

/** Both closes share development, retirement, contracts, free signings, youth and the final cap. */
export function closeNpcSummer(w: World, afterRetirements?: () => void, matches = true) {
  if (w.npcSummerAt !== undefined && w.npcSummerAt >= w.year) return;
  foundSquads(w);
  // Promotion and relegation are known: the levels follow the division each club plays next
  // (→WORLD-17), before the season's development and the intake read them.
  if (matches) for (const c of w.clubs) if (w.squads?.[c.id]) followLevels(w, c);
  if (matches) settleNpcGrowth(w);
  // Normal play already made this decision on 1 April; old checkpoints and skipped summers use
  // the very same date and stream, not a second draw at the close.
  atCareerDate(w, { year: w.year, day: retirementAnnounceDay(w.year) }, () =>
    announceNpcRetirements(w),
  );
  const retiring = (p: Player) => {
    const person = w.people?.[p.id];
    const year = person?.retirement?.year ?? p.retiring;
    return (
      person?.playing === 'retired' ||
      (year !== undefined && year <= w.year) ||
      w.year + 1 - p.born >= RETIREMENT.lastAge
    );
  };
  for (const [id, players] of Object.entries(w.squads ?? {})) {
    const c = clubById(w, id);
    if (!c?.levels) continue;
    for (const p of players)
      if (retiring(p) && retirePlayerRecord(w, p, id)) recordRetirementNews(w, p, id);
    const manager = clubManager(w, c);
    // A skipped summer's development stands for its whole season, which has no rounds, so a
    // prodigy's rule reads his age in that season (→WORLD-14, PLAYER-15).
    for (const p of players)
      developAnnually(w, p, {
        year: w.year + 1,
        youth: manager.youth,
        ground: TRAINING_GROUND[c.levels.ground]!.growth,
        adaptation: c.cohesion ?? 0.8,
        report: false,
        season: matches ? undefined : w.year,
      });
  }
  for (const [id, players] of Object.entries(w.squads ?? {})) {
    w.squads![id] = players.filter((p) => {
      const person = w.people?.[p.id];
      const retire = retiring(p);
      if (retire && person) retirePerson(w, person, false);
      return !retire;
    });
  }
  if (matches) returnNpcLoans(w);
  refreshNpcSquads(w);
  closeFreeAgents(w, w.year);
  if (matches) {
    for (const c of w.clubs)
      if (c.id !== w.playerClub && !c.representative) renewNpcContracts(w, c);
    refreshFreeAgents(w, w.year + 1);
  }
  afterRetirements?.();
  const used = npcYouthIds(w);
  for (const id of Object.keys(w.squads ?? {})) {
    const c = clubById(w, id);
    if (!c) continue;
    // A skipped war summer brings youth only to the standing size (→WORLD-14/16).
    intakeNpcYouth(w, c, w.year + 1, used, !matches);
    invalidateNpcSquad(w, id);
  }
  // Every summer, a skipped one included, draws its one or two prodigies after the intake: the
  // war refill limit bounds youth, not them (→WORLD-14/16/18).
  drawProdigies(w);
  if (matches) capFreeAgents(w);
  settleAbsentPlayerRecords(w);
  w.npcSummerAt = w.year;
}
