import { describe, expect, it } from 'vitest';
import {
  canonical,
  validateWorld,
  type Club,
  type CountryCode,
  type World,
} from '../../contracts/src/index';
import { COUNTRIES, country, currency, priceIndex } from '../../catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  clubOf,
  createWorld,
  cupKey,
  eloOf,
  finishCups,
  finishEurope,
  legsOf,
  ownLeagueClubs,
  prepareSeason,
  ranked,
  tieAggregate,
} from './index';
import { professionalStart } from './testing';

/** A club whose first season is `year`, with a squad and manager of that time. */
function founded(year?: number) {
  const w = createWorld({
    country: 'ENG',
    name: 'Archive Rovers',
    color: '#2a4d3a',
    seed: 'season-archive',
    difficulty: 1,
  });
  if (!year) return w;
  w.year = year;
  w.currency = currency('ENG', year).code;
  w.priceIndex = priceIndex('ENG', year).value;
  w.manager.since = year;
  w.manager.until = year + 3;
  for (const p of w.players) {
    p.born = year - 24;
    p.until = year + 2;
  }
  prepareSeason(w);
  return w;
}

/** Plays a season to its last round and closes it; `live` is the world as the close archived it. */
function closedSeason(w: World) {
  while (w.round < 46) advanceRound(w, undefined, false);
  const live = structuredClone(w);
  finishCups(live);
  finishEurope(live);
  closeSeason(w);
  return { w, live, season: w.history.at(-1)! };
}

