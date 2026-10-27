import {
  isManagerPromotionMove,
  managerHistoryDateKey as dateKey,
  managerOutcomeSourceKey,
  type ManagerDivisionRef,
  type ManagerTenure,
} from '../../contracts/src/manager-history';
import {
  ManagerHistoryQueryError,
  type ManagerBestFinish,
  type ManagerFinalFinish,
  type ManagerHistoryCoverage,
  type ManagerHistoryMatch,
  type ManagerHistoryPage,
  type ManagerHistoryRow,
  type ManagerHistorySeason,
  type ManagerHistorySource,
  type ManagerRun,
  type ManagerTenureRow,
  type ManagerTenureSummary,
} from '../../contracts/src/manager-history-view';

export const MANAGER_HISTORY_VIEW_CONFIG = { pageSize: 20 } as const;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const divisionKey = (division: ManagerDivisionRef) =>
  JSON.stringify([division.country, division.tier, division.group]);
const sameDivision = (a: ManagerDivisionRef, b: ManagerDivisionRef) =>
  divisionKey(a) === divisionKey(b);
const limited = (coverage: ManagerHistoryCoverage, empty = false): ManagerHistoryCoverage =>
  empty ? 'unavailable' : coverage === 'unavailable' ? coverage : 'partial';
const combine = (a: ManagerHistoryCoverage, b: ManagerHistoryCoverage): ManagerHistoryCoverage =>
  a === 'complete' && b === 'complete'
    ? 'complete'
    : a === 'unavailable' && b === 'unavailable'
      ? 'unavailable'
      : 'partial';

interface Accumulator {
  row: ManagerTenureRow;
  summary: ManagerTenureSummary;
  best: Map<string, ManagerBestFinish>;
  seasons: Set<number>;
  winning: ManagerRun | null;
  unbeaten: ManagerRun | null;
  missingOutcomes: boolean;
  resolvedOutcomes: number;
}
function accumulator(tenure: ManagerTenure, source: ManagerHistorySource): Accumulator {
  const complete = tenure.appointed && dateKey(tenure.appointed) === dateKey(tenure.trackedFrom);
  const coverage = complete ? 'complete' : 'partial';
  const summary: ManagerTenureSummary = {
    coverage,
    honoursCoverage: coverage,
    honours: [],
    unresolvedOutcomes: [],
    bestFinishes: [],
    record: {
      scope: 'all-official-own-matches-90-minutes',
      coverage,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      winRate: null,
      sampleSize: 0,
    },
    winningRun: null,
    unbeatenRun: null,
    sourceSeasons: [],
    provisionalFinishes: [],
  };
  return {
    row: {
      kind: 'tenure',
      id: `tenure:${tenure.id}`,
      tenure: structuredClone(tenure),
      manager: {
        id: tenure.manager,
        name: tenure.name,
        interim: tenure.interim,
        ...(tenure.person ? { person: tenure.person } : {}),
        ...(tenure.knownSince === undefined ? {} : { since: tenure.knownSince }),
      },
      current:
        !tenure.ended && (!source.currentManager || source.currentManager.id === tenure.manager),
      coverage,
      summary,
    },
    summary,
    best: new Map(),
    seasons: new Set(),
    winning: null,
    unbeaten: null,
    missingOutcomes: false,
    resolvedOutcomes: 0,
  };
}
function extendRun(previous: ManagerRun | null, entry: ManagerHistoryMatch): ManagerRun {
  const endpoint = {
    match: entry.match.id,
    at: { ...entry.at },
    competition: entry.competition,
  };
  return {
    count: (previous?.count ?? 0) + 1,
    start: previous?.start ?? endpoint,
    end: endpoint,
    ongoing: false,
  };
}
function bestRun(best: ManagerRun | null, run: ManagerRun | null): ManagerRun | null {
  // On a tie retain the latest run, so a tied current record can be labelled ongoing.
  return run && run.count >= (best?.count ?? 0) ? run : best;
}
function addFinish(acc: Accumulator, finish: ManagerFinalFinish) {
  const key = divisionKey(finish.division);
  const best = acc.best.get(key);
  if (!best || finish.rank < best.rank)
    acc.best.set(key, {
      division: { ...finish.division },
      name: finish.name,
      rank: finish.rank,
      finishes: [finish],
    });
  else if (finish.rank === best.rank) best.finishes.push(finish);
}
function sharedSeason(
  year: number,
  acc: Accumulator,
  source: ManagerHistorySource,
  hidden: ReadonlySet<string>,
): boolean {
  const tenure = acc.row.tenure!;
  return (
    !tenure.appointed ||
    tenure.appointed.year > year ||
    (tenure.appointed.year === year && tenure.appointed.day > 0) ||
    !!source.facts?.tenures.some(
      (other) =>
        other.id !== tenure.id &&
        !hidden.has(other.id) &&
        other.trackedFrom.year <= year &&
        (!other.ended || other.ended.year >= year),
    )
  );
}
const cursorPrefix = 'manager-history:1:';
function startIndex(source: ManagerHistorySource, rows: ManagerHistoryRow[], cursor?: string) {
  if (cursor === undefined) return 0;
  try {
    if (!cursor.startsWith(cursorPrefix)) throw new Error();
    const value: unknown = JSON.parse(decodeURIComponent(cursor.slice(cursorPrefix.length)));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value[0] !== source.club ||
      typeof value[1] !== 'string'
    )
      throw new Error();
    const index = rows.findIndex((row) => row.id === value[1]);
    if (index < 0) throw new Error();
    return index + 1;
  } catch {
    throw new ManagerHistoryQueryError(
      'invalid-cursor',
      'This manager-history page position is invalid. Reload the manager history from the beginning.',
    );
  }
}

