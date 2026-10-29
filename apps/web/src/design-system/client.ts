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
  if (!response.ok) throw new Error(data.error ?? '샘플 데이터를 불러오지 못했어요.');
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
    if (!response.ok || !reply.ok) throw new Error(reply.error ?? '샘플 조회에 실패했어요.');
    return reply;
  };
  const command = async () => {
    notify('미리보기 동작입니다. 샘플과 저장된 게임은 변경되지 않습니다.');
    return { requestId: 'design-system-preview', ok: true, view: sample.view };
  };
  const client = {
    state,
    command,
    found: command,
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
      notify('샘플에서는 저장 파일을 내보내지 않습니다.');
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
      notify('재생 상태 미리보기입니다. 게임 날짜는 진행하지 않습니다.');
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
