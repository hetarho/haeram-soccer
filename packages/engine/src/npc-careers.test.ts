import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { emptyPlayerDetail } from '../../contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import { announceRetirements, retirementAnnounceDay, retirementChanceWithContext } from './careers';
import { worldMarketFixture } from './world-market.testkit';
import { CLUB_LEVELS, enrollSquadPlayer, foundSquads } from './persisted-squads';
import { closeNpcSummer, intakeNpcYouth, NPC_YOUTH, settleNpcGrowth } from './npc-careers';
import { clubManager } from './managerMarket';
import { clubPlayers, rating, ratingOf, squad, startingSquad, NPC_SQUAD, LINE_MINIMUM } from './world';
import { lineOf, mainOvr } from './player';
import { random, zeroMetrics } from './primitives';
import { clubRegistration } from './registration';
import { crossWar } from './wartime';
import { TRAINING_GROUND } from './facility-model';
import { developAnnually, settlePlayerGrowth, settleTraining } from './training';
import { staffEffects } from './staff';
import { policyEffects, policyOf } from './policy';
import { managerStyleEffects } from './styles';
import { buildEffects } from './build';
import { coachingGrade } from './aptitude';

/** One persisted 22-player squad, no world generation, fixtures or season simulation. */
function fixture(year = 1950) {
  const w = worldMarketFixture();
  w.year = year;
  w.clubs[2]!.representative = true;
  foundSquads(w);
  const c = w.clubs[1]!;
  w.people = {};
  for (const p of w.squads![c.id]!) {
    p.born = year - 18;
    p.potential = 90;
  }
  return { w, c, players: w.squads![c.id]! };
}

