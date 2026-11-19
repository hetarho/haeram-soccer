import { contractRenewalReads } from './contractRenewals';
import { projectWorldFacts } from './worldProjection';
import { disciplineNames } from './disciplineNames';
import { adoptSquads } from './squadActivation';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { newsBefore, newsTotal } from '../../../../packages/engine/src/news';
import { NEWS_LIMITS } from '../../../../packages/contracts/src/news';
import { initializeReadModels, needsReadModels } from '../../../../packages/engine/src/read-models';
import { worldMarketPage, worldMarketDetail } from '../../../../packages/engine/src/world-market';
import { mediationPreview } from '../../../../packages/engine/src/mediation';
import { fullStatsRead } from '../../../../packages/engine/src/npc-stats';
import { personCareer } from './personCareer';
import { nextOwnFixture, seasonDate } from '../../../../packages/engine/src/calendar';
import { officeRead } from './officeRead';
import {
  exportFile,
  gameDriver,
  deleteFile,
  gameFileName,
  importFile,
  listFiles,
  openGamePool,
  pause as pausePool,
  poolBackupFiles,
  unpause as unpausePool,
  type BackupFiles,
  type GamePool,
} from '../adapters/sqliteWasm';
import {
  checkIntegrity,
  currentSide,
  dropBackups,
  isSaveCorruptedError,
  openFailure,
  rotateBackup,
  seasonClosed,
  SaveCorruptedError,
  type BackupInfo,
} from './seasonBackup';
import { sqlRecordStore } from '../adapters/sqlRecordStore';
import {
  databaseSaveMeta,
  decodeSaveFile,
  encodeSaveFile,
  saveMetaOf,
  type DatabaseBytes,
} from '../adapters/saveFile';
export type { DatabaseBytes } from '../adapters/saveFile';
import { RowSaver } from '../adapters/rowSaver';
import { rowsToWorld } from '../adapters/worldRows';
import { SAVE_SCHEMA_VERSION } from '../adapters/saveSchema';
import {
  attachRecordStore,
  cloneWorld,
  type RecordStore,
} from '../../../../packages/contracts/src/record-store';
import { recentClubResults } from '../../../../packages/engine/src/recent-results';
import { readingOnce, startingSquad, rating } from '../../../../packages/engine/src/world';
import { staffMarket } from '../../../../packages/engine/src/staff';
import { clubManager } from '../../../../packages/engine/src/managerMarket';
import { nextEventDays } from '../../../../packages/engine/src/next-event';
import { stoppingReasons } from '../../../../packages/engine/src/stopping';
import {
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
import { generateHistory, HISTORY_START } from '../../../../packages/engine/src/history';
import { seasonDigest } from '../../../../packages/engine/src/generation-digest';
import { seasonAfter, seasonFrom } from '../../../../packages/engine/src/wartime';
import { takeOver } from '../../../../packages/engine/src/takeover';
import { clubListings } from '../../../../packages/engine/src/listing';
import { tierFortune } from '../../../../packages/engine/src/club-value';
import { careerEnded, ENDED_MESSAGE } from '../../../../packages/engine/src/owner';
import type { StartChoice, TakeoverDecade } from '../../../../packages/contracts/src/owner';
import { clubProfile, squadPlayer } from './clubProfile';
import type {
  ManagerHistorySeason,
  ManagerHistorySource,
} from '../../../../packages/contracts/src/manager-history-view';
import type { World, MatchPlayback } from '../../../../packages/contracts/src/types';
import {
  earlierRulesMessage,
  isEarlierEngine,
  isSaveCompatibilityError,
  NEWER_GAME_MESSAGE,
  PARITY_LEVEL_CATALOGS,
  PRIOR_CATALOG_HASHES,
  RELEVELLED_MONEY_MESSAGE,
  SaveCompatibilityError,
  SUPPORTED_ENGINE_VERSIONS,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import { validateWorld } from '../../../../packages/contracts/src/index';
import {
  CATALOG_HASH,
  CATALOG_VERSION,
  CURRENT_CATALOG,
  LOAD_CATALOG,
  currency,
} from '../../../../packages/catalogs/src/index';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import { financialBreakdown } from '../../../../packages/engine/src/finance';
import { transferLedger } from '../../../../packages/engine/src/transfer-records';
import { seasonsBeforeOwner } from '../../../../packages/engine/src/club-past';
import { ownSeasons } from '../../../../packages/engine/src/player-state';
import { requestSchema, type Request, type Reply, type View } from './protocol';
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
  const candidate = cloneWorld(w);
  if (!installMissingIdentities(candidate)) return w;
  if (!revised) {
    if (!Number.isSafeInteger(candidate.revision + 1))
      throw new Error(sourceMessage('copy.host.b53dad7fec'));
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
  // Only the club's own seasons: the world's before the takeover had no manager of ours (→HIST-21).
  const archived = ownSeasons(w);
  const seasons: ManagerHistorySeason[] = archived.map((h, index) => {
    const next = archived[index + 1] ?? (h.year === w.year - 1 ? own : undefined),
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
/** Seasons the world plays before a takeover in `decade`, the war's left out (→WORLD-13/14). */
function seasonsBefore(decade: TakeoverDecade) {
  let seasons = 0;
  const first = seasonFrom(decade);
  for (let year: number = HISTORY_START; year < first; year = seasonAfter(year)) seasons++;
  return seasons;
}
/**
 * Opens a game's record store: its database in the store's file, or none when the game has no file
 * and `create` is not asked (→SAVE-29). An unsupported schema is refused before anything is written.
 */
export type OpenStore = (
  gameId: string,
  options: { create: boolean },
) => RecordStore | undefined | Promise<RecordStore | undefined>;
/**
 * The game database files of this browser (→SAVE-14): the IDs whose file exists and the removal of
 * one, with the game's backup too once seasons keep one (→SAVE-31).
 */
export interface GameFiles {
  list(): string[] | Promise<string[]>;
  remove(gameId: string): void | Promise<void>;
}
/** An import's temporary database: one at a time, so a left-over one is a crashed import's. */
const IMPORT_FILE = /^\/import-[A-Za-z0-9-]+\.sqlite3$/;
/** The database files of the engine worker's OPFS pool, as bytes (→ARCH-11). */
function poolBytes(pool: GamePool): DatabaseBytes {
  const present = (gameId: string) => listFiles(pool).includes(gameFileName(gameId));
  // The pool never grows by itself on an import, so room for the scratch file and the game's.
  const room = () => pool.reserveMinimumCapacity(pool.getFileCount() + 2);
  return {
    read: (gameId) => (present(gameId) ? exportFile(pool, gameFileName(gameId)) : undefined),
    meta: (gameId) => {
      if (!present(gameId)) return undefined;
      const driver = gameDriver(pool, gameFileName(gameId));
      try {
        return databaseSaveMeta(driver);
      } finally {
        driver.close();
      }
    },
    scratch: async (bytes) => {
      for (const name of listFiles(pool)) if (IMPORT_FILE.test(name)) deleteFile(pool, name);
      const name = `/import-${crypto.randomUUID()}.sqlite3`;
      await room();
      if (bytes) await importFile(pool, name, bytes);
      const driver = gameDriver(pool, name);
      return {
        driver,
        bytes: () => exportFile(pool, name),
        release: () => {
          try {
            driver.close();
          } finally {
            deleteFile(pool, name);
          }
        },
      };
    },
    write: async (gameId, bytes) => {
      await room();
      await importFile(pool, gameFileName(gameId), bytes);
    },
  };
}
const GAME_FILE = /^\/game-([A-Za-z0-9:_-]{1,100})\.sqlite3$/;
/** A game's database in the engine worker's OPFS pool (→ARCH-11). */
function poolStore(pool: GamePool, gameId: string, create: boolean) {
  const fileName = gameFileName(gameId);
  if (!create && !listFiles(pool).includes(fileName)) return undefined;
  const driver = gameDriver(pool, fileName);
  try {
    // A database that is not whole offers its backup, not a guess at its rows (→SAVE-31).
    if (!create) checkIntegrity(driver);
    return sqlRecordStore(driver);
  } catch (error) {
    driver.close();
    throw error;
  }
}
/**
 * The world a game's database holds in memory, checked as an import is (→SAVE-5, →SAVE-11): its
 * schema, rules and catalog versions with the catalog's hash, then the world itself, its pins, its
 * currency and money level. An unsupported version is a compatibility failure; nothing is written.
 */
export function storedWorld(store: RecordStore): World {
  const meta = store.meta();
  if (!meta.world_id || !meta.engine || !meta.catalog || !meta.revision)
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  if (meta.schema_version !== String(SAVE_SCHEMA_VERSION))
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.52d3e36f5e'));
  if (!SUPPORTED_ENGINE_VERSIONS.includes(meta.engine))
    throw new SaveCompatibilityError(
      isEarlierEngine(meta.engine) ? earlierRulesMessage(meta.engine) : NEWER_GAME_MESSAGE,
      meta.engine,
    );
  // An older catalog is accepted by the fingerprint recorded with it (→SAVE-10); the pin moves to
  // the current catalog on writer activation, never while reading.
  const pinned =
    meta.catalog === CATALOG_VERSION ? CATALOG_HASH : PRIOR_CATALOG_HASHES[meta.catalog];
  if (!pinned) throw new SaveCompatibilityError(sourceMessage('copy.persistence.db51c3b436'));
  if (meta.catalog_hash !== pinned)
    throw new SaveCompatibilityError(sourceMessage('copy.persistence.98b9bb6b66'));
  const stored = rowsToWorld(store, { includeCold: false });
  const valid = validateWorld(stored, LOAD_CATALOG) as unknown as Record<string, unknown>;
  // The fields keep their stored order, so the rows they are saved in keep their places.
  const world = Object.fromEntries([
    ...Object.keys(stored).flatMap((key) => (key in valid ? [[key, valid[key]]] : [])),
    ...Object.keys(valid).flatMap((key) => (key in stored ? [] : [[key, valid[key]]])),
  ]) as unknown as World;
  const country = world.clubs.find((c) => c.id === world.playerClub)!.country;
  if (
    world.id !== meta.world_id ||
    world.engine !== meta.engine ||
    world.catalog !== meta.catalog ||
    world.catalogHash !== meta.catalog_hash ||
    String(world.revision) !== meta.revision ||
    world.currency !== currency(country, world.year).code
  )
    throw new Error(sourceMessage('copy.persistence.450e2c9cf6'));
  // Only England's money kept its level when the catalog re-levelled the rest (→ECON-35): elsewhere
  // a career's records would mix two levels, so it is refused, never reinterpreted (→SAVE-10).
  if (country !== 'ENG' && PARITY_LEVEL_CATALOGS.includes(world.catalog))
    throw new SaveCompatibilityError(RELEVELLED_MONEY_MESSAGE);
  return world;
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
  private newsCache?: { key: string; news: View['news'] };
  private ledgerCache?: { events: World['events']; end: number; ledger: View['transferLedger'] };
  private preOwnerCache?: { key: string; seasons: View['preOwner'] };
  /** Numbers, retains and diffs the views this host publishes. */
  private views = new ViewPublisher();
  cancelled = false;
  /**
   * The game in play's database and the saver that knows its last commit (→SAVE-3, →ARCH-6): the
   * engine worker alone writes it, between simulation steps.
   */
  private game?: {
    id: string;
    store: RecordStore;
    saver: RowSaver;
    /** The season the last save or open held, so a save that finds another one follows a close. */
    year: number;
  };
  private openStore: OpenStore;
  private files: GameFiles;
  private bytes: DatabaseBytes;
  /** The season backup files; none for a host given its own stores or bytes port (tests). */
  private backups?: BackupFiles | (() => Promise<BackupFiles>);
  /** The client's fixture helpers, when it created them (→ARCH-6); without, every fixture plays here. */
  helpers?: HelperPool;
  /** An own match day waiting for its helpers: the world is mid-day, so reads wait for it. */
  private round?: Promise<void>;
  /**
   * A new game's world, generated to the chosen decade and nobody's yet (→WORLD-13): it holds no
   * own club, so it is neither validated, published nor saved until one of its clubs is taken
   * over (→ECON-38), whose world is the first checkpoint.
   */
  private start?: { world: World; choice: StartChoice };
  /** Whether founding and writer activation record the full match model; only tests set it. */
  private release: MatchModelRelease;
  /** The game database pool, installed on first use; games open through it (→ARCH-11). */
  private gamePool?: Promise<GamePool>;
  /** Whether the pool's handles were given to another tab (→SAVE-6), and their return under way. */
  private poolPaused = false;
  private resuming?: Promise<void>;
  constructor(
    private progress: (reply: Reply) => void = () => {},
    options: {
      release?: MatchModelRelease;
      openStore?: OpenStore;
      gameFiles?: GameFiles;
      databaseBytes?: DatabaseBytes;
      backupFiles?: BackupFiles;
    } = {},
  ) {
    this.release = options.release ?? MATCH_MODEL_RELEASE;
    this.files = options.gameFiles ?? {
      list: async () =>
        listFiles(await this.databases()).flatMap((name) => GAME_FILE.exec(name)?.[1] ?? []),
      remove: async (gameId) => void deleteFile(await this.databases(), gameFileName(gameId)),
    };
    this.bytes =
      options.databaseBytes ??
      // The pool opens on first use, so each call reaches it through `databases()`.
      ({
        read: async (id) => poolBytes(await this.databases()).read(id),
        meta: async (id) => poolBytes(await this.databases()).meta(id),
        scratch: async (bytes) => poolBytes(await this.databases()).scratch(bytes),
        write: async (id, bytes) => poolBytes(await this.databases()).write(id, bytes),
      } satisfies DatabaseBytes);
    this.backups =
      options.backupFiles ??
      (options.databaseBytes || options.openStore || options.gameFiles
        ? undefined
        : async () => poolBackupFiles(await this.databases()));
    this.openStore =
      options.openStore ??
      (async (gameId, { create }) => poolStore(await this.databases(), gameId, create));
  }
  private async backupFiles(): Promise<BackupFiles | undefined> {
    return typeof this.backups === 'function' ? this.backups() : this.backups;
  }
  /** The revision of a database that passes its integrity check, else undefined (→SAVE-31). */
  private async intactRevision(bytes: Uint8Array): Promise<number | undefined> {
    const scratch = await this.bytes.scratch(bytes);
    try {
      checkIntegrity(scratch.driver);
      return Number(sqlRecordStore(scratch.driver).meta().revision) || 0;
    } catch {
      return undefined;
    } finally {
      scratch.release();
    }
  }
  /**
   * Copies a game's committed database into its backup (→SAVE-31) as the backup of `w`'s season;
   * the previous backup stays until the copy is whole. A failed copy leaves the previous backup
   * and reports nothing to the save it follows, which is already committed.
   */
  private async backUp(gameId: string, w: World): Promise<BackupInfo | undefined> {
    const files = await this.backupFiles();
    if (!files) return undefined;
    try {
      const bytes = await this.bytes.read(gameId);
      if (!bytes) return undefined;
      const side = await rotateBackup(files, gameId, bytes, (b) => this.intactRevision(b));
      return { side, season: w.year, date: seasonDate(w) };
    } catch {
      return undefined;
    }
  }
  /** Deletes a game's database and its backups (→SAVE-14). */
  private async removeGame(gameId: string) {
    await this.files.remove(gameId);
    const files = await this.backupFiles();
    if (files) await dropBackups(files, gameId);
  }
  /** Closes the game in play's database; the world it held stays in memory. */
  private closeGame() {
    const game = this.game;
    this.game = undefined;
    game?.store.close();
  }
  /**
   * The writer's activation of a loaded world (→SAVE-10/21/23/24/28): its rules and catalog pin,
   * missing identities, match model, squads, manager history and read models brought up to date, or
   * `w` itself when nothing changes. `w` is never changed, and the revision moves once.
   */
  private writerUpgrade(w: World): World {
    const rules = upgradeWorldRules(w, CURRENT_CATALOG);
    const identified = adoptIdentities(rules, rules !== w);
    const modelled = this.adoptModel(identified, identified !== w);
    const squadWorld = adoptSquads(modelled, modelled !== w);
    let activated = this.adoptManagerHistory(squadWorld, squadWorld !== w);
    if (needsReadModels(activated) && !settledAhead(this.world, activated)) {
      const journalled = cloneWorld(activated);
      initializeReadModels(journalled);
      if (activated === w) journalled.revision++;
      activated = journalled;
    }
    return activated;
  }
  /**
   * Opens a game's database as the game in play (→SAVE-5, →SAVE-10): its world is validated, any
   * writer upgrade is committed at once, and the saver starts from the rows it holds, so the next
   * save writes only what changed. A failed check closes the file untouched and keeps the game in
   * play; a game without a file is an empty slot.
   */
  private async openGame(r: Request, gameId: string): Promise<Reply> {
    let store: RecordStore | undefined;
    try {
      store = await this.openStore(gameId, { create: false });
    } catch (error) {
      throw openFailure(error);
    }
    if (!store)
      return {
        requestId: r.requestId,
        ok: true,
        opened: { gameId, found: false },
        ...this.publish(r.viewBase),
      };
    return this.playStore(r, gameId, store, undefined, true);
  }
  /**
   * Makes an opened database the game in play: its world is validated (unless `checked` already
   * holds the validated world and its writer upgrade, as an import's), the upgrade is committed at
   * once and the saver starts from the rows the database holds. A failed check closes the store;
   * rows that fail to load for any reason but compatibility are corruption (→SAVE-11, →SAVE-31).
   * With `backup`, the database as it stands is first copied into the game's backup when the
   * writer upgrade would change it (→SAVE-10), the copy of the world the game last saved.
   */
  private async playStore(
    r: Request,
    gameId: string,
    store: RecordStore,
    checked?: { world: World; activated: World },
    backup = false,
  ): Promise<Reply> {
    let world: World, activated: World, saver: RowSaver;
    try {
      world = checked?.world ?? storedWorld(store);
    } catch (error) {
      store.close();
      throw openFailure(error);
    }
    try {
      activated = checked?.activated ?? this.writerUpgrade(world);
      saver = new RowSaver(store);
      saver.prime(world);
    } catch (error) {
      store.close();
      throw error;
    }
    this.closeGame();
    this.game = { id: gameId, store, saver, year: activated.year };
    this.world = attachRecordStore(activated, store);
    // The backup of the world as it was comes first, then the upgrade is saved before anything
    // plays on it; a failure keeps the old rows and the upgraded world in memory, exportable
    // (→SAVE-10, →SAVE-31).
    let backedUp: BackupInfo | undefined;
    if (activated !== world) {
      if (backup) backedUp = await this.backUp(gameId, world);
      saver.save(activated);
    }
    return {
      requestId: r.requestId,
      ok: true,
      opened: { gameId, found: true, revision: activated.revision, backup: backedUp },
      upgraded: activated !== world || undefined,
      ...this.publish(r.viewBase),
    };
  }
  /**
   * A game's database as a portable file (→SAVE-9): the committed bytes behind a header naming its
   * versions, readable for a game of earlier or newer rules too, which stays exportable untouched
   * (→SAVE-11). The game in play was saved by the client first; a game without a file is an error.
   * With `memory`, the game in play as it stands, when its save failed (→SAVE-3).
   */
  private async exportGame(r: Request, gameId: string, memory = false): Promise<Reply> {
    const playing = this.game?.id === gameId ? this.game : undefined;
    if (memory && playing && this.world) return this.exportMemory(r, this.world);
    const bytes = await this.bytes.read(gameId);
    const meta = playing
      ? saveMetaOf(playing.store.meta())
      : bytes && (await this.bytes.meta(gameId));
    if (!bytes || !meta) throw new Error(sourceMessage('copy.host.c64421732a'));
    return { requestId: r.requestId, ok: true, file: await encodeSaveFile(meta, bytes) };
  }
  /**
   * The world in play written into a copy of its committed database: what a failed save left in
   * memory stays exportable (→SAVE-3, →SAVE-10).
   */
  private async exportMemory(r: Request, w: World): Promise<Reply> {
    const committed = await this.bytes.read(this.game!.id);
    const scratch = await this.bytes.scratch(committed);
    try {
      const store = sqlRecordStore(scratch.driver);
      const saver = new RowSaver(store);
      // What the copy holds is taken as committed, so the save writes what the world changed.
      if (committed) saver.prime(rowsToWorld(store, { includeCold: false }));
      saver.save(w);
      const file = await encodeSaveFile(saveMetaOf(store.meta()), scratch.bytes());
      return { requestId: r.requestId, ok: true, file };
    } finally {
      scratch.release();
    }
  }
  /**
   * Imports a save file (→SAVE-9, →ARCH-16). Everything is checked before a slot is touched: the
   * header, the limits and the checksum (→SAVE-4), then the database in a scratch file — its
   * integrity check, schema, rules and catalog versions and the world it holds, with the writer
   * upgrade it would get — and the header against what the database says. Only then does it
   * become `gameId`'s file and the game in play, and the file of the game it `replaces` go; any
   * failure leaves every file and the game in play as they were.
   */
  private async importGame(
    r: Request,
    body: { gameId: string; replaces?: string; file: Uint8Array },
  ): Promise<Reply> {
    const { header, dbBytes } = await decodeSaveFile(body.file);
    let checked: { world: World; activated: World };
    const scratch = await this.bytes.scratch(dbBytes);
    try {
      const verdict = scratch.driver.get<{ integrity_check: string }>('PRAGMA integrity_check');
      if (verdict?.integrity_check !== 'ok')
        throw new Error(sourceMessage('copy.saveFile.integrity'));
      const store = sqlRecordStore(scratch.driver);
      // What the header says must be what the database says, before the world is read.
      const stored = saveMetaOf(store.meta());
      if (
        stored.schema !== header.schema ||
        stored.engine !== header.engine ||
        stored.catalog !== header.catalog ||
        stored.catalogHash !== header.catalogHash ||
        stored.worldId !== header.worldId
      )
        throw new Error(sourceMessage('copy.persistence.450e2c9cf6'));
      const world = storedWorld(store);
      checked = { world, activated: this.writerUpgrade(world) };
    } finally {
      scratch.release();
    }
    // The game's own file cannot be written while it is open.
    if (this.game?.id === body.gameId) this.closeGame();
    await this.bytes.write(body.gameId, dbBytes);
    const store = await this.openStore(body.gameId, { create: false });
    if (!store) throw new Error(sourceMessage('copy.host.c64421732a'));
    // Backups of a game this file replaces held another career (→SAVE-31).
    const files = await this.backupFiles();
    if (files) await dropBackups(files, body.gameId);
    const reply = await this.playStore(r, body.gameId, store, checked);
    if (body.replaces && body.replaces !== body.gameId) await this.removeGame(body.replaces);
    return reply;
  }
  /**
   * Recovery of a corrupted game (→SAVE-31, →WEB-66): the current backup is checked whole as an
   * import is — integrity, versions, world — and only then copied over the game's file, which is
   * opened as the game in play. Never run on its own: the owner accepted the offer. Any failure
   * leaves the game's file as it was.
   */
  private async restoreBackup(r: Request, gameId: string): Promise<Reply> {
    const files = await this.backupFiles();
    const side = files && (await currentSide(files, gameId, (b) => this.intactRevision(b)));
    const bytes = files && side && (await files.read(gameId, side));
    if (!bytes) throw new Error(sourceMessage('backup.missing'));
    let checked: { world: World; activated: World };
    const scratch = await this.bytes.scratch(bytes);
    try {
      checkIntegrity(scratch.driver);
      const world = storedWorld(sqlRecordStore(scratch.driver));
      checked = { world, activated: this.writerUpgrade(world) };
    } catch (error) {
      throw isSaveCompatibilityError(error)
        ? error
        : new SaveCorruptedError(sourceMessage('backup.unreadable'), { cause: error });
    } finally {
      scratch.release();
    }
    if (this.game?.id === gameId) this.closeGame();
    await this.bytes.write(gameId, bytes);
    const store = await this.openStore(gameId, { create: false });
    if (!store) throw new Error(sourceMessage('copy.host.c64421732a'));
    return this.playStore(r, gameId, store, checked);
  }
  /**
   * Releases the game in play's database after the client's save (→SAVE-14): no game is in play
   * until the next `open-game`. A world not yet in a database stays what it is, nobody's file.
   */
  private async releaseGame(r: Request, pause: boolean): Promise<Reply> {
    if (this.game || pause) {
      this.closeGame();
      this.world = undefined;
    }
    if (pause) {
      // Another tab takes the game (→SAVE-6): nothing of it stays here, and the pool lets go.
      this.start = undefined;
      const pool = await this.gamePool?.catch(() => undefined);
      if (pool && !this.poolPaused) {
        await this.resuming;
        pausePool(pool);
        this.poolPaused = true;
      }
    }
    return { requestId: r.requestId, ok: true };
  }
  /**
   * Removes a game's database (→SAVE-14, →WEB-62): the game in play first leaves memory, and a
   * game without a file is already gone.
   */
  private async deleteGame(r: Request, gameId: string): Promise<Reply> {
    if (this.game?.id === gameId) {
      this.closeGame();
      this.world = undefined;
    }
    await this.removeGame(gameId);
    return { requestId: r.requestId, ok: true };
  }
  /**
   * Writes every row of the world in play into its game's new database (→SAVE-2): after a takeover,
   * or an activated import or parked game when `replace` (the rows it held then give way to these,
   * in the same transaction). An occupied database is never overwritten otherwise.
   */
  private async createGame(r: Request, gameId: string, replace: boolean): Promise<Reply> {
    const w = this.world;
    if (!w) throw new Error(sourceMessage('copy.client.a198ec6115'));
    this.closeGame();
    // A new career over an occupied slot's file has no use for the old career's backups (→SAVE-31).
    if (replace) {
      const files = await this.backupFiles();
      if (files) await dropBackups(files, gameId);
    }
    const store = await this.openStore(gameId, { create: true });
    if (!store) throw new Error(sourceMessage('copy.host.c64421732a'));
    try {
      const saver = new RowSaver(store);
      if (store.meta().world_id !== undefined) {
        if (!replace) throw new Error(sourceMessage('copy.host.76a7247c60'));
        // What the database held is taken as committed, so the save removes what `w` lacks.
        saver.prime(rowsToWorld(store, { includeCold: false }));
      }
      saver.save(w);
      this.game = { id: gameId, store, saver, year: w.year };
      attachRecordStore(w, store);
    } catch (error) {
      store.close();
      throw error;
    }
    return {
      requestId: r.requestId,
      ok: true,
      saved: { gameId, worldId: w.id, revision: w.revision },
    };
  }
  /**
   * The engine worker's game database pool, opened once on first use; a capability failure is
   * reported to the caller and tried again on the next call (→ARCH-11, →ARCH-17).
   */
  async databases(): Promise<GamePool> {
    this.gamePool ??= openGamePool().catch((error: unknown) => {
      this.gamePool = undefined;
      throw error;
    });
    const pool = await this.gamePool;
    // A pool paused for another tab takes its handles back once this tab plays again (→SAVE-6).
    if (this.poolPaused)
      await (this.resuming ??= unpausePool(pool)
        .then(() => {
          this.poolPaused = false;
        })
        .finally(() => {
          this.resuming = undefined;
        }));
    return pool;
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
    const candidate = cloneWorld(w);
    if (!revised) {
      if (!Number.isSafeInteger(candidate.revision + 1))
        throw new Error(sourceMessage('copy.host.b53dad7fec'));
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
      throw new Error(sourceMessage('copy.host.b53dad7fec'));
    const candidate = { ...w, revision: revised ? w.revision : w.revision + 1 };
    ensureManagerHistory(candidate);
    return candidate;
  }
  handle(input: unknown): Promise<Reply> {
    // A read is answered at once, between a command's simulation steps: queued behind a long
    // command, its watchdog would run out while only the command reports progress.
    const type = (input as { body?: { type?: unknown } } | null)?.body?.type;
    if (
      type === 'news-page' ||
      type === 'world-market' ||
      type === 'world-market-detail' ||
      type === 'head-to-head' ||
      type === 'person-career' ||
      type === 'recruitment-history' ||
      type === 'mediation-preview' ||
      type === 'league-fixtures' ||
      type === 'full-stats' ||
      type === 'club-records' ||
      type === 'stopped-reads' ||
      type === 'archive' ||
      type === 'manager-history' ||
      type === 'club-profile' ||
      type === 'player-profile'
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
      w.newsJournal?.events,
      w.newsJournal?.matches,
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
  /**
   * The bought club's seasons before the takeover (→HIST-21): the view's archive leaves out the
   * standings and brackets they are read from, and they never change once the owner has bought it,
   * so they are read again only for another career or a load.
   */
  private preOwner(w: World): View['preOwner'] {
    const takeover = w.owner?.takeover;
    if (!takeover) return undefined;
    const before = w.history.findIndex((season) => season.year >= takeover.year),
      key = [w.id, takeover.year, takeover.clubId, before < 0 ? w.history.length : before].join(
        ':',
      );
    if (this.preOwnerCache?.key !== key)
      this.preOwnerCache = { key, seasons: seasonsBeforeOwner(w) };
    return this.preOwnerCache.seasons;
  }
  /**
   * This world's view, projected inside one read scope (→ARCH-6): the projection is synchronous and
   * changes nothing, so the parts that read the own XI share one choice of it.
   */
  private view(w = this.world, deferSlow = false): View | undefined {
    if (!w) return;
    return readingOnce(w, () => this.projection(w, deferSlow));
  }
  /**
   * The five parts of the projection that cost the most each day (→WEB-119), shared by the full
   * projection and the `stopped-reads` read so both give the same answer for the same world. Call it
   * inside a read scope (→ARCH-6): the parts that read the own XI then share one choice of it.
   */
  private slowReads(w: World) {
    return {
      coaches: staffMarket(w),
      managers: managerCandidates(w),
      transfers: transferOffers(w),
      disciplineNames: disciplineNames(w),
      office: officeRead(w),
    };
  }
  private projection(w: World, deferSlow = false): View {
    const slow = deferSlow ? undefined : this.slowReads(w);
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    const ownGroup = groupKey(own);
    const next = nextOwnFixture(w);
    const opponentId = next && (next.home === w.playerClub ? next.away : next.home);
    const opponent = w.clubs.find((club) => club.id === opponentId);
    const briefingClubs = new Set(next ? [next.home, next.away] : [w.playerClub]);
    // The season's complete statistics are read on request (`full-stats`), not sent every day, and
    // so are the manager-history facts; the free-agent pool stays on the worker (→CLUB-49).
    const projected = projectWorldFacts(w);
    return {
      ...(slow ? { coaches: slow.coaches } : {}),
      world: {
        ...projected,
        clubs: w.clubs.map((club) => ({ ...club, rating: rating(w, club) })),
        ...(slow ? { disciplineNames: slow.disciplineNames } : {}),
        renewalChances: contractRenewalReads(w),
        // Browser projections omit `people`; resolving names there would regenerate old identities.
        nextOpponentLineup:
          next && opponent
            ? {
                fixture: next.id,
                club: opponent.id,
                players: startingSquad(w, opponent, next).map(({ id, name }) => ({ id, name })),
                manager: (({ name, style }) => ({ name, style }))(clubManager(w, opponent)),
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
          (f) => f.home === w.playerClub || f.away === w.playerClub || f.groupKey === ownGroup,
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
      milestones: clubMilestones(w),
      ...(slow ? { managers: slow.managers, transfers: slow.transfers } : {}),
      sponsors: sponsorSlots(w),
      annualCost: operatingCost(w),
      coefficient: europeanCoefficient(w),
      finance: financialBreakdown(w),
      ...(slow ? { office: slow.office } : {}),
      news: this.news(w),
      newsTotal: newsTotal(w),
      managerHistoryKey: managerHistoryKey(w),
      transferLedger: this.transferLedger(w),
      ...(w.owner ? { preOwner: this.preOwner(w) } : {}),
    };
  }
  /** The view for a reply (→ARCH-6): this world's view, whole or as the changes since `base`. */
  private publish(base?: number, deferSlow = false): Pick<Reply, 'view' | 'viewSeq' | 'viewDelta'> {
    return this.views.publish(this.view(this.world, deferSlow), base);
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
        throw new Error(sourceMessage('copy.host.a147f90dfc'));
      // Before the takeover a profile reads the generated world; after it, only the career asked.
      if (body.type === 'club-profile' && !body.world) {
        if (!this.start) throw new Error(sourceMessage('copy.host.f3db275cee'));
        const profile = clubProfile(this.start.world, body.clubId);
        if (!profile) throw new Error(sourceMessage('copy.host.fd5ef98e05'));
        return { requestId: request.requestId, ok: true, clubProfile: profile };
      }
      if (!w) throw new Error(sourceMessage('copy.client.a198ec6115'));
      if (body.type === 'stopped-reads') {
        if (body.world !== w.id) throw new Error(sourceMessage('copy.host.f8fc259198'));
        return {
          requestId: request.requestId,
          ok: true,
          stoppedReads: {
            world: w.id,
            revision: w.revision,
            ...readingOnce(w, () => this.slowReads(w)),
          },
        };
      }
      if (body.type === 'news-page') {
        if (body.world !== w.id) throw new Error(sourceMessage('copy.host.ef27d088a0'));
        const items = newsBefore(w, body.before, body.tag);
        return {
          requestId: request.requestId,
          ok: true,
          newsPage: {
            world: w.id,
            items,
            ...(items.length === NEWS_LIMITS.page ? { next: items.at(-1)!.id } : {}),
          },
        };
      }
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
      if (body.type === 'club-profile' || body.type === 'player-profile') {
        if (body.world !== w.id) throw new Error(sourceMessage('copy.host.f8fc259198'));
        if (body.type === 'club-profile') {
          const profile = clubProfile(w, body.clubId);
          if (!profile) throw new Error(sourceMessage('copy.host.3267b02d4a'));
          return { requestId: request.requestId, ok: true, clubProfile: profile };
        }
        const found = squadPlayer(w, body.playerId, body.clubId);
        if (!found) throw new Error(sourceMessage('copy.host.03e3c7ff36'));
        return { requestId: request.requestId, ok: true, playerProfile: found };
      }
      if (body.type === 'person-career') {
        const detail = personCareer(w, body.person);
        if (!detail) throw new Error(sourceMessage('copy.host.8200815f77'));
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
          throw new Error(sourceMessage('copy.host.0d9fb2bcbc'));
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
      if (body.type !== 'head-to-head') throw new Error(sourceMessage('copy.host.1cc4f9bb1d'));
      if (body.club === w.playerClub || !w.clubs.some((club) => club.id === body.club))
        throw new Error(sourceMessage('copy.host.1eb67cbfd4'));
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
   * Commits the rows of the world as it stands after every earlier command that changed since the
   * last save, whatever revision the client last saw (→SAVE-3, →SAVE-8). It runs in the command
   * queue, so never in the middle of a day; only a committed transaction is answered as saved.
   */
  private async save(r: Request): Promise<Reply> {
    const w = this.world,
      game = this.game;
    if (!w) throw new Error(sourceMessage('copy.client.a198ec6115'));
    if (!game) throw new Error(sourceMessage('copy.host.c64421732a'));
    game.saver.save(w);
    // A season closed since the last save: its save has committed, so it is backed up (→SAVE-31).
    // A failed copy is tried again at the next save.
    let backup: BackupInfo | undefined;
    if (seasonClosed(game.year, w.year)) {
      backup = await this.backUp(game.id, w);
      if (backup) game.year = w.year;
    }
    return {
      requestId: r.requestId,
      ok: true,
      saved: { gameId: game.id, worldId: w.id, revision: w.revision, backup },
    };
  }
  private async execute(input: unknown): Promise<Reply> {
    let request: Request | undefined;
    try {
      request = requestSchema.parse(input);
      const r = request;
      if (this.session && this.session !== r.session)
        throw new Error(sourceMessage('copy.host.a147f90dfc'));
      this.session = r.session;
      const previous = this.acknowledgments.get(r.requestId);
      if (previous) return previous;
      if (r.body.type === 'save') return await this.save(r);
      if (r.body.type === 'restore-backup') return await this.restoreBackup(r, r.body.gameId);
      if (r.body.type === 'open-game') return await this.openGame(r, r.body.gameId);
      if (r.body.type === 'close-game') return await this.releaseGame(r, !!r.body.pause);
      if (r.body.type === 'delete-game') return await this.deleteGame(r, r.body.gameId);
      if (r.body.type === 'export-game')
        return await this.exportGame(r, r.body.gameId, r.body.memory);
      if (r.body.type === 'import-game') return await this.importGame(r, r.body);
      if (r.body.type === 'list-games')
        return { requestId: r.requestId, ok: true, games: [...(await this.files.list())] };
      if (r.body.type === 'create-game')
        return await this.createGame(r, r.body.gameId, !!r.body.replace);
      if (r.expectedRevision !== (this.world?.revision ?? -1))
        throw new Error(sourceMessage('copy.host.724fb562f2'));
      if (this.world?.receiptIds.includes(r.requestId))
        throw new Error(sourceMessage('copy.host.e7fd0c8c21'));
      let playback: MatchPlayback | undefined, start: Reply['start'];
      let changed = false;
      this.cancelled = false;
      if (r.body.type === 'generate') {
        if (this.world && !r.body.replace) throw new Error(sourceMessage('copy.host.76a7247c60'));
        const { choice } = r.body,
          total = seasonsBefore(choice.decade);
        // One generation at a time; a new one drops the world an earlier one left untaken.
        this.start = undefined;
        let played = 0;
        // Each season reached carries its digest for the history view (→WEB-115); the view never
        // holds the generation back.
        const world = generateHistory(choice.seed, choice.decade, (season, w) => {
          played++;
          const digest = seasonDigest(w);
          this.progress({
            requestId: r.requestId,
            ok: true,
            progress: played / total,
            season,
            ...(digest ? { digest } : {}),
          });
        });
        this.start = { world, choice };
        start = {
          listings: clubListings(world, choice.tier),
          fortune: tierFortune(world, choice.tier),
        };
      } else if (r.body.type === 'take-over') {
        if (!this.start) throw new Error(sourceMessage('copy.host.f3db275cee'));
        if (this.world && !r.body.replace) throw new Error(sourceMessage('copy.host.76a7247c60'));
        // `takeOver` refuses before it changes anything, so a refused club leaves the list open.
        const taken = takeOver(
          this.start.world,
          r.body.clubId,
          this.start.choice,
          undefined,
          this.release,
        );
        // The new career gets its own database once the client creates it (→SAVE-2).
        this.closeGame();
        this.world = taken;
        initializeReadModels(this.world);
        this.start = undefined;
        changed = true;
      } else {
        const w = this.world;
        if (!w) throw new Error(sourceMessage('copy.client.a198ec6115'));
        if (r.body.type === 'command') {
          const cmd = r.body.command;
          // Only the inbox can be read once the career has ended (→OWNER-16, ECON-24).
          if (careerEnded(w) && cmd.type !== 'read-inbox')
            throw new Error(w.bankrupt ? BANKRUPT_MESSAGE : ENDED_MESSAGE);
          if (cmd.type === 'next-event') {
            let days = 0;
            for (const day of nextEventDays(w)) {
              void day;
              // No intermediate view/progress publication or public cancel journey.
              if (++days % 14 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
            }
          } else if (cmd.type === 'advance-days' || cmd.type === 'next-match') {
            if (w.critical) throw new Error(sourceMessage('copy.host.0224ffabb2'));
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
              if (p && (p.frames.length || p.script)) playback = p;
              if (
                w.critical ||
                careerEnded(w) ||
                (cmd.type === 'next-match' && w.ownMatches.length > matchCount)
              )
                break;
              // Every step ends when the season closes. A multi-day step also ends on the day any
              // club news arrives or our match is played, so the date lands on that day; the
              // clock itself stops only for enabled kinds (WEB-18).
              if (
                w.year !== year ||
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
              throw new Error(sourceMessage('copy.host.0224ffabb2'));
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              if (w.round >= 46) {
                closeSeason(w);
                w.revision++;
              }
              const p = advanceRound(w, undefined, cmd.type !== 'season');
              if (p && (p.frames.length || p.script)) playback = p;
              if (careerEnded(w)) break;
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
            if (cmd.type === 'season' && w.round === 46 && !careerEnded(w)) {
              closeSeason(w);
              w.revision++;
            }
          } else operate(w, cmd);
          changed = true;
        } else if (r.body.type === 'ack-critical') {
          delete w.critical;
          w.revision++;
          changed = true;
        }
      }
      if (changed && this.world)
        this.world.receiptIds = [...this.world.receiptIds.slice(-199), r.requestId];
      const reply: Reply = {
        requestId: r.requestId,
        ok: true,
        ...this.publish(
          r.viewBase,
          r.body.type === 'command' &&
            r.body.automatic === true &&
            r.body.command.type === 'advance-days',
        ),
        playback,
        start,
        cancelled: this.cancelled,
      };
      this.acknowledgments.set(r.requestId, reply);
      if (this.acknowledgments.size > 32)
        this.acknowledgments.delete(this.acknowledgments.keys().next().value!);
      return reply;
    } catch (error) {
      return {
        ...failure(input, request, error),
        errorCode:
          isSaveCompatibilityError(error) || isSaveCorruptedError(error) ? error.code : undefined,
        ...this.publish(request?.viewBase),
      };
    }
  }
}
