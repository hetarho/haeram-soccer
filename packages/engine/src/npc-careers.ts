import { retirePlayerRecord, settleAbsentPlayerRecords } from './player-records';
import { recordRetirementNews } from './news';
/** The shared summer of every playable club nobody owns (→WORLD-16). */
import type { Club, Player, World } from '../../contracts/src/types';
import { atCareerDate } from './person-careers';
import { announceNpcRetirements, RETIREMENT, retirePerson, retirementAnnounceDay } from './careers';
import { TRAINING_GROUND } from './facility-model';
import { clubManager } from './managerMarket';
import { CLUB_LEVELS, enrollSquadPlayer, foundSquads } from './persisted-squads';
import { lineOf, mainOvr } from './player';
import { clamp, integer, random } from './primitives';
import { clubRegistration, registrationExempt } from './registration';
import { departmentMultiplier } from './staff';
import { clubStyle } from './tactics';
import { marketWageAt } from './market-prices';
import { npcCanPay } from './books';
import {
  capFreeAgents,
  closeFreeAgents,
  joinFreeAgents,
  npcContractTerm,
  refreshFreeAgents,
} from './free-agents';
import { SQUAD_MINIMUM } from './squad-size';
import { compareIds } from './primitives';
import { currentDay } from './calendar';
import { transferWindowDays } from './transfer-window';
import { npcNeedsRefill, returnNpcLoans } from './npc-market';
import { developAnnually, settlePlayerGrowth } from './training';
import {
  clubById,
  generatedPlayer,
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

/** Starting calibration; T866 measures the division and century distributions. */
export const NPC_YOUTH = {
  ages: [17, 18],
  byAcademy: [
    { count: 2, potential: [44, 65] },
    { count: 2, potential: [54, 75] },
    { count: 3, potential: [64, 85] },
    { count: 3, potential: [74, 95] },
    { count: 4, potential: [78, 99] },
    { count: 5, potential: [83, 99] },
  ],
  headroom: [12, 24],
} as const;

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
export function intakeNpcYouth(w: World, c: Club, year = w.year + 1, used = npcYouthIds(w)) {
  const players = w.squads?.[c.id];
  if (!players || !c.levels) return;
  const config = NPC_YOUTH.byAcademy[c.levels.academy]!;
  let added = 0;
  for (
    let serial = 0;
    added < config.count || players.length < NPC_SQUAD.size || lacksLine(players);
    serial++
  ) {
    const state = clubRegistration(c, year, players);
    if (state.total >= state.ceiling) break;
    const id = `${c.id}:y:${year}:${serial}`;
    if (used.has(id)) continue;
    const r = random(`${w.seed}:youth:${id}`);
    const age = integer(r, NPC_YOUTH.ages[0], NPC_YOUTH.ages[1]);
    const potential = integer(r, config.potential[0], config.potential[1]);
    const level = clamp(
      potential - integer(r, NPC_YOUTH.headroom[0], NPC_YOUTH.headroom[1]),
      15,
      92,
    );
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
    p.potential = Math.max(mainOvr(p), potential);
    p.graduate = true;
    p.joined = year;
    p.fatigue = clubStyle(c) === 'press' ? PRESS_LOAD_FATIGUE : 0;
    p.until = year + integer(random(`${w.seed}:${id}:contract`), 1, 5);
    if (!registrationExempt(state.rule, year, p) && state.counted >= state.allowed) break;
    players.push(p);
    used.add(p.id);
    enrollSquadPlayer(w, c, p);
    added++;
  }
}

/** Needed expiring players renew at their new division's wage; the rest leave as themselves. */
export function renewNpcContracts(w: World, c: Club, year = w.year + 1) {
  const players = w.squads?.[c.id];
  if (!players) return;
  const xi = new Set(startingSquad(w, c).map((p) => p.id));
  const expiring = players
    .filter((p) => p.until < year)
    .sort(
      (a, b) =>
        Number(xi.has(b.id)) - Number(xi.has(a.id)) ||
        mainOvr(b) - mainOvr(a) ||
        compareIds(a.id, b.id),
    );
  // Release surplus first, so its old contracts do not consume the renewal budget.
  const renewing: Player[] = [];
  for (const p of [...expiring].reverse()) {
    const current = w.squads![c.id]!;
    const line = lineOf(p.position);
    const needed =
      xi.has(p.id) ||
      current.length <= SQUAD_MINIMUM ||
      current.filter((q) => lineOf(q.position) === line).length <= LINE_MINIMUM[line];
    if (needed) renewing.push(p);
    else joinFreeAgents(w, p, year);
  }
  for (const p of renewing.reverse()) {
    const wage = marketWageAt(c.country, year, c.tier, p);
    if (npcCanPay(w, c, wage, p.id, year)) {
      p.wage = wage;
      p.until = year + npcContractTerm(year - p.born) - 1;
      const job = w.people?.[p.id]?.employment.find((j) => j.role === 'player' && !j.to);
      if (job) job.contractUntil = { year: p.until, day: 365 };
    } else joinFreeAgents(w, p, year);
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
    for (const p of players)
      developAnnually(w, p, {
        year: w.year + 1,
        youth: manager.youth,
        ground: TRAINING_GROUND[c.levels.ground]!.growth,
        adaptation: c.cohesion ?? 0.8,
        report: false,
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
    intakeNpcYouth(w, c, w.year + 1, used);
    invalidateNpcSquad(w, id);
  }
  if (matches) capFreeAgents(w);
  settleAbsentPlayerRecords(w);
  w.npcSummerAt = w.year;
}
