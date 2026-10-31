import { lazy, Suspense, type ReactNode } from 'react';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useTaskMemory } from './taskMemory';
import { TabList, TabPanel, useAddressTab } from './PageTabs';
import { openOfficeWork } from './officeDesks';
import { AreaCriteria } from './DirectionLines';
import { Card } from './Card';
import { ApprovalTray, DeskBody, DeskSettings } from './OfficeDesk';
import { PixelIcon } from './PixelIcon';
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
  // A joint approval waits in more than one work; the tray lists it once.
  const waiting = [
    ...new Map(facts.stances.flatMap((row) => row.pending).map((item) => [item.id, item])).values(),
  ];
  return (
    <section
      className={s.overview}
      aria-label="선수 계약 개요"
      data-testid="player-office-overview"
    >
      <ApprovalTray w={w} items={waiting} />
      <ul className={s.stances}>
        {facts.stances.map((row) => (
          <li key={row.key}>
            <Card
              surface="detail"
              className={s.stance}
              title={row.name}
              meta={
                <span className={s.owner}>
                  <span data-ui="label" data-auto={row.auto}>
                    {row.auto ? '자동' : '직접'}
                  </span>
                  {row.actor}
                  {row.pending.length > 0 && (
                    <span className={s.waiting}>
                      결재 대기 <b data-ui="count">{row.pending.length}</b>
                    </span>
                  )}
                </span>
              }
              actions={
                <button type="button" onClick={() => onWork(row.key)}>
                  {PLAYER_WORK_TABS.find(([key]) => key === row.key)![1]} 업무 열기
                  <PixelIcon name="chevronRight" size={14} />
                </button>
              }
            >
              <p>{row.applied}</p>
            </Card>
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
          <DeskBody>
            <DeskSettings>
              <OfficeWorkResponsibility
                w={w}
                client={client}
                controller={controller}
                scope={[scope!.responsibility]}
              />
              <AreaCriteria w={w} areas={scope!.areas} />
            </DeskSettings>
            {work(tab)}
          </DeskBody>
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
