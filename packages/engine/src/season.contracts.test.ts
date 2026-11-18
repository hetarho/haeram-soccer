import { ATTRIBUTES } from '../../contracts/src/player';
import { staffAuthority } from './testing';
import { describe, expect, it, vi } from 'vitest';
import * as contractsModule from './contracts';
import * as freeAgentsModule from './free-agents';
import { marketWage } from './market-prices';
import { careerDate } from './person-careers';
import { moneyLabel } from './finance';
import { message } from '../../contracts/src/messages';
import type { Player, PersonCareer, World } from '../../contracts/src/types';
import { activePlayers, clubOf, divisionStrength, marketWageAt, overall, rating } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { closedSeason, founded, toLastRound } from './season.testkit';

// Contracts at the close, on the released model: the squad, not the match model, is the subject.
describe('closed season archive', () => {
  it('renews no contract by itself: unrenewed players leave at the close (→CLUB-26, CLUB-28)', () => {
    const { w, year, contracts } = cachedWorld('unrenewed-last-round', () => {
      const w = founded();
      // Unanswered talks stay open: nobody signs for the owner.
      w.settings = staffAuthority(1);
      for (const p of w.players) p.until = w.year + 1;
      const year = w.year,
        contracts = w.players.map((p) => [p.id, { wage: p.wage, until: p.until }] as const);
      return { w: toLastRound(w), year, contracts };
    });
    const before = new Map(contracts);
    expect(before.size).toBe(22);
    const oldJobs = new Map(
      w.players
        .filter((p) => before.has(p.id))
        .map((p) => [
          p.id,
          structuredClone(
            w.people![p.id]!.employment.filter((job) => job.role === 'player' && !job.to),
          ),
        ]),
    );
    // A player unhappy since a bigger club's move fell through opens no talk (→CLUB-26/27).
    const unhappy = new Set(w.players.filter((p) => p.unhappy).map((p) => p.id));
    const snapshots = (world: World) =>
      world.players
        .filter((p) => before.has(p.id))
        .map((p) => ({
          player: structuredClone(p),
          person: structuredClone(world.people![p.id]!),
          moves: structuredClone(world.playerRecords?.[p.id]?.moves ?? []),
          free: structuredClone(world.freeAgents?.find((agent) => agent.id === p.id)),
        }));
    type Snapshot = ReturnType<typeof snapshots>;
    const boundaries: {
      at: ReturnType<typeof careerDate>;
      year: number;
      before: Snapshot;
      after: Snapshot;
      events: World['events'];
    }[] = [];
    const arrivals: {
      player: Player;
      person: PersonCareer;
      pool: Player;
      previousJobs: PersonCareer['employment'];
      events: World['events'];
      at: ReturnType<typeof careerDate>;
      cash: [string, string];
      wage: string;
      clauses: Player['clauses'];
    }[] = [];
    const expire = contractsModule.expireContracts;
    const sign = freeAgentsModule.signFreeAgentAtClose;
    // Movement observers omit some retired/unsigned cases. These scoped observers delegate the
    // real operations and read their boundaries; neither arguments nor results are replaced.
    const expiry = vi.spyOn(contractsModule, 'expireContracts').mockImplementation((...args) => {
      const [world] = args;
      if (world !== w) return expire(...args);
      const prior = snapshots(world),
        at = careerDate(world),
        eventAt = world.events.length;
      const result = expire(...args);
      boundaries.push({
        at,
        year: world.year,
        before: prior,
        after: snapshots(world),
        events: structuredClone(world.events.slice(eventAt)),
      });
      return result;
    });
    const signing = vi
      .spyOn(freeAgentsModule, 'signFreeAgentAtClose')
      .mockImplementation((...args) => {
        const [world] = args;
        if (world !== w) return sign(...args);
        const pool = structuredClone(world.freeAgents ?? []),
          eventAt = world.events.length,
          jobs = new Map(
            Object.entries(world.people ?? {})
              .filter(([id]) => before.has(id))
              .map(([id, person]) => [id, structuredClone(person.employment)]),
          ),
          cash = world.cash,
          at = careerDate(world);
        const result = sign(...args);
        if (result && result !== 'full' && before.has(result.id))
          arrivals.push({
            player: structuredClone(result),
            person: structuredClone(world.people![result.id]!),
            pool: pool.find((p) => p.id === result.id)!,
            previousJobs: jobs.get(result.id)!,
            events: structuredClone(world.events.slice(eventAt)),
            at,
            cash: [cash, world.cash],
            wage: marketWage(world, result),
            clauses: contractsModule.signingClauses(world, result),
          });
        return result;
      });
    try {
      closedSeason(w);
    } finally {
      signing.mockRestore();
      expiry.mockRestore();
    }
    expect(boundaries).toHaveLength(1);
    const boundary = boundaries[0]!;
    console.info(
      JSON.stringify({
        kind: 'contract-expiry-boundary',
        seed: w.seed,
        year,
        at: boundary.at,
        founders: boundary.after.map(({ player, person, moves, free }) => ({
          id: player.id,
          old: before.get(player.id),
          status: player.status,
          wage: player.wage,
          until: player.until,
          employment: person.employment,
          moves,
          free: !!free,
        })),
        arrivals: arrivals.map(({ player, person, events }) => ({
          id: player.id,
          wage: player.wage,
          until: player.until,
          employment: person.employment,
          events,
        })),
      }),
    );
    expect(boundary.before).toHaveLength(before.size);
    expect(boundary.after).toHaveLength(before.size);
    expect(boundary.after.filter(({ player }) => player.status === 'active')).toEqual([]);
    const asked = new Set(
      (w.inbox || []).filter((item) => item.kind === 'contract-talk').map((item) => item.ref),
    );
    for (const { player, person } of boundary.after) {
      expect(asked.has(player.id)).toBe(!unhappy.has(player.id));
      expect(player.status === 'sold' || player.retiring === year).toBe(true);
      expect({ wage: player.wage, until: player.until }).toEqual(before.get(player.id));
      expect(player.talk).toBeUndefined();
      const jobs = oldJobs.get(player.id)!;
      expect(jobs).toHaveLength(1);
      expect(
        person.employment.filter((job) => job.role === 'player' && job.club === w.playerClub),
      ).toEqual([{ ...jobs[0]!, to: boundary.at }]);
      expect(
        person.employment.some(
          (job) => job.role === 'player' && job.club === w.playerClub && !job.to,
        ),
      ).toBe(false);
    }
    const founders = w.players.filter((p) => before.has(p.id)),
      returned = founders.filter((p) => p.status === 'active'),
      left = founders.filter((p) => p.status === 'sold');
    expect(founders).toHaveLength(before.size);
    expect(left.length).toBeGreaterThan(0);
    // Some come back, only as the close's top-up signs them from the pool (→CLUB-3, CLUB-40); how
    // many depends on whom the world's clubs release into it and sign from it first.
    expect(returned.length).toBeGreaterThan(0);
    expect(returned.length).toBeLessThan(before.size);
    expect(arrivals.map(({ player }) => player.id).sort()).toEqual(
      returned.map((p) => p.id).sort(),
    );
    for (const p of founders) {
      expect(p.talk).toBeUndefined();
      const ended = boundary.after.find(({ player }) => player.id === p.id)!;
      if (p.status !== 'active') {
        expect(p.status === 'sold' || p.retiring === year).toBe(true);
        expect({ wage: p.wage, until: p.until }).toEqual(before.get(p.id));
        continue;
      }
      const arrival = arrivals.find(({ player }) => player.id === p.id)!;
      expect(p).toMatchObject({
        id: ended.player.id,
        name: ended.player.name,
        born: ended.player.born,
      });
      expect(arrival.pool).toMatchObject({ id: p.id, born: p.born });
      expect(ended.free?.id).toBe(p.id);
      expect(arrival.previousJobs).toEqual(ended.person.employment);
      expect(arrival.person.employment.slice(0, -1)).toEqual(arrival.previousJobs);
      expect(arrival.person.employment.at(-1)).toEqual({
        role: 'player',
        club: w.playerClub,
        from: arrival.at,
      });
      expect(arrival.at).toEqual(boundary.at);
      expect(arrival.person.employment.filter((job) => !job.to)).toHaveLength(1);
      expect(w.people![p.id]).toMatchObject({
        id: p.id,
        born: p.born,
        playing: 'active',
        club: w.playerClub,
        ownCareer: ended.player.career,
      });
      expect(p.career).toEqual(ended.player.career);
      expect(p).toMatchObject({
        wage: arrival.wage,
        until: boundary.year + freeAgentsModule.FREE_AGENT_CONFIG.term,
        joined: boundary.year,
        clauses: arrival.clauses,
      });
      expect(p.until).toBeGreaterThan(before.get(p.id)!.until);
      expect(p).not.toHaveProperty('freeSince');
      expect(arrival.cash[1]).toBe(arrival.cash[0]);
      expect(arrival.events).toHaveLength(1);
      expect(arrival.events[0]).toMatchObject({
        kind: 'free-agent-signing',
        year: boundary.year,
        title: message('copy.free_agents.b9563581fa', { p0: p.name }),
        detail: message('copy.free_agents.66f9dc1d1c', {
          p0: p.position,
          p1: w.year - p.born,
          p2: moneyLabel(w, p.wage),
          p3: p.until,
        }),
      });
      expect(arrival.events[0]!.amount).toBeUndefined();
      expect(w.players.filter((row) => row.id === p.id)).toHaveLength(1);
      expect(
        Object.values(w.squads ?? {})
          .flat()
          .filter((row) => row.id === p.id),
      ).toEqual([]);
      expect(w.freeAgents?.some((row) => row.id === p.id)).toBe(false);
      expect(w.playerRecords?.[p.id]?.moves ?? []).toEqual(ended.moves);
    }
    // Every real external move at expiry carries a zero fee, in every era.
    const departures = boundary.after.flatMap((row) => {
      const prior = boundary.before.find(({ player }) => player.id === row.player.id)!;
      return row.moves
        .slice(prior.moves.length)
        .filter((move) => move.from === w.playerClub && move.to !== w.playerClub)
        .map((move) => ({ row, move }));
    });
    // Exactly the founders another club took at the expiry, each once; a free agent or a retiree
    // brings none. How many clubs take one depends on their needs that summer.
    const moved = boundary.after.filter(
      ({ person }) => !!person.club && person.club !== w.playerClub,
    );
    expect(moved.length).toBeGreaterThan(0);
    expect(departures.map(({ row }) => row.player.id)).toEqual(
      moved.map(({ player }) => player.id),
    );
    for (const { row, move } of departures) {
      expect(move).toMatchObject({
        ...boundary.at,
        from: w.playerClub,
        to: row.person.club,
        fee: '0',
      });
    }
    const paid = w.events.filter(
      (e) => e.year === year + 1 && e.kind === 'free-transfer-compensation',
    );
    expect(paid).toEqual([]);
    expect(boundary.events.filter((e) => e.kind === 'free-transfer-compensation')).toEqual([]);
    // No renewal was agreed; mandatory new free signings have their separate, explicit events.
    expect(w.events.filter((e) => e.kind === 'contract').map((e) => e.title)).toEqual(
      w.players.filter((p) => unhappy.has(p.id)).map((p) => `${p.name} 언해피 해소`),
    );
    expect(activePlayers(w)).toHaveLength(20);
    expect(activePlayers(w).some((p) => p.position === 'GK')).toBe(true);
  });

  it('refills a squad its expiring contracts emptied at its division’s level and wage (→CLUB-3, CLUB-25, CLUB-28)', () => {
    const w = cachedWorld('expiring-xi-last-round', () => {
      const w = founded();
      w.settings = staffAuthority(1);
      // An XI far above the last division and the division it goes up to.
      for (const p of w.players) {
        p.until = w.year + 1;
        for (const a of ATTRIBUTES) p.attrs[a] = 90;
      }
      return toLastRound(w);
    });
    const { live } = closedSeason(w);
    const own = clubOf(w),
      xi = rating(live, clubOf(live)),
      level = divisionStrength(w),
      youths = activePlayers(w).filter((p) => p.id.startsWith(`${w.playerClub}:youth:`));
    // The champions go up: the division they will play in is the professional one above.
    expect(own.tier).toBeLessThan(live.clubs.find((c) => c.id === own.id)!.tier);
    expect(xi).toBeGreaterThan(level + 30);
    // Nobody who played the season stays: expiry and retirement emptied the squad.
    expect(activePlayers(w).filter((p) => live.players.some((x) => x.id === p.id))).toEqual([]);
    expect(youths.length).toBeGreaterThanOrEqual(11);
    // Each comes in about five below the division (±9 per attribute), not against the old XI.
    for (const p of youths) {
      expect(overall(p)).toBeGreaterThanOrEqual(level - 5 - 9);
      expect(overall(p)).toBeLessThan(xi - 15);
      expect(p.born).toBe(w.year - 18);
      expect(p.graduate).toBe(true);
      // On the market wage of the division he joins.
      expect(p.wage).toBe(marketWageAt(own.country, w.year, own.tier, p));
    }
    const mean = youths.reduce((sum, p) => sum + overall(p), 0) / youths.length;
    expect(mean).toBeGreaterThan(level - 8);
    expect(mean).toBeLessThan(level + 2);
  });
});
