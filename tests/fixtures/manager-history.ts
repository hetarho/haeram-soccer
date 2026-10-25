import type {
  ManagerDivisionRef,
  ManagerHistoryFacts,
  ManagerHistoryIdentity,
} from '../../packages/contracts/src/manager-history';
import type {
  ManagerHistoryMatch,
  ManagerHistoryPage,
  ManagerHistoryRow,
  ManagerHistorySeason,
  ManagerHistorySource,
  ManagerLegacyEvent,
  ManagerTenureRow,
} from '../../packages/contracts/src/manager-history-view';
import type { CareerDate, World } from '../../packages/contracts/src/types';
import {
  MANAGER_HISTORY_VIEW_CONFIG,
  managerHistoryPage,
} from '../../packages/engine/src/manager-achievements';
import {
  attributeManagerOutcome,
  createManagerHistoryFacts,
  recordManagerTenureChange,
} from '../../packages/engine/src/manager-history';
import {
  activateMatchModel,
  advanceRound,
  createWorld,
  ensureManagerHistory,
  managerCandidates,
  MATCH_MODEL_RELEASE,
  operate,
  simulateSeason,
} from '../../packages/engine/src/index';
import { Host } from '../../apps/web/src/runtime/host';
import {
  managerRowView,
  type ManagerLegacyView,
  type ManagerTenureView,
} from '../../apps/web/src/ui/managerHistoryView';
import { DISABLED_RELEASE, withoutManagerHistory } from './worlds';

/**
 * Marked synthetic manager-history fixtures (T305; →ARCH-21, HIST-18/19, WEB-92): small
 * hand-written tenures, matches and season snapshots, never a simulated or production career.
 * Facts go through the real T304 fact operations and pages through the real query, so the view
 * tests see the summaries production will produce. T307/T308 may extend these builders.
 */
export const MANAGER_HISTORY_FIXTURE = { synthetic: true, club: 'synthetic:club' } as const;
const club = MANAGER_HISTORY_FIXTURE.club;

export const managerFixtureDate = (year: number, day = 0): CareerDate => ({ year, day });
export const managerFixtureDivision = (
  tier = 0,
  group = 0,
  country = 'KOR',
): ManagerDivisionRef => ({
  country,
  tier,
  group,
});
export const managerFixtureIdentity = (
  id: string,
  name: string,
  extra: Partial<Omit<ManagerHistoryIdentity, 'id' | 'name'>> = {},
): ManagerHistoryIdentity => ({ id: `synthetic:manager:${id}`, name, interim: false, ...extra });

/** One own official match; `tenure` is the frozen attribution, omitted for an unattributed one. */
export function managerFixtureMatch(
  id: string,
  at: CareerDate,
  tenure: string | undefined,
  own: number,
  opponent: number,
  extra: { kind?: 'league' | 'cup'; competition?: string; shootout?: boolean } = {},
): ManagerHistoryMatch {
  return {
    match: {
      id: `synthetic:match:${id}`,
      year: at.year,
      kind: extra.kind ?? 'league',
      home: club,
      away: 'synthetic:opponent',
      score: { home: own, away: opponent },
      ...(extra.shootout ? { shootout: { home: 5, away: 4 } } : {}),
      ...(tenure ? { managerTenure: tenure } : {}),
    },
    at,
    order: at.day,
    competition: extra.competition ?? 'Synthetic League',
  };
}
export function managerFixtureSeason(
  year: number,
  input: Partial<Omit<ManagerHistorySeason, 'year'>> = {},
): ManagerHistorySeason {
  return { year, cups: [], promotions: [], ...input };
}
export function managerFixtureLegacy(
  id: string,
  year: number,
  round: number,
  title: string,
  detail: string,
): ManagerLegacyEvent {
  return {
    id: `synthetic:event:${id}`,
    order: round,
    event: { year, round, kind: 'manager-hire', title, detail },
  };
}
export function managerFixtureSource(
  input: Partial<ManagerHistorySource> = {},
): ManagerHistorySource {
  return { club, matches: [], seasons: [], personnelEvents: [], ...input };
}
/** A page assembled from explicit rows, for list states that need no query (loading, cursors). */
export function managerFixturePage(
  rows: ManagerHistoryRow[],
  extra: Partial<Omit<ManagerHistoryPage, 'rows'>> = {},
): ManagerHistoryPage {
  return {
    rows,
    nextCursor: null,
    total: rows.length,
    pageSize: MANAGER_HISTORY_VIEW_CONFIG.pageSize,
    ...extra,
  };
}
export const managerFixtureQuery = (source: ManagerHistorySource, cursor?: string) =>
  managerHistoryPage(source, cursor);
