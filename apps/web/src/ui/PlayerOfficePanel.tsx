import { lazy, Suspense, type ReactNode } from 'react';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { openApprovalRequest } from './state';
import { useTaskMemory } from './taskMemory';
import { TabList, TabPanel, useAddressTab } from './PageTabs';
import { openOfficeWork } from './officeDesks';
import { AreaCriteria } from './DirectionLines';
import { Money } from './Money';
import {
  PLAYER_WORK_SCOPES,
  PLAYER_WORK_TABS,
  playerOfficeOverview,
  playerWorkTab,
  type PlayerWork,
  type PlayerWorkTab,
} from './playerOfficeWork';
import s from './PlayerOfficeWork.module.css';
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((module) => ({ default: module.OwnerOffice })),
);

export function PlayerOverview({
  w,
  pending,
  onWork,
}: {
  w: World;
  pending: readonly StopReason[];
  onWork: (tab: PlayerWorkTab) => void;
}) {
  const facts = playerOfficeOverview(w, pending);
  const club = clubOf(w);
  return (
    <section
      className={s.overview}
      aria-label="선수 계약 개요"
      data-testid="player-office-overview"
    >
      <dl className={s.facts}>
        <div>
          <dt>1군 연봉 약정 · 연간</dt>
          <dd>
            <Money value={facts.wage} code={club.country} year={w.year} />
          </dd>
        </div>
        <div>
          <dt>이번 시즌 계약 만료</dt>
          <dd>{facts.expiring.length}명</dd>
        </div>
        <div>
          <dt>현재 계약 협상</dt>
          <dd>{facts.talks.length}건</dd>
        </div>
        <div>
          <dt>진행 중인 영입 / 매각 제안</dt>
          <dd>
            {facts.outgoing.length} / {facts.incoming.length}건
          </dd>
        </div>
      </dl>
      <ul className={s.stances}>
        {facts.stances.map((row) => (
          <li key={row.key}>
            <h3>{row.name}</h3>
            <p>{row.applied}</p>
            <p>
              {row.actor} · {row.auto ? '자동' : '직접'} · 결재 대기 {row.pending.length}건
            </p>
            <button data-ui="link" onClick={() => onWork(row.key)}>
              {PLAYER_WORK_TABS.find(([key]) => key === row.key)![1]} 업무 열기
            </button>
            {row.pending.map((item) => (
              <button key={item.id} data-ui="link" onClick={() => openApprovalRequest(w.id, item)}>
                {item.title} · 검토하기
              </button>
            ))}
          </li>
        ))}
      </ul>
      <details data-ui="disclosure">
        <summary>만료 선수·계약 협상 현황</summary>
        <p>
          이번 시즌 계약 만료: {facts.expiring.map((player) => player.name).join(', ') || '없음'}
        </p>
        <p>
          계약 협상:{' '}
          {facts.talks
            .map(
              (player) =>
                `${player.name} · ${player.talk!.kind === 'improve' ? '계약 개선' : '재계약'}`,
            )
            .join(', ') || '없음'}
        </p>
      </details>
    </section>
  );
}

export function PlayerOfficeWork({
  w,
  client,
  controller,
  pending,
  work,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  pending: readonly StopReason[];
  work: (tab: PlayerWork) => ReactNode;
}) {
  const [selected, setTab] = useAddressTab('work', PLAYER_WORK_TABS, 'overview', {
    world: w.id,
    key: 'office-work-players',
    path: '/direction?view=players',
    keepFirst: true,
    older: (params) =>
      playerWorkTab(params.get('work') ?? useTaskMemory.getState().values['office-work-players']),
  });
  const tab = playerWorkTab(selected);
  const select = (next: PlayerWorkTab) => {
    if (next === tab) return;
    setTab(next);
    openOfficeWork(next);
  };
  const scope = tab === 'overview' ? undefined : PLAYER_WORK_SCOPES[tab];
  return (
    <>
      <TabList
        tabs={PLAYER_WORK_TABS}
        value={tab}
        onChange={select}
        label="선수 계약 업무"
        idPrefix="office-players"
      />
      <TabPanel idPrefix="office-players" value={tab}>
        {tab === 'overview' ? (
          <PlayerOverview w={w} pending={pending} onWork={select} />
        ) : (
          <>
            <OfficeWorkResponsibility
              w={w}
              client={client}
              controller={controller}
              scope={[scope!.responsibility]}
            />
            <AreaCriteria w={w} areas={scope!.areas} />
            {work(tab)}
          </>
        )}
      </TabPanel>
    </>
  );
}

/** The same guarded confirmation component serves each selected business scope. */
export function OfficeWorkResponsibility({
  w,
  client,
  controller,
  scope,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  scope: readonly ResponsibilityKey[];
}) {
  return (
    <Suspense fallback={<p role="status">결재 설정을 여는 중…</p>}>
      <OwnerOffice
        key={`${w.id}:${scope.join(',')}`}
        client={client}
        controller={controller}
        scope={scope}
      />
    </Suspense>
  );
}
