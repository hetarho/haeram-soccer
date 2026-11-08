import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type {
  Command,
  SponsorContract,
  SponsorKind,
} from '../../../../../../packages/contracts/src/types';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { financialBreakdown, roundShare } from '../../../../../../packages/engine/src/finance';
import {
  SPONSOR_KIND_LABELS,
  sponsorAnnual,
  type SponsorBonus,
} from '../../../../../../packages/engine/src/sponsors';
import { ratio } from '../../../../../../packages/engine/src/primitives';
import { CAMPAIGNS } from '../../../../../../packages/engine/src/ops-commercial';
import { fixedCostRunway } from '../../../../../../packages/engine/src/investment';
import type { ClientState, GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { Dialog } from '../../../shared/ui/Dialog';
import { FacilityParts } from './FacilityParts';
import { STADIUM_STEPS } from '../../../../../../packages/engine/src/facilities';
import { FinancialBreakdown } from './FinancialBreakdown';
import { number } from '../../../presentation/format';
import { DecisionOwner } from './DecisionOwner';
import { Money } from '../../../shared/ui/Money';
import s from './BusinessWorkbench.module.css';

/**
 * The operations page's views: the ledger and fixed costs, one kind of deal, or the club's design.
 */
export type WorkbenchPart = 'finance' | 'build' | 'sponsor' | 'marketing' | 'identity';
/** The design editor loads when 구단 디자인 first opens, outside the other pages (→ARCH-28). */
const ClubDesignView = lazy(() =>
  import('./ClubDesignView').then((module) => ({ default: module.ClubDesignView })),
);
const bonusRule: Record<SponsorBonus, string> = {
  none: sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
  promotion: sourceMessage('copy.BusinessWorkbench.5a82f0177c'),
  results: sourceMessage('copy.BusinessWorkbench.34a1ae55bc'),
};
const bonusNote: Record<SponsorBonus, string> = {
  none: sourceMessage('copy.BusinessWorkbench.6ee6f577b5'),
  promotion: sourceMessage('copy.BusinessWorkbench.be29433f77'),
  results: sourceMessage('copy.BusinessWorkbench.f295281a03'),
};
const kindNote: Record<SponsorKind, string> = {
  stable: sourceMessage('copy.BusinessWorkbench.f571012d94'),
  performance: sourceMessage('copy.BusinessWorkbench.e7d5c8d857'),
  exclusive: sourceMessage('copy.BusinessWorkbench.a03e437865'),
  indexed: sourceMessage('copy.BusinessWorkbench.27334bd1ec'),
};
const runway = (rounds: number) =>
  rounds >= 999
    ? sourceMessage('copy.BusinessWorkbench.a5d3e5ed33')
    : sourceMessage('copy.BusinessWorkbench.fcefde4602', { p0: rounds });
const season = (year: number) =>
  sourceMessage('copy.BusinessWorkbench.b58cd6400a', { p0: year, p1: String(year + 1).slice(2) });
/** When a closed slot opens (→ECON-8): its year in our country, marked when estimated. */
function opening(
  opens: number,
  status: string,
  capacity: number | undefined,
  year: number,
  seats: number,
) {
  const era = sourceMessage('copy.BusinessWorkbench.0e759b43e3', {
    p0: season(opens),
    p1: status === 'observed' ? '' : sourceMessage('copy.BusinessWorkbench.a972b5747b'),
  });
  if (!capacity) return sourceMessage('copy.BusinessWorkbench.545b903412', { p0: era });
  return opens <= year
    ? sourceMessage('copy.BusinessWorkbench.c4679d0bac', {
        p0: number(capacity),
        p1: number(seats),
      })
    : sourceMessage('copy.BusinessWorkbench.072ff9a4b1', { p0: era, p1: number(capacity) });
}

function SponsorContractCard({
  contract,
  rule,
  effective,
  next,
  bonus,
  year,
  format,
}: {
  contract: SponsorContract;
  rule: SponsorBonus;
  effective: string;
  next: string;
  bonus: ReactNode;
  year: number;
  format: (value: string) => ReactNode;
}) {
  useTextLocale();
  const remaining = contract.until - year;
  return (
    <article
      data-surface="panel"
      className={s.card}
      data-testid={`sponsor-contract-${contract.slot}`}
    >
      <h3>{contract.name}</h3>
      <p>
        {richMessage('copy.BusinessWorkbench.09bb182175', {
          p0: SPONSOR_KIND_LABELS[contract.kind],
          p1: season(contract.until - 1),
          p2:
            remaining === 1
              ? sourceMessage('copy.BusinessWorkbench.7c699c0293')
              : sourceMessage('copy.BusinessWorkbench.7613e6ccf8', { p0: remaining }),
        })}
      </p>
      <div className={s.metrics}>
        <div>
          <span>{richMessage('copy.BusinessWorkbench.7c4836f32d')}</span>
          <b>{localizeValue(format(effective))}</b>
        </div>
        <div>
          <span>{richMessage('copy.BusinessWorkbench.3713318c9a')}</span>
          <b>{localizeValue(format(next))}</b>
        </div>
        {localizeValue(bonus)}
        {localizeValue(
          contract.kind === 'indexed' && (
            <div>
              <span>{richMessage('copy.BusinessWorkbench.276315d184')}</span>
              <b>{localizeValue(format(contract.annual))}</b>
            </div>
          ),
        )}
      </div>
      <p className={s.note}>
        {localizeValue(bonusNote[rule])}
        {localizeValue(contract.kind !== 'stable' && ` · ${kindNote[contract.kind]}`)}
      </p>
    </article>
  );
}

export function BusinessWorkbench({
  state,
  client,
  part,
  legacy,
  selectedSlot,
}: {
  state: ClientState;
  client: GameClient;
  part: WorkbenchPart;
  legacy?: ReactNode;
  selectedSlot?: string;
}) {
  useTextLocale();
  // 구단 디자인 is the authoritative design editor (→WEB-39/71/86), not a money view.
  if (part === 'identity')
    return (
      <Suspense
        fallback={
          <p className={s.note} role="status">
            {richMessage('copy.BusinessWorkbench.c8ef43c113')}
          </p>
        }
      >
        {/* One view per game: a pending apply or its message never carries over (→WEB-74). */}
        <ClubDesignView key={state.view!.world.id} state={state} client={client} />
      </Suspense>
    );
  return (
    <MoneyWorkbench
      state={state}
      client={client}
      part={part}
      legacy={legacy}
      selectedSlot={selectedSlot}
    />
  );
}

function MoneyWorkbench({
  state,
  client,
  part,
  legacy,
  selectedSlot,
}: {
  state: ClientState;
  client: GameClient;
  part: Exclude<WorkbenchPart, 'identity'>;
  legacy?: ReactNode;
  selectedSlot?: string;
}) {
  useTextLocale();
  const w = state.view!.world,
    club = clubOf(w),
    finance = state.view!.finance || financialBreakdown(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const blocked = useGameState(gameActionsBlocked);
  const tab = part;
  const sponsorViews = state.view!.sponsors.filter(
    (view) => !selectedSlot || view.slot === selectedSlot,
  );
  const [sheet, setSheet] = useState<'ledger' | 'legacy'>();
  const [message, setMessage] = useState('');
  const games = Math.max(
    1,
    w.fixtures.filter(
      (fixture) =>
        fixture.kind === 'league' &&
        (fixture.home === w.playerClub || fixture.away === w.playerClub),
    ).length,
  );
  const played = w.tables[w.playerClub]?.played || 0;
  // A slot's bonus as a metric: per league win for the main sponsor, once for the kit supplier.
  const bonusMetric = (rule: SponsorBonus, bonus: string) =>
    rule === 'none' ? null : (
      <div>
        <span>
          {localizeValue(
            rule === 'results'
              ? sourceMessage('copy.BusinessWorkbench.65604830bd')
              : sourceMessage('copy.BusinessWorkbench.e141b508cb'),
          )}
        </span>
        <b>{localizeValue(format(rule === 'results' ? ratio(bonus, 1n, BigInt(games)) : bonus))}</b>
      </div>
    );
  const act = async (command: Command, success: string) => {
    if (blocked) return false;
    const reply = await client.command(command, { background: true });
    setMessage(
      reply?.ok
        ? success
        : client.state.error || sourceMessage('copy.BusinessWorkbench.8eae2fc7e4'),
    );
    return !!reply?.ok;
  };
  return (
    <section
      className={s.workbench}
      aria-label={localizeValue(
        part === 'finance'
          ? sourceMessage('copy.BusinessWorkbench.0bfdd0eaa8')
          : part === 'build'
            ? sourceMessage('copy.BusinessWorkbench.af2559470c')
            : part === 'sponsor'
              ? sourceMessage('club.operations.sponsor')
              : sourceMessage('copy.BusinessWorkbench.56368bb221'),
      )}
    >
      {localizeValue(
        part === 'finance' ? (
          <>
            <header className={s.heading}>
              <h2>{richMessage('copy.BusinessWorkbench.e4f237745d')}</h2>
              <span>{richMessage('copy.BusinessWorkbench.5e3e9e9ec6')}</span>
            </header>
            <div className={s.summary}>
              <div data-surface="tile">
                <span>{richMessage('copy.BusinessWorkbench.d69ab3db74')}</span>
                <b>{localizeValue(format(finance.costs.annual))}</b>
              </div>
              <div data-surface="tile">
                <span>{richMessage('copy.BusinessWorkbench.d7e60f40ff')}</span>
                <b>{localizeValue(format(finance.costs.nextRound))}</b>
              </div>
              <div data-surface="tile">
                <span>{richMessage('copy.BusinessWorkbench.82751fa236')}</span>
                <b>{localizeValue(runway(fixedCostRunway(w.cash, finance.costs.annual)))}</b>
              </div>
            </div>
            <p className={s.note}>{richMessage('copy.BusinessWorkbench.e706f1ff91')}</p>
            <div className={s.detailActions}>
              <button
                onClick={(event) => {
                  event.currentTarget.focus();
                  setSheet('ledger');
                }}
              >
                {richMessage('copy.BusinessWorkbench.d851b471fd')}
              </button>
              {localizeValue(
                legacy && (
                  <button
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setSheet('legacy');
                    }}
                  >
                    {richMessage('copy.BusinessWorkbench.32f99e0fd9')}
                  </button>
                ),
              )}
            </div>
          </>
        ) : tab === 'build' ? (
          <FacilityParts w={w} />
        ) : tab === 'sponsor' ? (
          <div className={s.sponsorDesk}>
            <header className={s.heading}>
              <h2>{richMessage('copy.BusinessWorkbench.37bbf00d6a')}</h2>
              <span>{richMessage('copy.BusinessWorkbench.318805e737')}</span>
            </header>
            <p className={s.note}>
              {richMessage('copy.BusinessWorkbench.e16bc51631', { p0: games })}
            </p>
            <div className={s.slots}>
              {localizeValue(
                sponsorViews.map((view) => (
                  <section
                    data-surface="panel"
                    className={s.slot}
                    key={view.slot}
                    aria-label={localizeValue(view.label)}
                    data-testid={`sponsor-slot-${view.slot}`}
                    data-slot-state={!view.open ? 'locked' : view.contract ? 'signed' : 'vacant'}
                  >
                    <header className={s.slotHeading}>
                      <h4>
                        {localizeValue(view.label)}
                        <span data-ui="label" className={s.slotState}>
                          {localizeValue(
                            !view.open
                              ? sourceMessage('copy.BusinessWorkbench.0da3f80db1')
                              : view.contract
                                ? sourceMessage('copy.BusinessWorkbench.7882f3bcaf')
                                : sourceMessage('copy.BusinessWorkbench.e164598900', {
                                    p0: view.offers.length,
                                  }),
                          )}
                        </span>
                      </h4>
                      <span>
                        {richMessage('copy.BusinessWorkbench.dce818df7a', {
                          p0: Math.round(view.share * 100),
                          p1: ' ',
                          p2: bonusRule[view.bonus],
                        })}
                      </span>
                    </header>
                    {localizeValue(
                      !view.open ? (
                        <p className={s.note}>
                          {localizeValue(
                            opening(
                              view.opens,
                              view.status,
                              view.capacity,
                              w.year,
                              STADIUM_STEPS[w.stadium].capacity,
                            ),
                          )}
                        </p>
                      ) : view.contract ? (
                        <SponsorContractCard
                          contract={view.contract}
                          rule={view.bonus}
                          effective={sponsorAnnual(w, view.contract)}
                          next={
                            view.contract.lastPaid < w.year && played < games
                              ? roundShare(sponsorAnnual(w, view.contract), played + 1, games)
                              : '0'
                          }
                          bonus={bonusMetric(view.bonus, view.contract.bonus)}
                          year={w.year}
                          format={format}
                        />
                      ) : (
                        <div className={s.cards}>
                          {localizeValue(
                            view.offers.map((offer, index) => (
                              <article
                                data-surface="panel"
                                className={s.card}
                                key={offer.kind}
                                data-testid={`sponsor-${view.slot}-${offer.kind}`}
                              >
                                <h3>{localizeValue(SPONSOR_KIND_LABELS[offer.kind])}</h3>
                                <p>
                                  {richMessage('copy.BusinessWorkbench.b77b347b31', {
                                    p0: offer.name,
                                    p1: offer.term,
                                    p2: season(offer.until - 1),
                                  })}
                                </p>
                                <div className={s.metrics}>
                                  <div>
                                    <span>{richMessage('copy.BusinessWorkbench.2022ca886b')}</span>
                                    <b>{localizeValue(format(offer.annual))}</b>
                                  </div>
                                  <div>
                                    <span>{richMessage('copy.BusinessWorkbench.3713318c9a')}</span>
                                    <b>
                                      {localizeValue(
                                        format(
                                          played < games
                                            ? roundShare(offer.annual, played + 1, games)
                                            : '0',
                                        ),
                                      )}
                                    </b>
                                  </div>
                                  {localizeValue(bonusMetric(view.bonus, offer.bonus))}
                                </div>
                                <p className={s.note}>
                                  {localizeValue(bonusNote[view.bonus])} ·{' '}
                                  {localizeValue(kindNote[offer.kind])}
                                </p>
                                <button
                                  disabled={blocked}
                                  onClick={() =>
                                    void act(
                                      { type: 'sign-sponsor', slot: view.slot, offer: index },
                                      sourceMessage('copy.BusinessWorkbench.7adf2f6977', {
                                        p0: view.label,
                                      }),
                                    )
                                  }
                                >
                                  {richMessage('copy.BusinessWorkbench.5709f4c478', {
                                    p0: view.label,
                                  })}
                                </button>
                              </article>
                            )),
                          )}
                        </div>
                      ),
                    )}
                  </section>
                )),
              )}
            </div>
            <section
              className={s.delegation}
              aria-label={displayMessage('copy.BusinessWorkbench.0e59074863')}
            >
              <DecisionOwner
                w={w}
                decision="sponsors"
                auto={sourceMessage('copy.BusinessWorkbench.5077fc7d22')}
                owner={sourceMessage('copy.BusinessWorkbench.7ccc2baf1b')}
              />
            </section>
          </div>
        ) : tab === 'marketing' ? (
          <div data-surface="panel" className={s.panel}>
            {/* Campaigns are no more (→ECON-7): one started before settles here, read-only. */}
            <div className={s.panelHeading}>
              <h3>{richMessage('copy.BusinessWorkbench.9f8be710d6')}</h3>
              <span>{richMessage('copy.BusinessWorkbench.c96ec4f849')}</span>
            </div>
            <div className={s.cards}>
              {localizeValue(
                w.campaigns.map((campaign) => (
                  <article
                    data-surface="panel"
                    className={s.card}
                    key={campaign.id}
                    data-testid={`campaign-${campaign.kind}`}
                  >
                    <h3>
                      {localizeValue(
                        CAMPAIGNS.find((offer) => offer.kind === campaign.kind)?.label ??
                          sourceMessage('copy.BusinessWorkbench.56368bb221'),
                      )}
                    </h3>
                    <div className={s.metrics}>
                      <div>
                        <span>{richMessage('copy.BusinessWorkbench.e8b04d9d68')}</span>
                        <b>{localizeValue(format(campaign.cost))}</b>
                      </div>
                      <div>
                        <span>{richMessage('copy.BusinessWorkbench.f416eafa5b')}</span>
                        <b>{localizeValue(format(w.cash))}</b>
                      </div>
                    </div>
                    <p className={s.note}>
                      {richMessage('copy.BusinessWorkbench.a9fad12a99', { p0: campaign.remaining })}
                    </p>
                  </article>
                )),
              )}
            </div>
            {localizeValue(
              w.events
                .filter((event) => event.kind === 'campaign-result')
                .slice(-2)
                .map((event, index) => (
                  <p className={s.result} key={index}>
                    <b>{localizeValue(event.title)}</b>
                    <span>{localizeValue(event.detail)}</span>
                  </p>
                )),
            )}
          </div>
        ) : null,
      )}
      {localizeValue(
        message && (
          <p data-surface="inset" className={s.message} role="status">
            {localizeValue(message)}
          </p>
        ),
      )}
      {localizeValue(
        sheet === 'ledger' ? (
          <Dialog
            label={displayMessage('copy.BusinessWorkbench.70849d271d')}
            onClose={() => setSheet(undefined)}
            wide
            actions={
              <div className={s.close}>
                <button onClick={() => setSheet(undefined)}>
                  {richMessage('copy.BusinessWorkbench.03f0b3fcee')}
                </button>
              </div>
            }
          >
            <FinancialBreakdown w={w} breakdown={finance} />
          </Dialog>
        ) : sheet === 'legacy' && legacy ? (
          <Dialog
            label={displayMessage('copy.BusinessWorkbench.32f99e0fd9')}
            onClose={() => setSheet(undefined)}
            wide
            actions={
              <div className={s.close}>
                <button onClick={() => setSheet(undefined)}>
                  {richMessage('copy.BusinessWorkbench.8475af89e7')}
                </button>
              </div>
            }
          >
            {localizeValue(legacy)}
          </Dialog>
        ) : null,
      )}
    </section>
  );
}