/** Pure summary read of explicit sources, with no dependency on World or the archive loader. */
export function managerHistoryPage(
  source: ManagerHistorySource,
  cursor?: string,
): ManagerHistoryPage {
  if (source.facts && source.facts.club !== source.club)
    throw new ManagerHistoryQueryError(
      'invalid-source',
      'Manager history belongs to a different club.',
    );
  const accumulators = new Map(
    (source.facts?.tenures ?? []).map((tenure) => [tenure.id, accumulator(tenure, source)]),
  );
  const ordered = source.matches
    .filter(({ match }) => match.home === source.club || match.away === source.club)
    .slice()
    .sort(
      (a, b) =>
        dateKey(a.at) - dateKey(b.at) || a.order - b.order || compareText(a.match.id, b.match.id),
    );
  const seenMatches = new Set<string>();
  const unknownDates: number[] = [];
  const participants = new Map<number, Set<string>>();
  let previous: Accumulator | undefined;
  let lastMatch: string | undefined;
  let lastAttributed: Accumulator | undefined;
  for (const entry of ordered) {
    if (seenMatches.has(entry.match.id)) continue;
    seenMatches.add(entry.match.id);
    lastMatch = entry.match.id;
    const acc = entry.match.managerTenure ? accumulators.get(entry.match.managerTenure) : undefined;
    if (previous && previous !== acc) {
      previous.winning = null;
      previous.unbeaten = null;
    }
    previous = acc;
    lastAttributed = acc;
    if (!acc) {
      // Missing attribution is never guessed from dates or a matching name. It also breaks runs.
      const day = dateKey(entry.at);
      if (source.facts && day >= dateKey(source.facts.trackedFrom) && unknownDates.at(-1) !== day)
        unknownDates.push(day);
      continue;
    }
    const { record } = acc.summary;
    const score = entry.match.regulation ?? entry.match.score;
    const own = entry.match.home === source.club ? score.home : score.away;
    const opponent = entry.match.home === source.club ? score.away : score.home;
    record.played++;
    if (own > opponent) record.won++;
    else if (own === opponent) record.drawn++;
    else record.lost++;
    acc.seasons.add(entry.match.year);
    const seasonParticipants = participants.get(entry.match.year) ?? new Set<string>();
    seasonParticipants.add(acc.row.tenure!.id);
    participants.set(entry.match.year, seasonParticipants);
    acc.winning = own > opponent ? extendRun(acc.winning, entry) : null;
    acc.unbeaten = own >= opponent ? extendRun(acc.unbeaten, entry) : null;
    acc.summary.winningRun = bestRun(acc.summary.winningRun, acc.winning);
    acc.summary.unbeatenRun = bestRun(acc.summary.unbeatenRun, acc.unbeaten);
  }
  // Both dates and tenure intervals are ordered: one sweep handles a long untracked career
  // without scanning every tenure for every old match. Same-day boundaries stay inclusive.
  let unknownIndex = 0;
  for (const acc of accumulators.values()) {
    const tenure = acc.row.tenure!;
    while (
      unknownIndex < unknownDates.length &&
      unknownDates[unknownIndex] < dateKey(tenure.trackedFrom)
    )
      unknownIndex++;
    const unknown = unknownDates[unknownIndex];
    if (unknown !== undefined && (!tenure.ended || unknown <= dateKey(tenure.ended)))
      acc.summary.record.coverage = limited(acc.summary.record.coverage);
  }
  const seasons = new Map<number, ManagerHistorySeason>();
  for (const season of source.seasons) {
    if (seasons.has(season.year))
      throw new ManagerHistoryQueryError(
        'invalid-source',
        'Supply one source snapshot per season.',
      );
    seasons.set(season.year, season);
  }
  const seenOutcomes = new Set<string>();
  const outcomes = (source.facts?.outcomes ?? []).filter((outcome) => {
    const key = managerOutcomeSourceKey(outcome.source);
    if (seenOutcomes.has(key)) return false;
    seenOutcomes.add(key);
    return true;
  });
  // An interim credited with no own match and no outcome stays in the facts but is left out of
  // every summary, list and count (HIST-18); one match or outcome shows him from his appointment.
  const credited = new Set(outcomes.map((outcome) => outcome.tenure));
  const hidden = new Set(
    [...accumulators]
      .filter(
        ([id, { row, summary }]) =>
          row.tenure!.interim && summary.record.played === 0 && !credited.has(id),
      )
      .map(([id]) => id),
  );
  for (const outcome of outcomes) {
    const acc = accumulators.get(outcome.tenure);
    if (!acc) continue;
    const season = seasons.get(outcome.source.year);
    const base = {
      source: structuredClone(outcome.source),
      at: { ...outcome.at },
      season: { year: outcome.source.year, club: source.club },
      sharedSeason:
        (participants.get(outcome.source.year)?.size ?? 0) > 1 ||
        sharedSeason(outcome.source.year, acc, source, hidden),
    };
    acc.seasons.add(outcome.source.year);
    let resolved = false;
    switch (outcome.source.kind) {
      case 'league-finish': {
        const league = season?.league;
        if (league?.final && sameDivision(league.division, outcome.source)) {
          const finish: ManagerFinalFinish = {
            division: { ...league.division },
            name: league.name,
            rank: league.rank,
            season: base.season,
            sharedSeason: base.sharedSeason,
          };
          addFinish(acc, finish);
          if (league.rank === 1)
            acc.summary.honours.push({
              ...base,
              kind: 'league-title',
              division: { ...league.division },
              name: league.name,
            });
          resolved = true;
        }
        break;
      }
      case 'cup-title': {
        const competition = outcome.source.competition;
        const cup = season?.cups.find((candidate) => candidate.competition === competition);
        if (cup?.final && cup.winner === source.club) {
          acc.summary.honours.push({ ...base, kind: 'cup-title', competition, name: cup.name });
          resolved = true;
        }
        break;
      }
      case 'promotion': {
        const promotionSource = outcome.source;
        const promotion = season?.promotions.find(
          (candidate) =>
            candidate.final &&
            candidate.club === source.club &&
            sameDivision(candidate.from, promotionSource.from) &&
            sameDivision(candidate.to, promotionSource.to) &&
            isManagerPromotionMove(candidate.from, candidate.to),
        );
        if (promotion) {
          acc.summary.honours.push({
            ...base,
            kind: 'promotion',
            from: { ...promotion.from },
            to: { ...promotion.to },
            fromName: promotion.fromName,
            toName: promotion.toName,
          });
          resolved = true;
        }
        break;
      }
    }
    if (resolved) acc.resolvedOutcomes++;
    else {
      acc.missingOutcomes = true;
      acc.summary.unresolvedOutcomes.push({
        source: base.source,
        season: base.season,
        at: base.at,
      });
    }
  }
  // Authoritative completed results without frozen attribution remain unknown, even if all
  // other facts are present. Dates/names cannot repair the missing link to a particular manager.
  for (const season of source.seasons) {
    const expected = [
      ...(season.league?.final
        ? [{ kind: 'league-finish' as const, year: season.year, ...season.league.division }]
        : []),
      ...season.cups
        .filter((cup) => cup.final && cup.winner === source.club)
        .map((cup) => ({
          kind: 'cup-title' as const,
          year: season.year,
          competition: cup.competition,
        })),
      ...season.promotions
        .filter(
          (promotion) =>
            promotion.final &&
            promotion.club === source.club &&
            isManagerPromotionMove(promotion.from, promotion.to),
        )
        .map((promotion) => ({ kind: 'promotion' as const, year: season.year, ...promotion })),
    ];
    if (expected.some((outcome) => !seenOutcomes.has(managerOutcomeSourceKey(outcome))))
      for (const acc of accumulators.values()) {
        const tenure = acc.row.tenure!;
        if (
          tenure.trackedFrom.year <= season.year &&
          (!tenure.ended || tenure.ended.year >= season.year)
        )
          acc.missingOutcomes = true;
      }
  }
  for (const acc of accumulators.values()) {
    const { summary, row } = acc;
    summary.record.sampleSize = summary.record.played;
    summary.record.winRate = summary.record.played
      ? summary.record.won / summary.record.played
      : null;
    if (source.matchesComplete === false)
      summary.record.coverage = limited(summary.record.coverage, summary.record.played === 0);
    if (source.outcomesComplete === false || acc.missingOutcomes)
      summary.honoursCoverage = limited(summary.honoursCoverage, acc.resolvedOutcomes === 0);
    summary.coverage = combine(summary.record.coverage, summary.honoursCoverage);
    row.coverage = summary.coverage;
    summary.bestFinishes = [...acc.best.values()].sort((a, b) =>
      compareText(divisionKey(a.division), divisionKey(b.division)),
    );
    summary.honours.sort(
      (a, b) =>
        dateKey(b.at) - dateKey(a.at) ||
        compareText(managerOutcomeSourceKey(a.source), managerOutcomeSourceKey(b.source)),
    );
    for (const best of summary.bestFinishes)
      best.finishes.sort((a, b) => b.season.year - a.season.year);
    summary.sourceSeasons = [...acc.seasons]
      .sort((a, b) => b - a)
      .map((year) => ({ year, club: source.club }));
    for (const run of [summary.winningRun, summary.unbeatenRun])
      if (run) run.ongoing = row.current && lastAttributed === acc && run.end.match === lastMatch;
    if (row.current)
      for (const season of source.seasons)
        if (season.league && !season.league.final)
          summary.provisionalFinishes.push({
            division: { ...season.league.division },
            name: season.league.name,
            rank: season.league.rank,
            season: { year: season.year, club: source.club },
          });
    summary.provisionalFinishes.sort((a, b) => b.season.year - a.season.year);
  }
  const sortable: { row: ManagerHistoryRow; year: number; day: number; order: number }[] = [
    ...[...accumulators.values()].flatMap(({ row }, index) =>
      hidden.has(row.tenure!.id)
        ? []
        : [
            {
              row,
              year: row.tenure!.trackedFrom.year,
              day: row.tenure!.trackedFrom.day,
              order: index,
            },
          ],
    ),
  ];
  if (!source.facts && source.currentManager)
    sortable.push({
      row: {
        kind: 'tenure',
        id: `current:${source.currentManager.id}`,
        tenure: null,
        manager: { ...source.currentManager },
        current: true,
        coverage: 'unavailable',
        summary: null,
      },
      year: Number.MAX_SAFE_INTEGER,
      day: 0,
      order: 0,
    });
  const seenEvents = new Set<string>();
  for (const event of source.personnelEvents) {
    if (seenEvents.has(event.id)) continue;
    seenEvents.add(event.id);
    sortable.push({
      row: {
        kind: 'legacy-event',
        id: `legacy:${event.id}`,
        event: structuredClone(event),
        coverage: 'unavailable',
      },
      year: event.event.year,
      day: event.at?.day ?? -1,
      order: event.order,
    });
  }
  sortable.sort(
    (a, b) =>
      b.year - a.year || b.day - a.day || b.order - a.order || compareText(a.row.id, b.row.id),
  );
  const rows = sortable.map(({ row }) => row);
  const start = startIndex(source, rows, cursor);
  const page = rows.slice(start, start + MANAGER_HISTORY_VIEW_CONFIG.pageSize);
  return {
    rows: page,
    nextCursor:
      start + page.length < rows.length
        ? cursorPrefix + encodeURIComponent(JSON.stringify([source.club, page.at(-1)!.id]))
        : null,
    total: rows.length,
    pageSize: MANAGER_HISTORY_VIEW_CONFIG.pageSize,
  };
}
