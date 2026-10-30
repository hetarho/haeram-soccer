import { worldMarketPage, worldMarketDetail } from '../../../../packages/engine/src/world-market';
import { mediationPreview } from '../../../../packages/engine/src/mediation';
import { fullStatsRead } from '../../../../packages/engine/src/npc-stats';
import { personCareer } from './personCareer';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { recentClubResults } from '../../../../packages/engine/src/recent-results';
import { startingSquad } from '../../../../packages/engine/src/world';
import { staffMarket } from '../../../../packages/engine/src/staff';
import { careerAssessment } from '../../../../packages/engine/src/career-assessment';
import { nextEventDays } from '../../../../packages/engine/src/next-event';
import { pendingDecisions, stoppingReasons } from '../../../../packages/engine/src/stopping';
import {
  createWorld,
  advanceRound,
  advanceDays,
  prepareRound,
  completeRound,
  seasonLength,
  groupKey,
  closeSeason,
  operate,
  managerCandidates,
  transferOffers,
  sponsorSlots,
  operatingCost,
  europeanCoefficient,
  clubNews,
  installMissingIdentities,
  activateMatchModel,
  activatesMatchModel,
  ensureManagerHistory,
  MATCH_MODEL_RELEASE,
  BANKRUPT_MESSAGE,
  clubOf,
  domesticCupName,
  fixtureDay,
  ownLeagueClubs,
  ranked,
  ROUND_INTERVAL_DAYS,
  type MatchModelRelease,
} from '../../../../packages/engine/src/index';
import { managerHistoryPage } from '../../../../packages/engine/src/manager-achievements';
import type {
  ManagerHistorySeason,
  ManagerHistorySource,
} from '../../../../packages/contracts/src/manager-history-view';
import type { World, MatchPlayback } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import { CURRENT_CATALOG } from '../../../../packages/catalogs/src/index';
import { decode, encode } from '../adapters/persistence';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import { financialBreakdown } from '../../../../packages/engine/src/finance';
import { transferLedger } from '../../../../packages/engine/src/transfer-records';
import {
  requestSchema,
  worldMetadataOf,
  type CodecJob,
  type Request,
  type Reply,
  type View,
} from './protocol';
import { ViewPublisher } from './viewPublisher';
import { playDay, type DaySteps, type HelperPool } from './helperPool';
const DAY_STEPS: DaySteps = { prepareRound, completeRound, advanceDays };
/** The patch policy lives with publication; existing importers still find it here. */
export { VIEW_PATCH } from './viewPublisher';
import { clubRecords } from './clubRecords';
import { headToHead } from './headToHead';
import { tallies } from './playerTallies';
import { divisionName, kindLabel } from '../presentation/competitionLabels';
/**
 * KIT-15: a copy of the validated candidate with only its missing club identities installed (each
 * club's legacy crest and colour kept), or the candidate itself when none is missing. The revision
 * moves once: not again when a rules or catalog upgrade has already moved it.
 */
function adoptIdentities(w: World, revised: boolean): World {
  if (w.clubs.every((club) => club.identity)) return w;
  const candidate = structuredClone(w);
  if (!installMissingIdentities(candidate)) return w;
  if (!revised) {
    if (!Number.isSafeInteger(candidate.revision + 1))
      throw new Error('저장 revision 범위를 초과했습니다.');
    candidate.revision++;
  }
  return candidate;
}
/**
 * Whether `live` has settled an own match that `candidate`, a checkpoint of the same career, does
 * not hold yet: a queued or revealed playback (or a day step's result) still ahead of that
 * checkpoint. Loading the checkpoint replays the fixture, and it must replay under the model it
 * was settled with, so the match-model activation waits for a checkpoint that holds it (→SAVE-23).
 */