export const managerFixtureTenures = (page: ManagerHistoryPage): ManagerTenureRow[] =>
  page.rows.filter((row): row is ManagerTenureRow => row.kind === 'tenure');

const founded = (year: number, manager: ManagerHistoryIdentity) =>
  createManagerHistoryFacts({
    club,
    at: { ...managerFixtureDate(year), revision: 0 },
    coverage: 'founding',
    manager,
  });
const appoint = (
  facts: ManagerHistoryFacts,
  key: string,
  at: CareerDate,
  manager: ManagerHistoryIdentity,
) =>
  recordManagerTenureChange(facts, {
    kind: 'appointment',
    key: `synthetic:${key}`,
    at,
    manager,
    departure: 'replaced',
  });
const tenureId = (facts: ManagerHistoryFacts, index: number) => facts.tenures[index].id;

/** A fully tracked manager with real results and a final league finish but no honour. */
export function trophylessCareer(): ManagerHistorySource {
  const facts = founded(1950, managerFixtureIdentity('han', 'Han Trophyless', { since: 1950 }));
  const tenure = tenureId(facts, 0);
  return managerFixtureSource({
    facts: attributeManagerOutcome(
      facts,
      { kind: 'league-finish', year: 1950, ...managerFixtureDivision(1) },
      { at: managerFixtureDate(1950, 300) },
    ),
    matches: [
      managerFixtureMatch('han-1', managerFixtureDate(1950, 20), tenure, 2, 0),
      managerFixtureMatch('han-2', managerFixtureDate(1950, 40), tenure, 1, 1),
      managerFixtureMatch('han-3', managerFixtureDate(1950, 60), tenure, 0, 3),
    ],
    seasons: [
      managerFixtureSeason(1950, {
        league: { division: managerFixtureDivision(1), name: '2부', rank: 6, final: true },
        cups: [
          {
            competition: 'synthetic:cup',
            name: 'Synthetic Cup',
            winner: 'synthetic:other',
            final: true,
          },
        ],
      }),
    ],
  });
}

/**
 * The same manager twice, around a same-day interim who managed no match: three tenures, the
 * second one fully tracked with no match and no honour.
 */
export function reappointedCareer(): ManagerHistorySource {
  const park = managerFixtureIdentity('park', 'Park Again', { since: 1960 });
  let facts = founded(1960, park);
  facts = appoint(facts, 'interim', managerFixtureDate(1960, 100), {
    ...managerFixtureIdentity('lee', 'Lee Interim', { since: 1960 }),
    interim: true,
  });
  facts = appoint(facts, 'park-again', managerFixtureDate(1960, 100), park);
  const [first, , again] = [0, 1, 2].map((index) => tenureId(facts, index));
  return managerFixtureSource({
    facts,
    currentManager: park,
    matches: [
      managerFixtureMatch('park-1', managerFixtureDate(1960, 10), first, 1, 0),
      managerFixtureMatch('park-2', managerFixtureDate(1960, 50), first, 3, 1),
      managerFixtureMatch('park-3', managerFixtureDate(1960, 150), again, 2, 0),
      managerFixtureMatch('park-4', managerFixtureDate(1960, 200), again, 1, 0),
      managerFixtureMatch('park-5', managerFixtureDate(1960, 250), again, 1, 1, {
        kind: 'cup',
        competition: 'Synthetic Cup',
        shootout: true,
      }),
    ],
  });
}

