import type { World } from '../../packages/contracts/src/types';
import type { ManagerHistoryPage } from '../../packages/contracts/src/manager-history-view';
import { activateMatchModel } from '../../packages/engine/src/match-model';
import { ensureManagerHistory } from '../../packages/engine/src/manager-history-capture';
import { MATCH_MODEL_RELEASE } from '../../packages/engine/src/match-model-release';
import { preparedWorld } from './prepared-world';
import { Host } from '../../apps/web/src/runtime/host';
import {
  managerRowView,
  type ManagerLegacyView,
  type ManagerTenureView,
} from '../../apps/web/src/ui/managerHistoryView';
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
/** A validated prepared career; UI changes do not rebuild its two seasons. */
export async function managerJourneyCareer(): Promise<ManagerJourneyCareer> {
  const w = preparedWorld('manager-journey');
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
    cupSeason: 1950,
  };
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
  const world = preparedWorld('manager-activation');
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