describe('persisted NPC careers on isolated squads', () => {
  it('founds levels once, including an existing squad with missing levels', () => {
    const { w, c } = fixture();
    const stage = CLUB_LEVELS.founding(w, c);
    expect(c.levels).toEqual({
      academy: stage.academyFacility,
      ground: stage.trainingGround,
      coaching: stage.trainingGround,
    });
    c.levels!.academy = 5;
    const original = w.squads;
    foundSquads(w);
    expect(c.levels!.academy).toBe(5);
    delete c.levels;
    foundSquads(w);
    expect(c.levels!.academy).toBe(stage.academyFacility);
    expect(w.squads).toBe(original);
    expect(w.clubs[0]!.levels).toBeUndefined();
    expect(w.clubs[2]!.levels).toBeUndefined();
  });

  it('settles four rounds exactly like four single rounds, once across a JSON reload', () => {
    const { w, c } = fixture();
    const single = structuredClone(w);
    for (let round = 1; round <= 4; round++) {
      single.round = round;
      settleNpcGrowth(single);
    }
    const before = structuredClone(w.squads);
    w.round = 4;
    settleNpcGrowth(w);
    expect(w.squads).toEqual(single.squads);
    expect(w.squads).not.toEqual(before);
    expect(w.squads![c.id]!.map((p) => p.id).sort()).toEqual(before![c.id]!.map((p) => p.id).sort());
    const saved = JSON.parse(JSON.stringify(w)) as typeof w;
    settleNpcGrowth(saved);
    expect(saved.squads).toEqual(w.squads);
    saved.round = 5;
    settleNpcGrowth(saved);
    expect(saved.squads).not.toEqual(w.squads);
  });

  it('chooses again and invalidates cached ratings when attributes change', () => {
    const { w, c, players } = fixture();
    c.cohesion = 1;
    for (const p of players) {
      p.potential = 99;
      for (const a of ATTRIBUTES) p.attrs[a] = 35;
    }
    const ids = squad(w, c).map((p) => p.id);
    const before = rating(w, c);
    const held = startingSquad(w, c);
    const xi = held.map((p) => p.id);
    expect(ratingOf(w, c, held)).toBe(before);
    w.round = 46;
    settleNpcGrowth(w);
    expect(rating(w, c)).toBeGreaterThan(before);
    expect(ratingOf(w, c, held)).toBeGreaterThan(before);
    expect(squad(w, c)).toHaveLength(ids.length);
    expect(startingSquad(w, c)).toHaveLength(xi.length);
    expect(clubPlayers(w, c).find((p) => p.id === players[0]!.id)!.attrs).toEqual(players[0]!.attrs);
  });

  it('uses club cohesion for potential overshoot and leaves stored adaptation alone', () => {
    const low = fixture(),
      high = fixture();
    for (const { w, c, players } of [low, high]) {
      c.levels = { academy: 5, ground: 5, coaching: 5 };
      for (const p of players) {
        p.potential = mainOvr(p);
        p.adaptation = 0.3;
      }
      w.round = 46;
    }
    low.c.cohesion = 0.8;
    high.c.cohesion = 0.95;
    settleNpcGrowth(low.w);
    settleNpcGrowth(high.w);
    expect(mainOvr(low.players[0]!)).toBe(low.players[0]!.potential);
    expect(mainOvr(high.players[0]!)).toBeGreaterThan(high.players[0]!.potential);
    expect(high.players[0]!.adaptation).toBe(0.3);
  });

  it('shares the owner round formula without changing the owner training result', () => {
    const w = worldMarketFixture(),
      p = w.players[0]!;
    p.born = w.year - 18;
    p.fatigue = 20;
    p.potential = 95;
    w.players = [p];
    const expected = structuredClone(p);
    const staff = staffEffects(w),
      style = managerStyleEffects(w);
    settlePlayerGrowth(
      expected,
      {
        age: 18,
        youth: w.manager.youth,
        ground: TRAINING_GROUND[w.trainingGround]!.growth,
        focus: 'balanced',
        investment: policyEffects(policyOf(w)).developmentMultiplier,
        style: style.growth,
        youthDevelopment: staff.youthDevelopment * style.youthGrowth * buildEffects(w).youthGrowth,
      },
      1,
      (a) => staff.development[a],
    );
    w.round = 1;
    settleTraining(w);
    expect(p.attrs).toEqual(expected.attrs);
    expect(p.developed).toBe(expected.developed);
  });

  it('develops youth and ages a 33-year-old once at the close with the shared annual math', () => {
    const { w, c, players } = fixture();
    const young = players[0]!,
      veteran = players[1]!;
    veteran.born = w.year - 33;
    const beforeYoung = mainOvr(young),
      beforeSpeed = veteran.attrs.pace;
    const expected = structuredClone(young);
    const manager = clubManager(w, c);
    w.round = 46;
    settleNpcGrowth(w);
    Object.assign(expected, structuredClone(young));
    developAnnually(w, expected, {
      year: w.year + 1,
      youth: manager.youth,
      ground: TRAINING_GROUND[c.levels!.ground]!.growth,
      adaptation: c.cohesion ?? 0.8,
      report: false,
    });
    closeNpcSummer(w);
    expect(young.attrs).toEqual(expected.attrs);
    expect(young.potential).toBe(expected.potential);
    expect(mainOvr(young)).toBeGreaterThan(beforeYoung);
    expect(veteran.attrs.pace).toBeLessThan(beforeSpeed);
    const before = structuredClone(w.squads);
    closeNpcSummer(w);
    expect(w.squads).toEqual(before);
    expect(w.events).toEqual([]);
    expect(w.inbox ?? []).toEqual([]);
  });

  it('makes one April decision from the fixed stream and records the same registered decision', () => {
    const { w, c, players } = fixture();
    const p = players[0]!;
    p.born = w.year - 35;
    p.personality.professionalism = 5;
    p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    enrollSquadPlayer(w, c, p);
    const chance = retirementChanceWithContext(w.year, p.born, p.position);
    const expected = random(`${w.seed}:retire:${p.id}:${w.year}`)() < chance;
    w.calendar = { day: retirementAnnounceDay(w.year) - 1 };
    announceRetirements(w);
    expect(p.retiring).toBeUndefined();
    w.calendar.day++;
    announceRetirements(w);
    expect(p.retiring === w.year).toBe(expected);
    expect(w.people![p.id]!.retirement?.year === w.year).toBe(expected);
    const before = structuredClone(w.people);
    // A second read/settlement may not reinterpret absent minutes or draw again.
    announceRetirements(w);
    expect(w.people).toEqual(before);
    expect(w.events).toEqual([]);
    expect(w.inbox ?? []).toEqual([]);
  });

  it('caps even keepers at 41 and admits a qualifying retiree to coaching', () => {
    const { w, c, players } = fixture();
    const p = players.find((p) => p.position === 'GK')!;
    p.born = w.year - 40;
    p.personality.professionalism = 5;
    p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    for (let n = 0; random(`${w.seed}:coaching-intention:${p.id}`)() >= 0.8; n++)
      w.seed = `coaching-${n}`;
    enrollSquadPlayer(w, c, p);
    w.calendar = { day: retirementAnnounceDay(w.year) };
    announceRetirements(w);
    expect(p.retiring).toBe(w.year);
    expect(players).toContain(p);
    closeNpcSummer(w);
    expect(w.squads![c.id]!.some((q) => q.id === p.id)).toBe(false);
    expect(w.people![p.id]).toMatchObject({
      playing: 'retired',
      born: p.born,
      name: p.name,
      retirement: { year: w.year },
      coaching: { role: 'goalkeeping' },
    });
  });

  it('uses aggregate minutes and the starter factor only for players named in the ledger', () => {
    const { w, c, players } = fixture();
    const named = players.slice(4, 6),
      unknown = players[6]!;
    for (const p of [...named, unknown]) p.born = w.year - 32;
    for (const a of ATTRIBUTES) named[0]!.attrs[a] = 70;
    w.npcSeason = {
      year: w.year,
      model: MATCH_MODEL_REVISION,
      trackedFrom: { year: w.year, day: 1, round: 1 },
      competitions: [
        {
          kind: 'league',
          groupKey: 'ESP:0:0',
          clubs: [],
          players: named.map((p, i) => {
            const metrics = zeroMetrics();
            metrics[10] = i ? 100 : 2000;
            return {
              id: p.id,
              name: p.name,
              position: p.position,
              clubs: [
                {
                  club: c.id,
                  appearances: 24,
                  starts: i ? 0 : 24,
                  metrics,
                  detail: emptyPlayerDetail(),
                },
              ],
            };
          }),
        },
      ],
    };
    // Make the known low-minute player a non-starter, without changing his identity.
    const spare = players[20]!;
    [players[5], players[20]] = [spare, named[1]!];
    w.calendar = { day: retirementAnnounceDay(w.year) };
    announceRetirements(w);
    for (const [p, context] of [
      [named[0]!, { minutes: 2000, strongStarter: mainOvr(named[0]!) >= 60 }],
      [named[1]!, { minutes: 100 }],
      [unknown, {}],
    ] as const) {
      const chance = retirementChanceWithContext(w.year, p.born, p.position, context);
      expect(p.retiring === w.year).toBe(random(`${w.seed}:retire:${p.id}:${w.year}`)() < chance);
    }
  });

  it('refills size, keepers and each line from unique academy draws within registration limits', () => {
    const { w, c } = fixture();
    w.squads![c.id] = [];
    intakeNpcYouth(w, c);
    const players = w.squads![c.id]!;
    expect(players.length).toBeGreaterThanOrEqual(NPC_SQUAD.size);
    for (const line of Object.keys(LINE_MINIMUM) as (keyof typeof LINE_MINIMUM)[])
      expect(players.filter((p) => lineOf(p.position) === line).length).toBeGreaterThanOrEqual(
        LINE_MINIMUM[line],
      );
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    for (const p of players) {
      expect(p.id).toMatch(new RegExp(`^${c.id}:y:${w.year + 1}:\\d+$`));
      expect([17, 18]).toContain(w.year + 1 - p.born);
      expect(p.potential).toBeGreaterThanOrEqual(NPC_YOUTH.byAcademy[c.levels!.academy]!.potential[0]);
      expect(p.potential).toBeLessThanOrEqual(NPC_YOUTH.byAcademy[c.levels!.academy]!.potential[1]);
      if ((coachingGrade(p) ?? 0) >= 4)
        expect(w.people![p.id]).toMatchObject({ id: p.id, born: p.born, name: p.name, club: c.id });
    }
    expect(players.some((p) => (coachingGrade(p) ?? 0) >= 4)).toBe(true);
    const state = clubRegistration(c, w.year + 1, players);
    expect(state.counted).toBeLessThanOrEqual(state.allowed);
    while (players.length < state.ceiling)
      players.push({ ...players[0]!, id: `extra-${players.length}` });
    intakeNpcYouth(w, c);
    expect(players).toHaveLength(state.ceiling);
  });

  it('orders development, retirement, the contract hook and youth once in the shared summer', () => {
    const { w, c, players } = fixture();
    const retiring = players[0]!,
      young = players[1]!;
    retiring.born = w.year - 40;
    const before = structuredClone(young.attrs);
    let calls = 0;
    const contracts = () => {
      calls++;
      expect(young.attrs).not.toEqual(before);
      expect(w.squads![c.id]!.some((p) => p.id === retiring.id)).toBe(false);
      expect(w.squads![c.id]!.some((p) => p.id.startsWith(`${c.id}:y:`))).toBe(false);
    };
    closeNpcSummer(w, contracts);
    expect(w.squads![c.id]!.some((p) => p.id.startsWith(`${c.id}:y:`))).toBe(true);
    closeNpcSummer(w, contracts);
    expect(calls).toBe(1);
  });

  it('lives seven skipped summers without matches, extending only each running contract', () => {
    const { w, c, players } = fixture(1939);
    // Two arrivals per year leave room for all seven intakes without hitting the separate cap.
    c.levels!.academy = 0;
    const p = players[0]!,
      born = p.born,
      until = p.until,
      before = mainOvr(p);
    p.loanUntil = 1941;
    w.playerClub = '';
    w.players = [];
    w.year = 1946;
    crossWar(w, 1938);
    expect(w.year - p.born).toBe(25);
    expect(p.born).toBe(born);
    expect(p.until).toBe(until + 7);
    expect(p.loanUntil).toBe(1948);
    expect(mainOvr(p)).toBeGreaterThan(before);
    expect(w.npcSummerAt).toBe(1945);
    expect(w.fixtures).toEqual([]);
    expect(w.history).toEqual([]);
    expect(w.squads![c.id]!.length).toBeGreaterThanOrEqual(NPC_SQUAD.size);
    expect(w.squads![c.id]!.some((p) => p.id.startsWith(`${c.id}:y:1946:`))).toBe(true);
    const firstIntake = w.squads![c.id]!.find((p) => p.id.startsWith(`${c.id}:y:1940:`))!;
    expect(firstIntake.until - 1946).toBeGreaterThanOrEqual(1);
    expect(firstIntake.until - 1946).toBeLessThanOrEqual(5);
    const after = structuredClone(w);
    crossWar(w, 1938);
    expect(w).toEqual(after);
  });
});