/**
 * A cup winner replaced before the season closes: the cup stays his, while the league table his
 * successor finalised is a shared season's result. The next season is in progress.
 */
export function replacedCupWinnerCareer(): ManagerHistorySource {
  const yoon = managerFixtureIdentity('yoon', 'Yoon Closer', { since: 1970 });
  let facts = founded(1970, managerFixtureIdentity('cho', 'Cho Cup', { since: 1970 }));
  facts = attributeManagerOutcome(
    facts,
    { kind: 'cup-title', year: 1970, competition: 'synthetic:fa-cup' },
    { at: managerFixtureDate(1970, 120) },
  );
  facts = appoint(facts, 'yoon', managerFixtureDate(1970, 150), yoon);
  facts = attributeManagerOutcome(
    facts,
    { kind: 'league-finish', year: 1970, ...managerFixtureDivision(0) },
    { at: managerFixtureDate(1970, 300) },
  );
  const [cho, closer] = [0, 1].map((index) => tenureId(facts, index));
  return managerFixtureSource({
    facts,
    currentManager: yoon,
    matches: [
      managerFixtureMatch('cho-1', managerFixtureDate(1970, 20), cho, 2, 1),
      managerFixtureMatch('cho-2', managerFixtureDate(1970, 120), cho, 1, 0, {
        kind: 'cup',
        competition: 'FA컵',
      }),
      managerFixtureMatch('yoon-1', managerFixtureDate(1970, 200), closer, 0, 1),
      managerFixtureMatch('yoon-2', managerFixtureDate(1970, 250), closer, 2, 2),
    ],
    seasons: [
      managerFixtureSeason(1970, {
        league: { division: managerFixtureDivision(0), name: '1부', rank: 2, final: true },
        cups: [{ competition: 'synthetic:fa-cup', name: 'FA컵', winner: club, final: true }],
      }),
      managerFixtureSeason(1971, {
        league: { division: managerFixtureDivision(0), name: '1부', rank: 3, final: false },
      }),
    ],
  });
}

/**
 * Tracking activated in an existing career: the manager's known earlier service year is kept
 * apart from the tracking date, and an older readable hiring stays a separate narrative row.
 */
export function knownEarlierServiceCareer(): ManagerHistorySource {
  const seo = managerFixtureIdentity('seo', 'Seo Veteran', { since: 1979 });
  let facts = createManagerHistoryFacts({
    club,
    at: { ...managerFixtureDate(1985, 40), revision: 0 },
    coverage: 'activation',
    manager: seo,
  });
  facts = attributeManagerOutcome(
    facts,
    { kind: 'league-finish', year: 1985, ...managerFixtureDivision(2) },
    { at: managerFixtureDate(1985, 300) },
  );
  return managerFixtureSource({
    facts,
    currentManager: seo,
    matches: [managerFixtureMatch('seo-1', managerFixtureDate(1985, 60), tenureId(facts, 0), 3, 0)],
    seasons: [
      managerFixtureSeason(1985, {
        league: { division: managerFixtureDivision(2), name: '3부', rank: 1, final: true },
      }),
    ],
    personnelEvents: [
      managerFixtureLegacy('seo-hire', 1979, 4, 'Seo Veteran 선임', '구단이 새 감독을 선임했어요.'),
    ],
  });
}

/** No structured facts yet: the current manager and older readable events only. */
export function untrackedCareer(): ManagerHistorySource {
  return managerFixtureSource({
    currentManager: managerFixtureIdentity('kang', 'Kang Before', { since: 1990 }),
    personnelEvents: [
      managerFixtureLegacy('kang-hire', 1990, 2, 'Kang Before 선임', '새 감독이 부임했어요.'),
      managerFixtureLegacy('old-exit', 1989, 30, 'Old Boss 사임', '전임 감독이 물러났어요.'),
    ],
  });
}