describe('closed season archive', () => {
  it.each([
    ['amateur', (w: World) => w],
    ['professional', professionalStart],
  ])('keeps the %s league scorers, the rank after every round and the Elo spread', (_, start) => {
    const { w, live, season } = closedSeason(start(founded()));
    const scorers = season.scorers!;
    const table = live.scorerSeason!.players.filter((p) => p.goals > 0);
    expect(scorers).toHaveLength(Math.min(10, table.length));
    expect(scorers.length).toBeGreaterThan(0);
    scorers.forEach((scorer, i) => {
      expect(scorer.club).toBeGreaterThanOrEqual(0);
      expect(scorer.club).toBeLessThan(w.clubs.length);
      expect(table).toContainEqual(
        expect.objectContaining({ ...scorer, club: w.clubs[scorer.club].id }),
      );
      const next = scorers[i + 1];
      if (next)
        expect(
          scorer.goals > next.goals ||
            (scorer.goals === next.goals && scorer.appearances <= next.appearances),
        ).toBe(true);
    });
    // Nobody left out scored more than the last one kept.
    expect(table.filter((p) => p.goals > scorers.at(-1)!.goals).length).toBeLessThan(
      scorers.length,
    );

    // One rank per settled round, read from the snapshots the live rank graph draws.
    const snapshots = w
      .rankHistory!.filter(
        (s) =>
          s.year === season.year &&
          s.round > 0 &&
          s.tier === season.tier &&
          s.group === season.group,
      )
      .sort((a, b) => a.round - b.round);
    expect(season.ranks).toHaveLength(46);
    expect(season.ranks).toEqual(
      snapshots.map((s) => s.rows.findIndex(([i]) => w.clubs[i].id === w.playerClub) + 1),
    );
    expect(season.ranks!.at(-1)).toBe(season.rank);

    const world = live.clubs.map(eloOf),
      league = ownLeagueClubs(live).map(eloOf);
    expect(season.eloRange).toEqual(
      [Math.min(...world), Math.max(...world), Math.min(...league), Math.max(...league)].map(
        Math.round,
      ),
    );
    const [low, high, leagueLow, leagueHigh] = season.eloRange!;
    expect(low).toBeLessThanOrEqual(leagueLow);
    expect(leagueLow).toBeLessThanOrEqual(season.elo!);
    expect(season.elo!).toBeLessThanOrEqual(leagueHigh);
    expect(leagueHigh).toBeLessThanOrEqual(high);
    // Decoding keeps every archived field.
    expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
  });

  it('archives the 1980 cup and continental brackets from the last 32 to the final', () => {
    const { w, live, season } = closedSeason(founded(1980));
    const cup = live.cups!.find((c) => c.country === 'ENG')!;
    const sources = new Map([
      ['cup', { id: cupKey('ENG'), rounds: cup.rounds, fixtures: cup.fixtures }],
      ...live.europe.map(
        (t) => [t.key, { id: t.key, rounds: t.rounds!, fixtures: t.fixtures }] as const,
      ),
    ]);
    const brackets = season.brackets!;
    expect(
      Object.fromEntries(brackets.map((b) => [b.key, b.rounds.map((r) => r.ties.length)])),
    ).toEqual({
      cup: [16, 8, 4, 2, 1],
      ucl: [16, 8, 4, 2, 1],
      uel: [16, 8, 4, 2, 1],
      cwc: [16, 8, 4, 2, 1],
    });
    // The Super Cup was played, but it is no bracket.
    expect(season.europe.some((e) => e.kind === 'super')).toBe(true);
    for (const bracket of brackets) {
      const source = sources.get(bracket.key)!;
      const skipped = source.rounds.length - bracket.rounds.length;
      bracket.rounds.forEach((round, r) => {
        const index = skipped + r,
          kept = source.rounds[index];
        expect(round).toMatchObject({ label: kept.label, round: kept.round, legs: kept.legs });
        expect(round.byes).toBeUndefined();
        round.ties.forEach((row, t) => {
          const tie = kept.ties[t];
          // The closed season's fixtures are found by its year once the world has moved on.
          const legs = legsOf(w, source.fixtures, source.id, index, t, season.year);
          expect(legs).toHaveLength(kept.legs);
          expect([w.clubs[row[0]].id, w.clubs[row[1]].id]).toEqual([tie.home, tie.away]);
          expect(row.slice(2, 4)).toEqual([legs[0].score!.home, legs[0].score!.away]);
          expect(row.slice(4, 6)).toEqual(
            legs[1] ? [legs[1].score!.home, legs[1].score!.away] : [0, 0],
          );
          expect([row[2] + row[5], row[3] + row[4]]).toEqual(tieAggregate(tie, legs));
          expect(row[6] % 2).toBe(tie.winner === tie.home ? 0 : 1);
          expect(row[6] >> 1).toBe(tie.decided === 'pens' ? 1 : tie.decided === 'away' ? 2 : 0);
        });
      });
    }
    validateWorld(w);
  });

  it('rejects archived bracket rows and scorers that point nowhere or contradict their legs', () => {
    const { w, season } = closedSeason(founded());
    const corruptions: ((row: number[]) => void)[] = [
      (row) => (row[0] = w.clubs.length),
      (row) => (row[1] = w.clubs.length),
      (row) => (row[1] = row[0]),
      (row) => (row[6] = 6),
      // A single match has no second leg and no away goals.
      (row) => (row[4] = 1),
      (row) => (row[6] = 4),
    ];
    expect(season.brackets![0].rounds[0].legs).toBe(1);
    for (const corrupt of corruptions) {
      const copy = structuredClone(w);
      corrupt(copy.history[0].brackets![0].rounds[0].ties[0]);
      expect(() => validateWorld(copy)).toThrow('대진 기록 참조 손상');
    }
    const bye = structuredClone(w);
    bye.history[0].brackets![0].rounds[0].byes = [w.clubs.length];
    expect(() => validateWorld(bye)).toThrow('대진 기록 참조 손상');
    const short = structuredClone(w);
    short.history[0].brackets![0].rounds[0].ties[0].pop();
    expect(() => validateWorld(short)).toThrow();
    const scorer = structuredClone(w);
    scorer.history[0].scorers![0].club = w.clubs.length;
    expect(() => validateWorld(scorer)).toThrow('시즌 득점 기록 참조 손상');
    const spread = structuredClone(w);
    const [low, high, leagueLow, leagueHigh] = season.eloRange!;
    spread.history[0].eloRange = [leagueLow + 1, high, leagueLow, leagueHigh];
    expect(() => validateWorld(spread)).toThrow();
    expect(low).toBeLessThanOrEqual(leagueLow);
  });

  it('renews no contract by itself: unrenewed players leave at the close (→CLUB-26, CLUB-28)', () => {
    const w = founded();
    // Unanswered talks stay open: nobody signs for the owner.
    w.delegation = { ...w.delegation, contracts: false };
    for (const p of w.players) p.until = w.year + 1;
    const year = w.year,
      before = new Map(w.players.map((p) => [p.id, { wage: p.wage, until: p.until }]));
    closedSeason(w);
    const founders = w.players.filter((p) => before.has(p.id)),
      left = founders.filter((p) => p.status === 'sold');
    // Each asked to renew on 1 January instead, and left unrenewed; one who announced his
    // retirement in spring needed no renewal.
    const asked = new Set(
      (w.inbox || []).filter((item) => item.kind === 'contract-talk').map((item) => item.ref),
    );
    expect(left.length).toBeGreaterThan(0);
    for (const p of founders) {
      expect(asked.has(p.id)).toBe(true);
      expect(p.status === 'sold' || p.retiring === year).toBe(true);
      expect({ wage: p.wage, until: p.until }).toEqual(before.get(p.id));
      expect(p.talk).toBeUndefined();
    }
    expect(w.events.some((e) => e.kind === 'contract')).toBe(false);
    // Before 1996 every departure brings his new club's compensation; youth fill the squad.
    const paid = w.events.filter(
      (e) => e.year === year + 1 && e.kind === 'free-transfer-compensation',
    );
    expect(paid).toHaveLength(left.length);
    expect(w.players.filter((p) => p.status === 'active')).toHaveLength(18);
  });

  it('keeps no partial scorer table or rank series from a season tracked midway', () => {
    const w = founded();
    advanceRound(w, undefined, false);
    advanceRound(w, undefined, false);
    // An older save starts both records at the next round.
    delete w.scorerSeason;
    w.rankHistory = w.rankHistory!.filter((s) => s.round > 1);
    const { season } = closedSeason(w);
    expect(season).not.toHaveProperty('scorers');
    expect(season).not.toHaveProperty('ranks');
    expect(season.brackets!.length).toBeGreaterThan(0);
    expect(season.eloRange).toHaveLength(4);
  });
});

