import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { createStore } from 'zustand/vanilla';
import type { GameClient, ClientState } from '../runtime/client';
import type { ProgressionController, ProgressionState } from '../runtime/progression';
import type { Reply, Request, View } from '../runtime/protocol';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { gameStore, initialClientState } from '../runtime/store';

export interface Sample {
  view: View;
  playback: MatchPlayback;
}
export async function loadSample(): Promise<Sample> {
  const response = await fetch('/__design-system');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? sourceMessage('copy.client.adc15ce57e'));
  return data;
}
export function previewRuntime(sample: Sample, notify: (message: string) => void) {
  const state: ClientState = {
    ...initialClientState,
    view: sample.view,
    busy: false,
    processing: false,
    readonly: false,
    activity: 'idle',
    playback: sample.playback,
  };
  gameStore.setState(state, true);
  const read = async (body: Request['body']): Promise<Reply> => {
    const response = await fetch('/__design-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const reply = (await response.json()) as Reply;
    if (!response.ok || !reply.ok)
      throw new Error(reply.error ?? sourceMessage('copy.client.b5067270b2'));
    return reply;
  };
  const command = async () => {
    notify(sourceMessage('copy.client.e4bd41337d'));
    return { requestId: 'design-system-preview', ok: true, view: sample.view };
  };
  const client = {
    state,
    command,
    save: async () => {
      await command();
    },
    saveSoon: () => {},
    whenSaved: async () => {},
    whenIdle: async () => {},
    cancel: () => {},
    acknowledge: async () => undefined,
    setClockRunning: () => {},
    hasStoredGame: () => false,
    earlierRules: () => undefined,
    exportFile: async () => {
      notify(sourceMessage('copy.client.62b45e9016'));
      return undefined;
    },
    checkpoint: async () => {
      await command();
      return undefined;
    },
    switchTo: async () => {
      await command();
      return false;
    },
    importFile: async () => {
      await command();
    },
    reload: async () => {
      await command();
    },
    forget: async () => {
      await command();
    },
    archive: async (year) => (await read({ type: 'archive', year })).archive,
    fullStats: async (scope) => (await read({ type: 'full-stats', ...scope })).fullStats,
    managerHistory: async (cursor) =>
      (await read({ type: 'manager-history', cursor, world: sample.view.world.id }))
        .managerHistory!,
    clubRecords: async () => (await read({ type: 'club-records' })).clubRecords!,
    personCareer: async (person) => (await read({ type: 'person-career', person })).personCareer!,
    headToHead: async (club) => (await read({ type: 'head-to-head', club })).headToHead!,
    clubProfile: async (clubId) =>
      (await read({ type: 'club-profile', clubId, world: sample.view.world.id })).clubProfile!,
    playerProfile: async (playerId, clubId) =>
      (
        await read({
          type: 'player-profile',
          playerId,
          world: sample.view.world.id,
          ...(clubId ? { clubId } : {}),
        })
      ).playerProfile!,
    recruitmentHistory: async () =>
      (await read({ type: 'recruitment-history' })).recruitmentHistory!,
    mediationPreview: async (id, support) =>
      (await read({ type: 'mediation-preview', id, support })).mediationPreview!,
    worldMarket: async (query = {}) =>
      (await read({ type: 'world-market', query: { ...query, world: sample.view.world.id } }))
        .worldMarket!,
    worldMarketDetail: async (target, fee, loan) =>
      (await read({ type: 'world-market-detail', target, fee, loan })).worldMarketDetail!,
    leagueFixtures: async (league) =>
      (
        await read({
          type: 'league-fixtures',
          country: league.code,
          tier: league.tier,
          group: league.group,
        })
      ).leagueFixtures ?? [],
  } satisfies Partial<GameClient>;
  const store = createStore<ProgressionState>(() => ({
    running: false,
    pace: 'x1',
    watching: false,
    reason: '',
    eventRequest: 0,
    background: { hidden: false, away: 'off', resultNotice: false },
  }));
  const controller = {
    store,
    start: () => {
      store.setState({ running: true });
      notify(sourceMessage('copy.client.caca108939'));
    },
    pause: () => store.setState({ running: false }),
    stop: () => store.setState({ running: false }),
    setPace: (pace: ProgressionState['pace']) => store.setState({ pace }),
    setBackground: (background: Partial<ProgressionState['background']>) =>
      store.setState({ background: { ...store.getState().background, ...background } }),
    setWatching: (watching: boolean) => store.setState({ watching }),
    nextEvent: command,
    playThrough: command,
    eventDecided: () => {},
    enterOffice: () => {},
    leaveOffice: () => {},
    clearAway: () => store.setState({ away: undefined }),
    clearMatchEve: () => {},
    clearResultNotice: () => {},
    suspend: () => () => {},
  } as unknown as ProgressionController;
  return { state, client: client as unknown as GameClient, controller };
}