/*
 * Browser-journey careers (T308; →WEB-92/74, HIST-18/19, SAVE-24): real careers settled by the
 * engine's own commands, imported into the build. Their marked synthetic shortcuts are named where
 * they are made: a cash reserve so hiring never waits for money, an own squad at 99 in every
 * attribute so the founding manager wins the domestic cup, and a manager pushed to pride 90 /
 * trust 20 / two conflicts so one strong demand makes him resign. What the records room should
 * show is read in Node through the worker host's own read and T305's view labels, never restated.
 */

/** Every page of the worker's manager-history read of `w`, through the host the build runs. */
export async function managerHistoryRead(w: World) {
  const host = new Host();
  host.world = w;
  const pages: ManagerHistoryPage[] = [];
  let cursor: string | undefined;
  do {
    const reply = await host.handle({
      protocol: 1,
      session: 'fixture',
      requestId: `manager-history-${pages.length}`,
      expectedRevision: -1,
      generation: 1,
      parentGeneration: 0,
      body: { type: 'manager-history', world: w.id, ...(cursor ? { cursor } : {}) },
    });
    if (!reply.managerHistory) throw new Error(`manager-history read failed: ${reply.error}`);
    pages.push(reply.managerHistory);
    cursor = reply.managerHistory.nextCursor ?? undefined;
  } while (cursor);
  const rows = pages.flatMap((page) => page.rows);
  return { pages, rows, views: rows.map(managerRowView) };
}
const tenureViews = (views: ReturnType<typeof managerRowView>[]) =>
  views.filter((view): view is ManagerTenureView => view.kind === 'tenure');

const freeManager = (w: World, except: readonly string[] = []) =>
  managerCandidates(w).find((offer) => offer.source === 'free' && !except.includes(offer.id));
function hire(w: World, id: string | undefined) {
  if (!id) throw new Error('no free manager to appoint');
  operate(w, { type: 'hire', id });
}
/** Whole rounds until the own club has settled `n` more matches. */
function playOwnMatches(w: World, n = 1) {
  const target = w.ownMatches.length + n;
  for (let round = 0; round < 12 && w.ownMatches.length < target; round++)
    advanceRound(w, undefined, false);
  if (w.ownMatches.length < target) throw new Error('the own club settled no match in 12 rounds');
}

export interface ManagerJourneyCareer {
  world: World;
  /** Every row the records room shows, newest first, as T305 labels it. */
  views: ReturnType<typeof managerRowView>[];
  pageSize: number;
  /** The founding manager: the cup won in 1950, then replaced mid-season. */
  cupWinner: ManagerTenureView;
  /** The successor who finished 1950 (shared season) and was appointed again in 1951. */
  closer: ManagerTenureView;
  reappointed: ManagerTenureView;
  /** Appointed in 1951 and replaced the same day without a match. */
  replacedSameDay: ManagerTenureView;
  interim: ManagerTenureView;
  current: ManagerTenureView;
  cupSeason: number;
}

/**
 * A two-season career whose tenures run to a second page: the founding manager wins the domestic
 * cup in 1950 and is then replaced, his successor closes 1950 with the league and promotion, is
 * replaced on the first day of 1951 and reappointed the same day, resigns over a strong demand
 * (the interim plays on), and 21 appointments follow, each after an own match.
 */
