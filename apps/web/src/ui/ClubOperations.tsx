import { lazy, Suspense, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import type { ProgressionController } from '../runtime/progression';
import type { ClientState, GameClient } from '../runtime/client';
import { useLocale } from '../presentation/react';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import { AreaCriteria } from './DirectionLines';
import { DeskBody, DeskSettings, DeskStats, type DeskStat } from './OfficeDesk';
import { DESK_AREAS, DESK_RESPONSIBILITIES } from './officeDesks';
import { OPERATIONS_PATH, OPERATIONS_VIEWS, type OperationsView } from './clubSections';
import { TabList, TabPanel, useAddressTab } from './PageTabs';
import { openOperations } from './state';
import { TaskReturn } from './TaskReturn';
import { compactMoney, seasonName } from './format';
import { cashState } from './teamState';

/** The direction board and its composer load on first visit (→ARCH-28). */
const StrategyBoard = lazy(() =>
  import('./StrategyBoard').then((module) => ({ default: module.StrategyBoard })),
);
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((module) => ({ default: module.OwnerOffice })),
);

/** The applied facts a section's controls change, read from the live world only. */
function OperationsFacts({
  w,
  view,
  label,
  sponsors,
}: {
  w: World;
  view: 'investment' | 'sponsor';
  label: string;
  sponsors: readonly SponsorSlotView[];
}) {
  const club = clubOf(w);
  let stats: DeskStat[], caption: ReactNode;
  if (view === 'investment') {
    const cash = cashState(w);
    const stadium = STADIUM_STEPS[w.stadium];
    caption = `${stadium.name} · 훈련장 ${w.trainingGround}단계 · 유소년 시설 ${w.academyFacility}단계`;
    stats = [
      { label: '보유 현금', value: compactMoney(w.cash, club.country, w.year) },
      { label: cash.label, value: cash.value, note: cash.status },
      { label: '경기장', value: `${stadium.capacity.toLocaleString('ko-KR')}석` },
      { label: '진행 중인 공사', value: `${Object.keys(w.facilityWorks ?? {}).length}건` },
    ];
  } else {
    const open = sponsors.filter((slot) => slot.open),
      signed = open.filter((slot) => slot.contract),
      next = sponsors.filter((slot) => !slot.open).sort((a, b) => a.opens - b.opens)[0];
    stats = [
      { label: '계약한 자리', value: `${signed.length} / ${open.length}` },
      {
        label: '빈 자리',
        value: `${open.length - signed.length}자리`,
        note: open.some((slot) => !slot.contract && slot.offers.length) ? '제안 도착' : undefined,
      },
      {
        label: '다음 열리는 자리',
        value: next?.label ?? '없음',
        note: next ? `${seasonName(next.opens)} 시즌` : undefined,
      },
    ];
  }
  return (
    <>
      {caption && <p data-testid="operations-caption">{caption}</p>}
      <DeskStats label={`${label} 지표`} stats={stats} />
    </>
  );
}

/**
 * 구단 운영 (→WEB-110): 재정·투자, 후원 and 구단 디자인 as the club's own sections, outside the
 * owner office. Each composes the authoritative panels the office desks held, current facts first.
 */
export function ClubOperations({
  state,
  client,
  controller,
  legacy,
}: {
  state: ClientState;
  client: GameClient;
  controller: ProgressionController;
  /** The era's money context under the finances. */
  legacy: ReactNode;
}) {
  const { t } = useLocale();
  const w = state.view!.world;
  const [view] = useAddressTab<OperationsView>('view', OPERATIONS_VIEWS, 'investment', {
    world: w.id,
    key: 'club-operations',
    path: OPERATIONS_PATH,
    keepFirst: true,
  });
  const tabs = OPERATIONS_VIEWS.map(([id, label]) => [id, t(label)] as const);
  const label = tabs.find(([id]) => id === view)![1];
  const responsibilities = DESK_RESPONSIBILITIES[view];
  return (
    <div data-testid="club-operations">
      {/* A facility or setting link from other work names the way back to it (→WEB-74). */}
      <TaskReturn />
      <TabList<OperationsView>
        tabs={tabs}
        value={view}
        onChange={(next) => {
          if (next !== view) openOperations(next);
        }}
        label={t('club.operations.title')}
        idPrefix="club-operations"
      />
      <TabPanel idPrefix="club-operations" value={view}>
        <DeskBody data-operations-view={view}>
          {view !== 'identity' && (
            <OperationsFacts w={w} view={view} label={label} sponsors={state.view!.sponsors} />
          )}
          {view !== 'identity' && (
            <DeskSettings>
              {responsibilities.length > 0 && (
                <Suspense fallback={null}>
                  <OwnerOffice
                    key={`${w.id}:${view}`}
                    client={client}
                    controller={controller}
                    scope={responsibilities}
                  />
                </Suspense>
              )}
              <AreaCriteria w={w} areas={DESK_AREAS[view]} />
            </DeskSettings>
          )}
          {view === 'investment' ? (
            <>
              <FinanceOutlook w={w} />
              <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
              <BusinessWorkbench state={state} client={client} part="build" />
              {w.campaigns.length > 0 && (
                <BusinessWorkbench state={state} client={client} part="marketing" legacy={legacy} />
              )}
              <details data-ui="disclosure" data-testid="office-library">
                <summary>구단 전체 방향·저장 설정</summary>
                <Suspense fallback={<p role="status">방향을 여는 중…</p>}>
                  <StrategyBoard w={w} client={client} />
                </Suspense>
              </details>
            </>
          ) : (
            <BusinessWorkbench state={state} client={client} part={view} legacy={legacy} />
          )}
        </DeskBody>
      </TabPanel>
    </div>
  );
}
