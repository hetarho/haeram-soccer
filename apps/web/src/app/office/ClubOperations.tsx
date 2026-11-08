import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import {
  displayLocale,
  displayMessage,
  localizeValue,
  useTextLocale,
} from '../../presentation/text';
import type { ReactNode } from 'react';
import type { World } from '../../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../../packages/engine/src/sponsors';
import { clubOf } from '../../../../../packages/engine/src/player-state';
import { STADIUM_STEPS } from '../../../../../packages/engine/src/facilities';
import type { ProgressionController } from '../../runtime/progression';
import type { ClientState, GameClient } from '../../runtime/client';
import { useLocale } from '../../presentation/react';
import { BusinessWorkbench } from '../../pages/club';
import { FinanceOutlook } from './FinanceOutlook';
import { DirectionAreas } from '../../pages/club';
import { DeskBody, DeskSettings, DeskStats, type DeskStat } from '../../entities/office';
import { DESK_AREAS, DESK_RESPONSIBILITIES } from '../../shared/routing/officeDesks';
import { OwnerOffice } from './OwnerOfficeView';
import {
  OPERATIONS_PATH,
  OPERATIONS_VIEWS,
  type OperationsView,
} from '../../shared/routing/clubSections';
import { TabList, TabPanel, useAddressTab } from '../../shared/ui/PageTabs';
import { openOperations } from '../../shared/routing/state';
import { TaskReturn } from '../../pages/club';
import { compactMoney, seasonName } from '../../presentation/format';
import { cashState } from '../../entities/player';

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
  useTextLocale();
  const club = clubOf(w);
  let stats: DeskStat[], caption: ReactNode;
  if (view === 'investment') {
    const cash = cashState(w);
    const stadium = STADIUM_STEPS[w.stadium];
    caption = sourceMessage('copy.ClubOperations.8fa355e7e6', {
      p0: stadium.name,
      p1: w.trainingGround,
      p2: w.academyFacility,
    });
    stats = [
      {
        label: sourceMessage('copy.ClubCashSummary.861779d896'),
        value: compactMoney(w.cash, club.country, w.year),
      },
      { label: cash.label, value: cash.value, note: cash.status },
      {
        label: sourceMessage('copy.ClubOperations.64779ec1ad'),
        value: sourceMessage('copy.ClubOperations.e718a2e7a8', {
          p0: stadium.capacity.toLocaleString(displayLocale()),
        }),
      },
      {
        label: sourceMessage('copy.ClubOperations.d9d196449f'),
        value: sourceMessage('copy.ClubOperations.7e77eaa28b', {
          p0: Object.keys(w.facilityWorks ?? {}).length,
        }),
      },
    ];
  } else {
    const open = sponsors.filter((slot) => slot.open),
      signed = open.filter((slot) => slot.contract),
      next = sponsors.filter((slot) => !slot.open).sort((a, b) => a.opens - b.opens)[0];
    stats = [
      {
        label: sourceMessage('copy.ClubOperations.08f8ad9243'),
        value: `${signed.length} / ${open.length}`,
      },
      {
        label: sourceMessage('copy.ClubOperations.0ba335204c'),
        value: sourceMessage('copy.ClubOperations.df32dea4ca', { p0: open.length - signed.length }),
        note: open.some((slot) => !slot.contract && slot.offers.length)
          ? sourceMessage('copy.ClubOperations.e8d89f630f')
          : undefined,
      },
      {
        label: sourceMessage('copy.ClubOperations.885b2ae92f'),
        value: next?.label ?? sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
        note: next
          ? sourceMessage('copy.ClubOperations.515f2f2582', { p0: seasonName(next.opens) })
          : undefined,
      },
    ];
  }
  return (
    <>
      {localizeValue(caption && <p data-testid="operations-caption">{localizeValue(caption)}</p>)}
      <DeskStats
        label={displayMessage('copy.ClubOperations.44e5ce43f9', { p0: label })}
        stats={stats}
      />
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
  useTextLocale();
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
        label={localizeValue(t('club.operations.title'))}
        idPrefix="club-operations"
      />
      <TabPanel idPrefix="club-operations" value={view}>
        <DeskBody data-operations-view={view}>
          {localizeValue(
            view !== 'identity' && (
              <OperationsFacts
                w={w}
                view={view}
                label={localizeValue(label)}
                sponsors={state.view!.sponsors}
              />
            ),
          )}
          {localizeValue(
            view !== 'identity' && (
              <DeskSettings>
                {/* Mounted with the section, which loads as its own chunk: a panel arriving later
                  would push the offers below it away from an owner's tap. */}
                {localizeValue(
                  responsibilities.length > 0 && (
                    <OwnerOffice
                      key={`${w.id}:${view}`}
                      client={client}
                      controller={controller}
                      scope={responsibilities}
                    />
                  ),
                )}
                <DirectionAreas w={w} areas={DESK_AREAS[view]} />
              </DeskSettings>
            ),
          )}
          {localizeValue(
            view === 'investment' ? (
              <>
                <FinanceOutlook w={w} />
                <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
                <BusinessWorkbench state={state} client={client} part="build" />
                {localizeValue(
                  w.campaigns.length > 0 && (
                    <BusinessWorkbench
                      state={state}
                      client={client}
                      part="marketing"
                      legacy={legacy}
                    />
                  ),
                )}
              </>
            ) : (
              <BusinessWorkbench state={state} client={client} part={view} legacy={legacy} />
            ),
          )}
        </DeskBody>
      </TabPanel>
    </div>
  );
}