function settledAhead(live: World | undefined, candidate: World) {
  if (live?.id !== candidate.id) return false;
  const held = new Set(candidate.ownMatches.map((m) => m.id));
  return live.ownMatches.some((m) => !held.has(m.id));
}
/** The own club's place in its league this season once a league match is played, else none. */
function provisionalPlace(w: World) {
  const own = clubOf(w);
  if (!w.tables[own.id]?.played) return undefined;
  return ranked(w, ownLeagueClubs(w)).findIndex((club) => club.id === own.id) + 1;
}
/**
 * The manager-history query's explicit sources (→HIST-18/19, WEB-92), read from the live world:
 * the canonical facts; every retained own match at its fixture day in settlement order; one
 * snapshot per closed season (its final table, its cup winners and a promotion, the division it
 * led to being the next season's) and this season's decided cups and provisional place; and the
 * readable personnel events of the league rounds over before tracking began, keyed by their place
 * in the event log.
 * Nothing is parsed from a name or kept: every read builds the sources again.
 */
function managerHistorySource(w: World): ManagerHistorySource {
  const own = clubOf(w),
    code = own.country,
    facts = w.managerHistory;
  const division = (tier: number, group: number) => ({ country: code, tier, group });
  const seasons: ManagerHistorySeason[] = w.history.map((h, index) => {
    const next = w.history[index + 1] ?? (h.year === w.year - 1 ? own : undefined),
      domestic = h.champions.find((entry) => entry.country === code)?.cup;
    return {
      year: h.year,
      league: {
        division: division(h.tier, h.group),
        name: divisionName(code, h.tier, h.group),
        rank: h.rank,
        final: true,
      },
      cups: [
        ...(domestic
          ? [{ competition: 'cup', name: domesticCupName(code), winner: domestic, final: true }]
          : []),
        ...h.europe.map((e) => ({
          competition: e.kind,
          name: e.name,
          winner: e.winner,
          final: true,
        })),
      ],
      promotions:
        next && next.tier < h.tier
          ? [
              {
                club: own.id,
                from: division(h.tier, h.group),
                to: division(next.tier, next.group),
                fromName: divisionName(code, h.tier, h.group),
                toName: divisionName(code, next.tier, next.group),
                final: true,
              },
            ]
          : [],
    };
  });
  if (!w.history.some((h) => h.year === w.year)) {
    const place = provisionalPlace(w),
      cup = w.cups?.find((entry) => entry.country === code);
    seasons.push({
      year: w.year,
      ...(place
        ? {
            league: {
              division: division(own.tier, own.group),
              name: divisionName(code, own.tier, own.group),
              rank: place,
              final: false,
            },
          }
        : {}),
      cups: [
        ...(cup?.winner
          ? [{ competition: 'cup', name: cup.name, winner: cup.winner, final: true }]
          : []),
        ...w.europe.flatMap((t) =>
          t.winner ? [{ competition: t.key, name: t.name, winner: t.winner, final: true }] : [],
        ),
      ],
      promotions: [],
    });
  }
  // Events from the tracked period are the tenures' own story; only older ones stay readable rows.
  // An event carries the league round its day falls in (round r covers days 7r to 7r + 6, the
  // round's own day included), not its day, so only a round over before the tracking day is wholly
  // older. The round tracking began in may hold changes on either side of it, so its events are
  // left to the tenures (the 감독들이 남긴 계절 panel still shows every event as written).
  const tracked = facts?.trackedFrom;
  const older = (event: { year: number; round: number }) =>
    !tracked ||
    event.year < tracked.year ||
    (event.year === tracked.year && event.round < Math.floor(tracked.day / ROUND_INTERVAL_DAYS));
  return {
    ...(facts ? { facts } : {}),
    club: own.id,
    currentManager: {
      id: w.manager.id,
      name: w.manager.name,
      interim: w.manager.interim,
      ...(w.manager.person ? { person: w.manager.person } : {}),
      since: w.manager.since,
    },
    matches: w.ownMatches.map((match, order) => ({
      match,
      at: { year: match.year, day: Math.max(0, fixtureDay(match)) },
      order,
      competition: kindLabel[match.kind] ?? match.kind,
    })),
    seasons,
    personnelEvents: w.events.flatMap((event, index) =>
      (event.kind === 'manager-hire' || event.kind === 'manager-departure') && older(event)
        ? [
            {
              id: `event:${index}`,
              order: index,
              event: {
                year: event.year,
                round: event.round,
                kind: event.kind,
                title: event.title,
                detail: event.detail,
              },
            },
          ]
        : [],
    ),
  };
}
/**
 * What the manager-history read depends on, short enough to publish daily (→HIST-18): the facts'
 * tracking boundary, appointments and outcomes, the settled own matches, the closed seasons, the
 * manager in charge and this season's provisional place. A same-round cup final or appointment
 * moves it; a day without any of them does not.
 */