/** A club founded in `code`, its first season (amateur unless `start` says) played to the last round. */
function lastRound(code: CountryCode, start = (w: World) => w) {
  const w = start(
    createWorld({
      country: code,
      name: 'Archive Rovers',
      color: '#2a4d3a',
      seed: 'amateur-exchange',
      difficulty: 1,
    }),
  );
  // A round step stays put once the club is bankrupt: fail here rather than loop to the timeout.
  while (w.round < 46) {
    expect(w.bankrupt).toBeUndefined();
    advanceRound(w, undefined, false);
  }
  return w;
}

/**
 * Orders the amateur table with the own club `rank`th and the others from the weakest down, so the
 * table and the strength order disagree; returns the table.
 */
function standAt(w: World, rank: number) {
  const order = ownLeagueClubs(w)
    .filter((c) => c.id !== w.playerClub)
    .sort((a, b) => a.strength - b.strength || (a.id < b.id ? -1 : 1));
  order.splice(rank - 1, 0, clubOf(w));
  order.forEach((c, i) => (w.tables[c.id].points = 100 - i * 2));
  expect(ranked(w, order)).toEqual(order);
  return order.map((c) => c.id);
}

/** Closes the season and reads who crossed between the last division and the amateur level. */
function exchange(w: World) {
  const code = clubOf(w).country,
    groups = country(code).groups,
    last = groups.length - 1;
  const before = structuredClone(w);
  closeSeason(w);
  const was = new Map(before.clubs.map((c) => [c.id, c]));
  const ids = (clubs: Club[]) => clubs.map((c) => c.id).sort();
  const moved = (from: number, to: number, where: string = code) =>
    ids(
      w.clubs.filter((c) => c.country === where && was.get(c.id)!.tier === from && c.tier === to),
    );
  // Countries without a played amateur league send up their strongest amateur clubs.
  for (const cp of COUNTRIES.filter((cp) => !(before.lower && cp.code === code))) {
    const bottom = cp.groups.length - 1,
      places = cp.groups[bottom].length * 2;
    const strongest = before.clubs
      .filter((c) => c.country === cp.code && c.representative && c.tier === bottom + 1)
      .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))
      .slice(0, places);
    expect(moved(bottom + 1, bottom, cp.code), cp.code).toEqual(ids(strongest));
    expect(moved(bottom, bottom + 1, cp.code), cp.code).toHaveLength(places);
  }
  // Nobody falls or climbs two levels in one close.
  for (const c of w.clubs)
    expect(Math.abs(c.tier - was.get(c.id)!.tier), c.id).toBeLessThanOrEqual(1);
  // Every group keeps its capacity.
  groups.forEach((sizes, tier) =>
    sizes.forEach((size, group) =>
      expect(
        w.clubs.filter(
          (c) => c.country === code && c.tier === tier && c.group === group && !c.representative,
        ),
        `${code}:${tier}:${group}`,
      ).toHaveLength(size),
    ),
  );
  return {
    last,
    up: moved(last + 1, last),
    down: moved(last, last + 1),
    // The bottom two of each last-division group in the season just played.
    bottom: ids(
      groups[last].flatMap((_, group) =>
        ranked(
          before,
          before.clubs.filter(
            (c) => c.country === code && c.tier === last && c.group === group && !c.representative,
          ),
        ).slice(-2),
      ),
    ),
  };
}

