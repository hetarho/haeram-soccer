import { describe, expect, it, vi } from 'vitest';
import type { ManagerHistoryFacts } from '../../contracts/src/manager-history';
import {
  ManagerHistoryQueryError,
  type ManagerHistoryMatch,
  type ManagerHistorySeason,
  type ManagerHistorySource,
  type ManagerTenureRow,
} from '../../contracts/src/manager-history-view';
import { MANAGER_HISTORY_VIEW_CONFIG, managerHistoryPage } from './manager-achievements';
import {
  attributeManagerOutcome,
  createManagerHistoryFacts,
  recordManagerTenureChange,
} from './manager-history';

/** Every source here is small synthetic data, never a simulated or production career. */
const date = (year: number, day = 0) => ({ year, day });
const division = (tier = 1, group = 0, country = 'ENG') => ({ country, tier, group });
const create = () =>
  createManagerHistoryFacts({
    club: 'ours',
    at: { ...date(2030), revision: 0 },
    coverage: 'founding',
    manager: {
      id: 'a',
      person: 'person-a',
      name: 'Synthetic Manager',
      interim: false,
      since: 2030,
    },
  });
function source(facts: ManagerHistoryFacts | undefined = create()): ManagerHistorySource {
  return { club: 'ours', facts, matches: [], seasons: [], personnelEvents: [] };
}
function entry(
  id: string,
  year: number,
  day: number,
  tenure: string | undefined,
  own = 1,
  opponent = 0,
): ManagerHistoryMatch {
  return {
    match: {
      id,
      year,
      kind: 'league',
      home: 'ours',
      away: 'them',
      score: { home: own, away: opponent },
      ...(tenure ? { managerTenure: tenure } : {}),
    },
    at: date(year, day),
    order: day,
    competition: 'Synthetic League',
  };
}
function tenureRows(input: ManagerHistorySource): ManagerTenureRow[] {
  return managerHistoryPage(input).rows.filter(
    (row): row is ManagerTenureRow => row.kind === 'tenure',
  );
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

describe('pure manager accomplishment queries', () => {
  it('shows a current-season cup at the final before any season archive and retains its original manager', () => {
    const titled = attributeManagerOutcome(
      create(),
      { kind: 'cup-title', year: 2030, competition: 'cup:ENG' },
      { at: date(2030, 200) },
    );
    const snapshot: ManagerHistorySeason = {
      year: 2030,
      league: { division: division(), name: 'Synthetic League', rank: 1, final: false },
      cups: [{ competition: 'cup:ENG', name: 'Synthetic Cup', winner: 'ours', final: true }],
      promotions: [],
    };
    const live = { ...source(titled), seasons: [snapshot] };
    expect(tenureRows(live)[0].summary!.honours).toMatchObject([
      { kind: 'cup-title', name: 'Synthetic Cup', season: { year: 2030, club: 'ours' } },
    ]);
    expect(tenureRows(live)[0].summary!.bestFinishes).toEqual([]);
    expect(tenureRows(live)[0].summary!.provisionalFinishes).toMatchObject([{ rank: 1 }]);
    const replaced = recordManagerTenureChange(titled, {
      kind: 'appointment',
      key: 'replacement',
      at: date(2030, 201),
      manager: { id: 'b', name: 'Synthetic Successor', interim: false },
    });
    const rows = tenureRows({ ...live, facts: replaced });
    expect(rows[0].summary!.honours).toEqual([]);
    expect(rows[1].summary!.honours).toMatchObject([{ kind: 'cup-title', sharedSeason: true }]);
    expect(rows[1].current).toBe(false);
    expect(rows[1].summary!.sourceSeasons).toEqual([{ year: 2030, club: 'ours' }]);
  });

  it('uses every retained official own match once and the 90-minute result, including away fixtures', () => {
    const input = source();
    const win = entry('win', 2030, 1, 'ours:tenure:1', 2, 0);
    const shootout = entry('shootout', 2030, 2, 'ours:tenure:1', 2, 1);
    shootout.match = { ...shootout.match, kind: 'cup', regulation: { home: 1, away: 1 } };
    const loss = entry('loss', 2030, 3, 'ours:tenure:1', 0, 1);
    const awayWin = entry('away', 2031, 1, 'ours:tenure:1', 0, 3);
    awayWin.match.home = 'them';
    awayWin.match.away = 'ours';
    const foreign = entry('foreign', 2030, 4, 'ours:tenure:1');
    foreign.match.home = 'other-1';
    foreign.match.away = 'other-2';
    input.matches = [awayWin, foreign, loss, shootout, win, structuredClone(win)];
    const summary = tenureRows(input)[0].summary!;
    expect(summary.record).toEqual({
      scope: 'all-official-own-matches-90-minutes',
      coverage: 'complete',
      played: 4,
      won: 2,
      drawn: 1,
      lost: 1,
      sampleSize: 4,
      winRate: 0.5,
    });
    expect(summary.unbeatenRun).toMatchObject({
      count: 2,
      start: { match: 'win' },
      end: { match: 'shootout' },
      ongoing: false,
    });
    expect(summary.winningRun).toMatchObject({ count: 1, start: { match: 'away' }, ongoing: true });
    expect(summary.sourceSeasons).toEqual([
      { year: 2031, club: 'ours' },
      { year: 2030, club: 'ours' },
    ]);
  });

  it('carries runs across seasons in one tenure but breaks them at unattributed fixtures', () => {
    const input = source();
    input.matches = [
      entry('season-end', 2030, 300, 'ours:tenure:1'),
      entry('season-start', 2031, 1, 'ours:tenure:1'),
    ];
    const first = tenureRows(input)[0].summary!;
    expect(first.winningRun).toMatchObject({
      count: 2,
      ongoing: true,
      start: { at: date(2030, 300) },
      end: { at: date(2031, 1) },
    });
    input.matches = [
      ...input.matches,
      entry('unknown', 2031, 2, undefined),
      entry('after-gap', 2031, 3, 'ours:tenure:1'),
    ];
    const afterGap = tenureRows(input)[0].summary!;
    expect(afterGap.record).toMatchObject({
      played: 3,
      won: 3,
      coverage: 'partial',
      sampleSize: 3,
    });
    expect(afterGap.winningRun).toMatchObject({
      count: 2,
      end: { match: 'season-start' },
      ongoing: false,
    });
    expect(afterGap.unbeatenRun?.count).toBe(2);
    input.matches = [...input.matches, entry('last-unknown', 2031, 4, undefined)];
    expect(tenureRows(input)[0].summary!.winningRun!.ongoing).toBe(false);
  });

  it('records a shoot-out winner as a draw with the actual 90-minute denominator', () => {
    const shootout = entry('penalties', 2030, 100, 'ours:tenure:1', 1, 1);
    shootout.match.kind = 'cup';
    shootout.match.shootout = { home: 5, away: 4 };
    const summary = tenureRows({ ...source(), matches: [shootout] })[0].summary!;
    expect(summary.record).toMatchObject({
      played: 1,
      won: 0,
      drawn: 1,
      lost: 0,
      sampleSize: 1,
      winRate: 0,
    });
    expect(summary.winningRun).toBeNull();
    expect(summary.unbeatenRun).toMatchObject({ count: 1, ongoing: true });
  });

  it('ignores pre-tracking unknowns for later coverage and conservatively marks both sides of a same-day boundary', () => {
    const facts = recordManagerTenureChange(create(), {
      kind: 'appointment',
      key: 'same-day-boundary',
      at: date(2030, 10),
      manager: { id: 'b', name: 'Synthetic B', interim: true },
    });
    const old = entry('pre-tracking', 2029, 200, undefined);
    const input = { ...source(facts), matches: [old] };
    expect(tenureRows(input).map((row) => row.summary!.record.coverage)).toEqual([
      'complete',
      'complete',
    ]);
    input.matches.push(entry('ambiguous-boundary', 2030, 10, undefined));
    expect(tenureRows(input).map((row) => row.summary!.record.coverage)).toEqual([
      'partial',
      'partial',
    ]);
  });

  it('separates same-day interims and same-name reappointments in retained settlement order', () => {
    const first = create();
    const second = recordManagerTenureChange(first, {
      kind: 'appointment',
      key: 'interim',
      at: date(2030, 10),
      manager: { id: 'b', name: 'Synthetic Interim', interim: true },
    });
    const third = recordManagerTenureChange(second, {
      kind: 'appointment',
      key: 'return',
      at: date(2030, 10),
      manager: { id: 'a', name: 'Synthetic Manager', interim: false },
    });
    const input = source(third);
    const a = entry('a', 2030, 10, 'ours:tenure:1');
    a.order = 1;
    const b = entry('b', 2030, 10, 'ours:tenure:2');
    b.order = 2;
    const c = entry('c', 2030, 10, 'ours:tenure:3');
    c.order = 3;
    input.matches = [c, a, b];
    const rows = tenureRows(input);
    expect(rows.map((row) => row.tenure!.id)).toEqual([
      'ours:tenure:3',
      'ours:tenure:2',
      'ours:tenure:1',
    ]);
    expect(rows.map((row) => row.summary!.winningRun!.count)).toEqual([1, 1, 1]);
    expect(rows.map((row) => row.summary!.winningRun!.ongoing)).toEqual([true, false, false]);
    expect(rows[1].manager.interim).toBe(true);
    expect(rows[0].manager.name).toBe(rows[2].manager.name);
  });

  it('keeps best league finishes scoped by country, tier and group and links all tied seasons', () => {
    let facts = create();
    const specs = [
      { year: 2030, division: division(2), rank: 1 },
      { year: 2031, division: division(1), rank: 4 },
      { year: 2032, division: division(1, 1), rank: 2 },
      { year: 2033, division: division(1, 0, 'ESP'), rank: 3 },
      { year: 2034, division: division(1), rank: 4 },
    ];
    for (const spec of specs)
      facts = attributeManagerOutcome(
        facts,
        { kind: 'league-finish', year: spec.year, ...spec.division },
        { at: date(spec.year, 300) },
      );
    const seasons: ManagerHistorySeason[] = specs.map((spec) => ({
      year: spec.year,
      league: { ...spec, name: 'Synthetic scoped league', final: true },
      cups: [],
      promotions: [],
    }));
    const summary = tenureRows({ ...source(facts), seasons })[0].summary!;
    expect(summary.bestFinishes).toHaveLength(4);
    expect(
      summary.bestFinishes.find(
        (best) =>
          best.division.country === 'ENG' && best.division.tier === 1 && best.division.group === 0,
      ),
    ).toMatchObject({
      rank: 4,
      finishes: [{ season: { year: 2034 } }, { season: { year: 2031 } }],
    });
    expect(summary.honours).toMatchObject([
      { kind: 'league-title', division: { country: 'ENG', tier: 2, group: 0 } },
    ]);
    expect(summary.coverage).toBe('complete');
  });

  it('shows structured promotion only after the actual settled upward division move', () => {
    const from = division(2, 1);
    const to = division(1, 0);
    const facts = attributeManagerOutcome(
      create(),
      { kind: 'promotion', year: 2030, club: 'ours', from, to },
      { at: date(2030, 300) },
    );
    const input = {
      ...source(facts),
      seasons: [
        {
          year: 2030,
          cups: [],
          promotions: [
            {
              club: 'ours',
              from,
              to,
              fromName: 'Synthetic Third',
              toName: 'Synthetic Second',
              final: true,
            },
          ],
        },
      ],
    };
    expect(tenureRows(input)[0].summary!.honours).toMatchObject([
      { kind: 'promotion', from, to, fromName: 'Synthetic Third', toName: 'Synthetic Second' },
    ]);
    input.seasons[0].promotions[0].final = false;
    expect(tenureRows(input)[0].summary!.honours).toEqual([]);
    expect(tenureRows(input)[0].summary!.honoursCoverage).toBe('unavailable');
  });

  it('distinguishes a complete tracked zero, partial recorded zero and unknown current service', () => {
    const complete = tenureRows(source())[0];
    expect(complete.coverage).toBe('complete');
    expect(complete.summary).toMatchObject({
      honours: [],
      winningRun: null,
      record: { played: 0, sampleSize: 0, winRate: null },
    });
    const facts = createManagerHistoryFacts({
      club: 'ours',
      at: { ...date(2030, 100), revision: 100 },
      coverage: 'activation',
      manager: { id: 'a', name: 'Synthetic Manager', interim: false, since: 2027 },
    });
    const partial = tenureRows(source(facts))[0];
    expect(partial.coverage).toBe('partial');
    expect(partial.tenure).toMatchObject({ knownSince: 2027, trackedFrom: date(2030, 100) });
    expect(partial.tenure!.appointed).toBeUndefined();
    expect(partial.summary!.record).toMatchObject({ played: 0, coverage: 'partial' });
    const unknown = tenureRows({
      ...source(undefined),
      facts: undefined,
      currentManager: { id: 'a', name: 'Synthetic Manager', interim: false, since: 2027 },
    })[0];
    expect(unknown).toMatchObject({
      current: true,
      tenure: null,
      coverage: 'unavailable',
      summary: null,
    });
  });

  it('keeps known missing outcome sources visible and lowers coverage instead of inventing zero honours', () => {
    const facts = attributeManagerOutcome(
      create(),
      { kind: 'cup-title', year: 2030, competition: 'cup:ENG' },
      { at: date(2030, 200) },
    );
    const summary = tenureRows(source(facts))[0].summary!;
    expect(summary.honours).toEqual([]);
    expect(summary.honoursCoverage).toBe('unavailable');
    expect(summary.unresolvedOutcomes).toMatchObject([
      {
        source: { kind: 'cup-title', competition: 'cup:ENG' },
        season: { year: 2030, club: 'ours' },
      },
    ]);
    const missingAttribution = {
      ...source(),
      seasons: [
        {
          year: 2030,
          cups: [{ competition: 'cup:ENG', name: 'Synthetic Cup', winner: 'ours', final: true }],
          promotions: [],
        },
      ],
    };
    const unlinked = tenureRows(missingAttribution)[0].summary!;
    expect(unlinked.honours).toEqual([]);
    expect(unlinked.honoursCoverage).toBe('unavailable');
    const missingArchives = tenureRows({
      ...source(),
      matchesComplete: false,
      outcomesComplete: false,
    })[0];
    expect(missingArchives.coverage).toBe('unavailable');
  });

  it('preserves old personnel prose as separate narrative events without linking names to tenures', () => {
    const input = source();
    input.personnelEvents = [
      {
        id: 'old-appointment',
        order: 1,
        event: {
          year: 2028,
          round: 3,
          kind: 'manager-hire',
          title: 'Synthetic Manager appointed',
          detail: 'Older readable appointment story.',
        },
      },
    ];
    const page = managerHistoryPage(input);
    expect(page.total).toBe(2);
    expect(page.rows[1]).toMatchObject({
      kind: 'legacy-event',
      coverage: 'unavailable',
      event: { event: { detail: 'Older readable appointment story.' } },
    });
    expect(tenureRows(input)).toHaveLength(1);
    expect(managerHistoryPage({ ...input, facts: undefined, personnelEvents: [] }).rows).toEqual(
      [],
    );
  });

  it('returns compact deterministic newest-first cursor pages and readable typed cursor failures', () => {
    let facts = create();
    for (let serial = 2; serial <= 45; serial++)
      facts = recordManagerTenureChange(facts, {
        kind: 'appointment',
        key: `appointment-${serial}`,
        at: date(2030, 10),
        manager: { id: `m-${serial}`, name: `Synthetic ${serial}`, interim: serial % 2 === 0 },
      });
    const input = source(facts);
    const first = managerHistoryPage(input);
    const second = managerHistoryPage(input, first.nextCursor!);
    const third = managerHistoryPage(input, second.nextCursor!);
    expect(first.pageSize).toBe(MANAGER_HISTORY_VIEW_CONFIG.pageSize);
    expect([first.rows.length, second.rows.length, third.rows.length]).toEqual([20, 20, 5]);
    expect(first.rows[0].id).toBe('tenure:ours:tenure:45');
    expect(third.rows.at(-1)!.id).toBe('tenure:ours:tenure:1');
    expect(new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.id)).size).toBe(
      45,
    );
    expect(third.nextCursor).toBeNull();
    expect(managerHistoryPage(input)).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('highlights');
    for (const cursor of [
      '',
      'invalid',
      'manager-history:1:%XX',
      'manager-history:1:[]',
      'manager-history:1:' + encodeURIComponent(JSON.stringify(['other-club', first.rows[0].id])),
      'manager-history:1:' + encodeURIComponent(JSON.stringify(['ours', 'missing'])),
    ]) {
      try {
        managerHistoryPage(input, cursor);
        throw new Error('Expected cursor rejection.');
      } catch (error) {
        expect(error).toBeInstanceOf(ManagerHistoryQueryError);
        expect(error).toMatchObject({
          code: 'invalid-cursor',
          message: expect.stringContaining('Reload'),
        });
      }
    }
  });

  it('rejects snapshots for another club and ambiguous duplicate season sources', () => {
    expect(() => managerHistoryPage({ ...source(), club: 'other' })).toThrow(
      ManagerHistoryQueryError,
    );
    const season = { year: 2030, cups: [], promotions: [] };
    expect(() => managerHistoryPage({ ...source(), seasons: [season, season] })).toThrow(
      'one source snapshot',
    );
  });

  it('leaves frozen inputs and caller RNG state unchanged, including when traversing pages', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Unexpected RNG');
    });
    try {
      const input = frozen({
        ...source(),
        matches: [entry('one', 2030, 1, 'ours:tenure:1')],
        rng: { generation: 1234, matches: 5678 },
      });
      const before = JSON.stringify(input);
      const page = managerHistoryPage(input);
      expect(tenureRows(input)[0].summary!.record.played).toBe(1);
      expect(managerHistoryPage(input)).toEqual(page);
      expect(JSON.stringify(input)).toBe(before);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