export async function managerJourneyCareer(): Promise<ManagerJourneyCareer> {
  for (const seed of ['manager-journey', 'manager-journey-2', 'manager-journey-4']) {
    const w = createWorld({
      country: 'ENG',
      name: 'Tenure Journey',
      color: '#2d5a3f',
      seed,
      level: 'easy',
    });
    w.cash = '999999999999';
    for (const player of w.players)
      for (const key of Object.keys(player.attrs) as (keyof typeof player.attrs)[])
        player.attrs[key] = 99;
    const cup = () => w.cups?.find((entry) => entry.country === 'ENG');
    for (let round = 0; round < 46 && !cup()?.winner; round++) advanceRound(w, undefined, false);
    if (cup()?.winner !== w.playerClub) continue;
    const cupYear = w.year;
    const closer = freeManager(w)!;
    hire(w, closer.id);
    simulateSeason(w);
    // The first day of 1951: another manager, then the one he replaced again.
    hire(w, freeManager(w, [closer.id])?.id);
    hire(w, closer.id);
    w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
    operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
    if (!w.manager.interim) throw new Error('the reappointed manager did not resign');
    playOwnMatches(w, 2);
    for (let n = 0; n < 21; n++) {
      hire(w, freeManager(w, [w.manager.id])?.id);
      playOwnMatches(w);
    }
    if (w.critical) throw new Error(`the journey career holds a blocking alert: ${w.critical}`);
    const { pages, views } = await managerHistoryRead(w);
    const tenures = tenureViews(views),
      facts = w.managerHistory!.tenures;
    const view = (index: number) => tenures.find((t) => t.id === `tenure:${facts[index]!.id}`)!;
    return {
      world: w,
      views,
      pageSize: pages[0]!.pageSize,
      cupWinner: view(0),
      closer: view(1),
      replacedSameDay: view(2),
      reappointed: view(3),
      interim: view(4),
      current: tenures[0]!,
      cupSeason: cupYear,
    };
  }
  throw new Error('no seeded journey career whose founding manager wins the cup');
}

export interface ManagerActivationCareer {
  /** The career as a writer before this feature saved it: no facts and no links. */
  world: World;
  /** What a read-only tab shows of it as stored: the manager in charge and the older events. */
  untracked: { current: ManagerTenureView; legacy: ManagerLegacyView[] };
  /** What the writer's activation at load shows, read from the same world activated in Node. */
  views: ReturnType<typeof managerRowView>[];
  current: ManagerTenureView;
  legacy: ManagerLegacyView[];
}
const legacyViews = (views: ReturnType<typeof managerRowView>[]) =>
  views.filter((view): view is ManagerLegacyView => view.kind === 'legacy');

/**
 * A supported career saved before manager history and the full match model's release: one season
 * on the pre-feature model with a mid-season appointment and three rounds into the next, its facts
 * and links stripped as an older writer left it.
 */
export async function managerActivationCareer(): Promise<ManagerActivationCareer> {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Activation Athletic',
      color: '#4a3b2a',
      seed: 'manager-activation',
      level: 'easy',
    },
    DISABLED_RELEASE,
  );
  w.cash = '999999999999';
  // Every business decision delegated, so the seeded seasons leave no owner answer pending.
  const responsibilities = w.settings!.responsibilities;
  for (const key of Object.keys(responsibilities) as (keyof typeof responsibilities)[])
    responsibilities[key] = 'delegated';
  for (let round = 0; round < 20; round++) advanceRound(w, undefined, false);
  hire(w, freeManager(w)?.id);
  simulateSeason(w);
  if (w.critical) hire(w, freeManager(w)?.id);
  for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
  const world = withoutManagerHistory(w);
  const stored = (await managerHistoryRead(world)).views;
  // The writer's activation (Host.adoptModel, then adoptManagerHistory): the next revision, the
  // released model and manager tracking both from today.
  const activated = { ...structuredClone(world), revision: world.revision + 1 };
  activateMatchModel(activated, MATCH_MODEL_RELEASE);
  ensureManagerHistory(activated);
  const { views } = await managerHistoryRead(activated);
  return {
    world,
    untracked: { current: tenureViews(stored)[0]!, legacy: legacyViews(stored) },
    views,
    current: tenureViews(views)[0]!,
    legacy: legacyViews(views),
  };
}