describe('amateur exchange (→LEAGUE-6)', () => {
  let england: World | undefined;
  const englandLastRound = () => structuredClone((england ??= lastRound('ENG')));

  it('sends the champions up for exactly the bottom two of the last division', () => {
    const w = englandLastRound(),
      table = standAt(w, 1);
    const { last, up, down, bottom } = exchange(w);
    expect(down).toHaveLength(2);
    expect(down).toEqual(bottom);
    expect(up).toHaveLength(2);
    expect(up).toContain(w.playerClub);
    // The other place goes to the playoff winner of second to fifth, not the strongest amateurs.
    expect(table.slice(1, 5)).toContain(up.find((id) => id !== w.playerClub));
    expect(w.lower).toBe(false);
    expect(clubOf(w).tier).toBe(last);
    expect(clubOf(w).representative).toBeFalsy();
    expect(w.events.some((e) => e.kind === 'promotion' && e.title === '프로 무대 입성')).toBe(true);
  });

  it('plays the own club third off for the last place', () => {
    const w = englandLastRound(),
      year = w.year,
      table = standAt(w, 3);
    const { last, up, down, bottom } = exchange(w);
    expect(down).toEqual(bottom);
    expect(up).toHaveLength(2);
    expect(up).toContain(table[0]);
    const winner = up.find((id) => id !== table[0])!;
    expect(table.slice(1, 5)).toContain(winner);
    // The own ties are archived (→LEAGUE-4).
    expect(w.ownMatches.some((m) => m.id.startsWith(`${year}:lower-promotion:`))).toBe(true);
    expect(w.lower).toBe(winner !== w.playerClub);
    expect(clubOf(w).tier).toBe(winner === w.playerClub ? last : last + 1);
  });

  it.each([
    ['ITA', 'ITA:1:0:2'],
    ['GER', 'GER:1:0:15'],
  ] as const)(
    '%s exchanges two clubs a last-division group, and %s, relegated into it, stays there',
    (code, fallen) => {
      const w = lastRound(code),
        table = standAt(w, 1);
      // The worst record of the division above, below every last-division club once it falls.
      Object.assign(w.tables[fallen], { points: 0, gf: 0, ga: 99 });
      const { last, up, down, bottom } = exchange(w);
      const places = country(code).groups[last].length * 2;
      expect(down).toEqual(bottom);
      expect(up).toHaveLength(places);
      expect(up).toEqual(expect.arrayContaining(table.slice(0, places - 1)));
      expect(table.slice(places - 1, places + 3)).toContain(
        up.find((id) => !table.slice(0, places - 1).includes(id)),
      );
      expect(w.clubs.find((c) => c.id === fallen)).toMatchObject({ tier: last });
      expect(w.clubs.find((c) => c.id === fallen)!.representative).toBeFalsy();
      expect(w.lower).toBe(false);
    },
  );

  it('keeps the strength order in a season the own club plays professionally', () => {
    const w = lastRound('ENG', professionalStart);
    // exchange() expects the strongest amateur clubs up in every country.
    expect(exchange(w).down).toHaveLength(2);
  });
});