function managerHistoryKey(w: World) {
  const facts = w.managerHistory;
  return [
    facts
      ? `${facts.trackedFrom.revision}.${facts.serial}.${facts.tenures.length}.${facts.outcomes.length}`
      : '-',
    w.ownMatches.length,
    w.history.length,
    w.manager.id,
    w.manager.interim ? 1 : 0,
    provisionalPlace(w) ?? 0,
  ].join(':');
}
const failure = (input: unknown, request: Request | undefined, error: unknown) => ({
  requestId: request?.requestId ?? ((input as { requestId?: string })?.requestId || 'invalid'),
  ok: false,
  error: String(error).slice(0, 1600),
});
export class Host {
  world?: World;
  private session?: string;
  private acknowledgments = new Map<string, Reply>();
  private queue = Promise.resolve();
  // One immutable, fully validated inspection, consumed on activation. Match the complete raw
  // string; never reuse a live world or trust header/checksum identity alone.
  private inspected?: { raw: string; result: Awaited<ReturnType<typeof decode>> };
  private newsCache?: { key: string; news: View['news'] };
  private ledgerCache?: { events: World['events']; end: number; ledger: View['transferLedger'] };
  /** Numbers, retains and diffs the views this host publishes. */
  private views = new ViewPublisher();
  cancelled = false;
  /** The port to the client's codec worker, which builds every checkpoint (→ARCH-13). */
  codec?: { postMessage(job: CodecJob): void };
  /** The client's fixture helpers, when it created them (→ARCH-6); without, every fixture plays here. */
  helpers?: HelperPool;
  /** An own match day waiting for its helpers: the world is mid-day, so reads wait for it. */
  private round?: Promise<void>;
  /** Whether founding and writer activation record the full match model; only tests set it. */
  private release: MatchModelRelease;
  constructor(
    private progress: (reply: Reply) => void = () => {},
    options: { release?: MatchModelRelease } = {},
  ) {
    this.release = options.release ?? MATCH_MODEL_RELEASE;
  }
  /**
   * SAVE-23: a copy of the validated candidate on the full match model, or on its later revision
   * when it plays an earlier one, or the candidate itself when the release is off, it already
   * plays the release's revision (its recorded model is kept whatever the switch says), its rules
   * are earlier or this career's live world has settled an own match the checkpoint lacks (the
   * activation or upgrade then waits for a checkpoint that holds it). Like identity adoption, the
   * revision moves once, and the model records the revision it is written in.
   */
  private adoptModel(w: World, revised: boolean): World {
    if (!activatesMatchModel(w, this.release) || settledAhead(this.world, w)) return w;
    const candidate = structuredClone(w);
    if (!revised) {
      if (!Number.isSafeInteger(candidate.revision + 1))
        throw new Error('저장 revision 범위를 초과했습니다.');
      candidate.revision++;
    }
    activateMatchModel(candidate, this.release);
    return candidate;
  }
  /**
   * SAVE-24: the validated candidate with own-manager tracking started at this writer boundary, or
   * the candidate itself when it is already tracked or this career's live world has settled an
   * own match the checkpoint lacks (tracking then waits, as the model does). Independent of the
   * release switch and its football metadata; older facts and service years stay as stored, and
   * only the facts and the revision (once) are added.
   */
  private adoptManagerHistory(w: World, revised: boolean): World {
    if (w.managerHistory || settledAhead(this.world, w)) return w;
    if (!revised && !Number.isSafeInteger(w.revision + 1))
      throw new Error('저장 revision 범위를 초과했습니다.');
    const candidate = { ...w, revision: revised ? w.revision : w.revision + 1 };
    ensureManagerHistory(candidate);
    return candidate;
  }
  handle(input: unknown): Promise<Reply> {
    // A read is answered at once, between a command's simulation steps: queued behind a long
    // command, its watchdog would run out while only the command reports progress.
    const type = (input as { body?: { type?: unknown } } | null)?.body?.type;
    if (
      type === 'world-market' ||
      type === 'world-market-detail' ||
      type === 'head-to-head' ||
      type === 'person-career' ||
      type === 'recruitment-history' ||
      type === 'mediation-preview' ||
      type === 'league-fixtures' ||
      type === 'full-stats' ||
      type === 'club-records' ||
      type === 'archive' ||
      type === 'manager-history'
    )
      return this.round ? this.afterRound(input) : Promise.resolve(this.read(input));
    const task = this.queue.then(() => this.execute(input));
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  /** A read arriving mid-day, answered once no own match day waits for its helpers. */
  private async afterRound(input: unknown) {
    while (this.round) await this.round;
    return this.read(input);
  }
  /** The next day of a day step; an own match day may wait for its helpers, holding reads. */
  private async day(w: World, observe: boolean) {
    const step = playDay(this.helpers, w, observe, DAY_STEPS);
    if (!(step instanceof Promise)) return step;
    this.round = step.then(
      () => {},
      () => {},
    );
    try {
      return await step;
    } finally {
      this.round = undefined;
    }
  }
  /**
   * News reads the whole career (records, debuts, event order), so it is derived here rather than
   * from the projected world, whose recent windows would shift IDs and replay celebrations.
   */
  private news(w: World): View['news'] {
    const key = [
      w.id,
      w.year,
      w.round,
      w.ownMatches.length,
      w.events.length,
      w.rankHistory?.length,
      w.history.length,
    ].join(':');
    if (this.newsCache?.key !== key) this.newsCache = { key, news: clubNews(w) };
    return this.newsCache.news;
  }
  /**
   * The older career's transfer ledger (→HIST-20): fixed once the first fact is recorded, so it is
   * read again only while the boundary moves.
   */
  private transferLedger(w: World): View['transferLedger'] {
    const end = w.transfers?.ledgerBefore ?? w.events.length;
    if (this.ledgerCache?.events !== w.events || this.ledgerCache.end !== end)
      this.ledgerCache = { events: w.events, end, ledger: transferLedger(w) };
    return this.ledgerCache.ledger;
  }
  private view(w = this.world): View | undefined {
    if (!w) return;
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    const ownGroup = groupKey(own);
    const next = nextOwnFixture(w);
    const opponentId = next && (next.home === w.playerClub ? next.away : next.home);
    const opponent = w.clubs.find((club) => club.id === opponentId);
    const briefingClubs = new Set(next ? [next.home, next.away] : [w.playerClub]);
    // The season's complete statistics are read on request (`full-stats`), not sent every day, and
    // so are the manager-history facts.
    const { people: _people, npcSeason: _season, managerHistory: _history, ...projected } = w;
    void _people;
    void _season;
    void _history;
    return {
      coaches: staffMarket(w),
      careers: Object.fromEntries(
        [...w.players.filter((p) => p.status === 'active'), ...(w.academy?.players ?? [])].map(
          (p) => [p.id, careerAssessment(w, p, true)],
        ),
      ),
      world: {
        ...projected,
        // Browser projections omit `people`; resolving names there would regenerate old identities.
        nextOpponentLineup:
          next && opponent
            ? {
                fixture: next.id,
                club: opponent.id,
                players: startingSquad(w, opponent, next).map(({ id, name }) => ({ id, name })),
              }
            : undefined,
        // The report gets both clubs' actual form, including a rival outside our league.
        // Keep every other club's retained results on the worker instead of sending them daily.
        recentResults: Object.fromEntries(
          [...briefingClubs].map((club) => [club, recentClubResults(w, club)]),
        ),
        mediations: [
          ...(w.mediations ?? []).filter((m) => m.status === 'pending'),
          ...(w.mediations ?? []).filter((m) => m.status !== 'pending').slice(-20),
        ],
        promises: [
          ...(w.promises ?? []).filter((p) => p.status === 'pending'),
          ...(w.promises ?? []).filter((p) => p.status !== 'pending').slice(-20),
        ],
        ownMatches: w.ownMatches.slice(-30),
        fixtures: w.fixtures.filter(
          (f) =>
            f.home === w.playerClub ||
            f.away === w.playerClub ||
            (w.lower ? f.kind === 'lower' : f.groupKey === ownGroup),
        ),
        // Brackets and scorer tables come with the archive request; the small rank series and Elo
        // spread stay for the records charts.
        history: w.history.map((h) => {
          const season = {
            ...h,
            standings: [],
            europe: h.europe.map((e) => ({ ...e, standings: [], secondStandings: undefined })),
          };
          delete season.brackets;
          delete season.scorers;
          return season;
        }),
        events: w.events.slice(-150),
        // Only the own country's cup is shown in full; the others report their winners.
        ...(w.cups
          ? {
              cups: w.cups.map((cup) =>
                cup.country === own.country ? cup : { ...cup, clubs: [], rounds: [], fixtures: [] },
              ),
            }
          : {}),
      },
      totalMatches: w.ownMatches.length,
      tallies: tallies(w),
      supportUsed: w.events.filter((event) => event.year === w.year && event.kind === 'support')
        .length,
      milestones: clubMilestones(w),
      managers: managerCandidates(w),
      transfers: transferOffers(w),
      sponsors: sponsorSlots(w),
      annualCost: operatingCost(w),
      coefficient: europeanCoefficient(w),
      finance: financialBreakdown(w),
      news: this.news(w),
      managerHistoryKey: managerHistoryKey(w),
      transferLedger: this.transferLedger(w),
    };
  }
  /** The view for a reply (→ARCH-6): this world's view, whole or as the changes since `base`. */
  private publish(base?: number): Pick<Reply, 'view' | 'viewSeq' | 'viewDelta'> {
    return this.views.publish(this.view(), base);
  }
  /**
   * Read-only requests, validated like commands but answered from the live world without a
   * revision check, a receipt or a view: they change nothing and publish nothing.
   */
  private read(input: unknown): Reply {
    let request: Request | undefined;
    try {
      request = requestSchema.parse(input);
      const body = request.body,
        w = this.world;
      if (this.session && this.session !== request.session)
        throw new Error('이전 세션의 요청입니다.');
      if (!w) throw new Error('먼저 클럽을 창단하세요.');
      if (body.type === 'world-market')
        return {
          requestId: request.requestId,
          ok: true,
          worldMarket: worldMarketPage(w, body.query),
        };
      if (body.type === 'world-market-detail')
        return {
          requestId: request.requestId,
          ok: true,
          worldMarketDetail: worldMarketDetail(w, body.target, body.fee, body.loan),
        };
      if (body.type === 'recruitment-history')
        return {
          requestId: request.requestId,
          ok: true,
          recruitmentHistory: structuredClone({
            mediations: w.mediations ?? [],
            promises: w.promises ?? [],
          }),
        };
      if (body.type === 'mediation-preview')
        return {
          requestId: request.requestId,
          ok: true,
          mediationPreview: mediationPreview(w, body.id, body.support),
        };
      if (body.type === 'person-career') {
        const detail = personCareer(w, body.person);
        if (!detail) throw new Error('기록된 인물 경력이 없습니다.');
        return { requestId: request.requestId, ok: true, personCareer: detail };
      }
      if (body.type === 'archive')
        return {
          requestId: request.requestId,
          ok: true,
          archive: {
            season: w.history.find((h) => h.year === body.year),
            matches: w.ownMatches.filter((m) => m.year === body.year),
            events: w.events.filter((e) => e.year === body.year),
            managers: w.events.filter((e) => e.kind.startsWith('manager-')),
          },
        };
      if (body.type === 'manager-history') {
        if (body.world !== undefined && body.world !== w.id)
          throw new Error('다른 커리어의 감독 이력 요청입니다.');
        return {
          requestId: request.requestId,
          ok: true,
          managerHistory: managerHistoryPage(managerHistorySource(w), body.cursor),
        };
      }
      if (body.type === 'league-fixtures') {
        const key = `${body.country}:${body.tier}:${body.group}`;
        return {
          requestId: request.requestId,
          ok: true,
          leagueFixtures: w.fixtures.filter(
            (f) => f.year === w.year && f.kind === 'league' && f.groupKey === key,
          ),
        };
      }
      if (body.type === 'full-stats') {
        const read = fullStatsRead(w, { kind: body.kind, groupKey: body.groupKey });
        return { requestId: request.requestId, ok: true, ...(read ? { fullStats: read } : {}) };
      }
      if (body.type === 'club-records')
        return {
          requestId: request.requestId,
          ok: true,
          clubRecords: clubRecords(w.ownMatches, w.playerClub),
        };
      if (body.type !== 'head-to-head') throw new Error('읽기 요청이 아닙니다.');
      if (body.club === w.playerClub || !w.clubs.some((club) => club.id === body.club))
        throw new Error('맞대결 상대를 찾을 수 없습니다.');
      return {
        requestId: request.requestId,
        ok: true,
        headToHead: headToHead(w.ownMatches, w.playerClub, body.club),
      };
    } catch (error) {
      return failure(input, request, error);
    }
  }
  /**
   * Posts the world as it stands after every earlier command to the codec worker, whatever revision
   * the client last saw; posting copies it, so the next command never waits for the checkpoint.
   */
  private save(r: Request): Reply {
    const w = this.world;
    if (!w) throw new Error('먼저 클럽을 창단하세요.');
    if (!this.codec) throw new Error('저장 Worker가 연결되지 않았습니다.');
    this.codec.postMessage({
      id: r.requestId,
      world: w,
      generation: r.generation,
      parentGeneration: r.parentGeneration,
    });
    return { requestId: r.requestId, ok: true, saving: { worldId: w.id, revision: w.revision } };
  }
  private async execute(input: unknown): Promise<Reply> {
    let request: Request | undefined;
    try {
      request = requestSchema.parse(input);
      const r = request;
      if (this.session && this.session !== r.session) throw new Error('이전 세션의 요청입니다.');
      this.session = r.session;
      const previous = this.acknowledgments.get(r.requestId);
      if (previous) return previous;
      if (r.body.type === 'save') return this.save(r);
      if (r.body.type !== 'inspect' && r.expectedRevision !== (this.world?.revision ?? -1))
        throw new Error('세계가 변경되었습니다. 오래된 요청은 적용하지 않습니다.');
      if (this.world?.receiptIds.includes(r.requestId)) throw new Error('이미 처리된 요청입니다.');
      let playback: MatchPlayback | undefined,
        raw: string | undefined,
        envelope: Reply['envelope'],
        candidate: World | undefined,
        worldMetadata: Reply['worldMetadata'],
        upgraded = false;
      let changed = false;
      this.cancelled = false;
      if (r.body.type === 'inspect') {
        if (r.body.upgrade && !r.body.activate)
          throw new Error('규칙 업그레이드는 활성화할 때만 가능합니다.');
        const result =
          this.inspected?.raw === r.body.raw ? this.inspected.result : await decode(r.body.raw);
        this.inspected = r.body.activate ? undefined : { raw: r.body.raw, result };
        const rules = r.body.upgrade
          ? upgradeWorldRules(result.world, CURRENT_CATALOG)
          : result.world;
        // Only the writer's activation adopts missing identities (→SAVE-21) and records the full
        // match model (→SAVE-23); inspection and read-only tabs keep the career exactly as stored.
        const writer = r.body.activate && r.body.upgrade;
        const identified = writer ? adoptIdentities(rules, rules !== result.world) : rules;
        const modelled = writer
          ? this.adoptModel(identified, identified !== result.world)
          : identified;
        const activated = writer
          ? this.adoptManagerHistory(modelled, modelled !== result.world)
          : modelled;
        upgraded = activated !== result.world;
        if (r.body.metadataOnly) worldMetadata = worldMetadataOf(activated);
        else if (!r.body.activate) candidate = structuredClone(activated);
        if (r.body.activate) this.world = activated;
        if (upgraded) raw = await encode(activated, r.generation, r.parentGeneration);
        envelope = result.envelope;
      } else if (r.body.type === 'found') {
        if (this.world && !r.body.replace)
          throw new Error('현재 세계가 있습니다. 파일 내보내기 후 새 게임을 시작하세요.');
        this.world = createWorld(r.body.input, this.release);
        changed = true;
      } else {
        const w = this.world;
        if (!w) throw new Error('먼저 클럽을 창단하세요.');
        if (r.body.type === 'command') {
          const cmd = r.body.command;
          if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
          if (cmd.type === 'next-event') {
            let days = 0;
            for (const day of nextEventDays(w)) {
              void day;
              // No intermediate view/progress publication or public cancel journey.
              if (++days % 14 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
            }
          } else if (cmd.type === 'advance-days' || cmd.type === 'next-match') {
            if (w.critical) throw new Error('중요한 알림을 확인한 후 계속하세요.');
            if (pendingDecisions(w).length) throw new Error('먼저 대기 중인 결정을 처리하세요.');
            const matchCount = w.ownMatches.length,
              year = w.year,
              stop = new Set(cmd.type === 'advance-days' ? cmd.stop : []),
              known = new Set((w.inbox || []).map((item) => item.id));
            const limit = cmd.type === 'advance-days' ? cmd.days : 2 * seasonLength(w);
            // Only a watched match needs its movement frames; a day step plays our match through
            // as a result, with the same duel chain and facts, nine times faster.
            const watched = cmd.type === 'next-match';
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              const p = await this.day(w, watched);
              if (p?.frames.length) playback = p;
              if (
                w.critical ||
                w.bankrupt ||
                (cmd.type === 'next-match' && w.ownMatches.length > matchCount)
              )
                break;
              // Every step ends when the season closes. A multi-day step also ends on the day any
              // club news arrives or our match is played, so the date lands on that day; the
              // clock itself stops only for enabled kinds (WEB-18).
              if (
                w.year !== year ||
                pendingDecisions(w).length > 0 ||
                (cmd.type === 'advance-days' &&
                  stoppingReasons(w).some((item) => stop.has(item.kind))) ||
                (cmd.type === 'advance-days' &&
                  n < limit - 1 &&
                  (w.ownMatches.length > matchCount ||
                    (w.inbox || []).some((item) => !known.has(item.id))))
              )
                break;
              if (n % 14 === 0) {
                this.progress({ requestId: r.requestId, ok: true, progress: (n + 1) / limit });
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          } else if (cmd.type === 'advance' || cmd.type === 'season') {
            const limit = cmd.type === 'season' ? 46 - w.round : cmd.rounds;
            if (cmd.type === 'season' && w.critical)
              throw new Error('중요한 알림을 확인한 후 계속하세요.');
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              if (w.round >= 46) {
                closeSeason(w);
                w.revision++;
              }
              const p = advanceRound(w, undefined, cmd.type !== 'season');
              if (p?.frames.length) playback = p;
              if (w.bankrupt) break;
              if (n % 5 === 0) {
                this.progress({
                  requestId: r.requestId,
                  ok: true,
                  progress: (n + 1) / Math.max(1, limit),
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
              if (w.critical) break;
            }
            if (cmd.type === 'season' && w.round === 46 && !w.bankrupt) {
              closeSeason(w);
              w.revision++;
            }
          } else operate(w, cmd);
          changed = true;
        } else if (r.body.type === 'ack-critical') {
          delete w.critical;
          w.revision++;
          changed = true;
        } else if (r.body.type === 'export')
          raw = await encode(w, r.generation, r.parentGeneration);
      }
      if (changed && this.world)
        this.world.receiptIds = [...this.world.receiptIds.slice(-199), r.requestId];
      const reply: Reply = {
        requestId: r.requestId,
        ok: true,
        ...this.publish(r.viewBase),
        playback,
        raw,
        envelope,
        candidate,
        worldMetadata,
        cancelled: this.cancelled,
        upgraded: upgraded || undefined,
      };
      this.acknowledgments.set(r.requestId, reply);
      if (this.acknowledgments.size > 32)
        this.acknowledgments.delete(this.acknowledgments.keys().next().value!);
      return reply;
    } catch (error) {
      return {
        ...failure(input, request, error),
        errorCode: isSaveCompatibilityError(error) ? error.code : undefined,
        ...this.publish(request?.viewBase),
      };
    }
  }
}
