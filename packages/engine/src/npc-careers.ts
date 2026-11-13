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
import { developAnnually, settlePlayerGrowth } from './training';
import {
  clubById,
  generatedPlayer,
  invalidateNpcSquad,
  invalidateNpcSquads,
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
  // New slices invalidate cached OVRs without choosing any of the stored eighteen again.
  invalidateNpcSquads(w);
  w.npcGrowthAt = { year: w.year, round: w.round };
}

function lacksLine(players: Player[]) {
  return (Object.keys(LINE_MINIMUM) as (keyof typeof LINE_MINIMUM)[]).some(
    (line) => players.filter((p) => lineOf(p.position) === line).length < LINE_MINIMUM[line],
  );
}

/** Academy draws alone can produce a golden generation, with no club-level event. */
export function intakeNpcYouth(w: World, c: Club, year = w.year + 1) {
  const players = w.squads?.[c.id];
  if (!players || !c.levels) return;
  const config = NPC_YOUTH.byAcademy[c.levels.academy]!;
  let added = 0;
  const used = new Set(players.map((p) => p.id));
  for (
    let serial = 0;
    added < config.count || players.length < NPC_SQUAD.size || lacksLine(players);
    serial++
  ) {
    const state = clubRegistration(c, year, players);
    if (state.total >= state.ceiling) break;
    const id = `${c.id}:y:${year}:${serial}`;
    if (used.has(id) || w.people?.[id] || w.freeAgents?.some((p) => p.id === id)) continue;
    const r = random(`${w.seed}:youth:${id}`);
    const age = integer(r, NPC_YOUTH.ages[0], NPC_YOUTH.ages[1]);
    const potential = integer(r, config.potential[0], config.potential[1]);
    const level = clamp(potential - integer(r, NPC_YOUTH.headroom[0], NPC_YOUTH.headroom[1]), 15, 92);
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
    enrollSquadPlayer(w, c, p);
    added++;
  }
}

/**
 * Both closes enter here after season lines, books and promotion. Later tasks plug contract and
 * market steps into this one sequence. A skipped summer has no match growth or free-agent step.
 */
export function closeNpcSummer(w: World, afterRetirements?: () => void, matches = true) {
  if (w.npcSummerAt !== undefined && w.npcSummerAt >= w.year) return;
  foundSquads(w);
  if (matches) settleNpcGrowth(w);
  // Normal play already made this decision on 1 April; old checkpoints and skipped summers use
  // the very same date and stream, not a second draw at the close.
  atCareerDate(w, { year: w.year, day: retirementAnnounceDay(w.year) }, () =>
    announceNpcRetirements(w),
  );
  for (const [id, players] of Object.entries(w.squads ?? {})) {
    const c = clubById(w, id);
    if (!c?.levels) continue;
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
      const retirement = person?.retirement?.year ?? p.retiring;
      const retire =
        person?.playing === 'retired' ||
        (retirement !== undefined && retirement <= w.year) ||
        w.year + 1 - p.born >= RETIREMENT.lastAge;
      if (retire && person) retirePerson(w, person, false);
      return !retire;
    });
  }
  afterRetirements?.();
  for (const id of Object.keys(w.squads ?? {})) {
    const c = clubById(w, id);
    if (!c) continue;
    intakeNpcYouth(w, c);
    invalidateNpcSquad(w, id);
  }
  w.npcSummerAt = w.year;
}
