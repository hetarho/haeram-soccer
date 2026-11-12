import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useEffect, useState } from 'react';
import type {
  DirectionKey,
  FacilityPart,
  PolicyKey,
  PolicyLevel,
  World,
} from '../../../../../../packages/contracts/src/types';
import { POLICY_INFO, policyEffects, policyOf } from '../../../../../../packages/engine/src/policy';
import {
  ACADEMY_FACILITY,
  FACILITY_PART_LABEL,
  TRAINING_GROUND,
  STADIUM_STEPS,
  facilityWork,
  partLevel,
  partTop,
} from '../../../../../../packages/engine/src/facilities';
import { roundShare } from '../../../../../../packages/engine/src/finance-read';
import type { OfficeRead } from '../../../runtime/officeRead';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import {
  STAFF_INFO,
  STAFF_ROLES,
  staffMember,
} from '../../../../../../packages/engine/src/staff-info';
import type { ClientState, GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { Card } from '../../../shared/ui/Card';
import { FacilityArt } from '../../../entities/office';
import { Dialog } from '../../../shared/ui/Dialog';
import { DeskStats } from '../../../entities/office';
import { Money } from '../../../shared/ui/Money';
import { number } from '../../../presentation/format';
import { useAddressTab } from '../../../shared/ui/PageTabs';
import { OPERATIONS_VIEWS, operationsAddress } from '../../../shared/routing/clubSections';
import {
  INVESTMENT_AREAS,
  INVESTMENT_PAGES,
  type InvestmentArea,
} from '../../../shared/routing/investmentAreas';
import { useControlRequest, useFacilityRequest } from '../../../shared/routing/state';
import { BusinessWorkbench } from './BusinessWorkbench';
import { InvestmentTotals } from './InvestmentTotals';
import { OfficeEffects } from './OfficeEffects';
import { TaskReturn } from './TaskReturn';
import { YouthCoach } from './YouthCoach';
import {
  BuildSetting,
  ClubBudget,
  DelegationNote,
  DirectionSetting,
  InvestmentSlider,
  settingLock,
  TicketSetting,
  useClubSettingAction as useInvestmentAction,
} from '../../../entities/office';
import {
  AREA_DELEGATIONS,
  AREA_DIRECTIONS,
  PASSIVE_BUILDS,
  PASSIVE_POLICIES,
} from '../../../entities/office';
import { FixtureKitSelector } from '../../../features/match-prep';
import s from '../../../shared/ui/styles/InvestmentView.module.css';

function Amount({
  w,
  value,
  plain = false,
}: {
  w: World;
  value: string | bigint;
  plain?: boolean;
}) {
  useTextLocale();
  return <Money value={value} code={clubOf(w).country} year={w.year} plain={plain} />;
}

function BudgetSetting({
  w,
  client,
  policyKey,
  office,
}: {
  w: World;
  client: GameClient;
  policyKey: PolicyKey;
  office: OfficeRead;
}) {
  useTextLocale();
  const policy = policyOf(w);
  const current = policy[policyKey];
  const [selected, setSelected] = useState<PolicyLevel>(current);
  useEffect(() => setSelected(current), [current]);
  const action = useInvestmentAction(client);
  const lock = settingLock(w, { policy: policyKey });
  const level = lock ? current : selected;
  const info = POLICY_INFO[policyKey];
  const option = info.levels.find((one) => one.level === level)!;
  const effects = policyEffects({ ...policy, [policyKey]: level });
  const preview = office.policyCosts[policyKey][level]!;
  const base = office.policyCosts[policyKey][1]!;
  const annual =
    policyKey === 'support'
      ? preview.expenses
      : policyKey === 'academy'
        ? preview.academy
        : policyKey === 'recruitment' || policyKey === 'tour'
          ? undefined
          : (BigInt(preview.annual) - BigInt(base.annual)).toString();
  return (
    <Card
      surface="sheet"
      title={localizeValue(info.label)}
      meta={
        policyKey === 'tour'
          ? sourceMessage('copy.InvestmentView.bd55bc0e4f')
          : sourceMessage('copy.InvestmentView.09710fcbef')
      }
      className={s.panel}
      data-control={`policy:${policyKey}`}
      data-locked={lock ? '' : undefined}
    >
      <p className={s.note}>
        {richMessage('copy.InvestmentTotals.4cc8a528aa', {
          p0: info.levels.find((level) => level.level === current)!.name,
        })}
      </p>
      <InvestmentSlider
        label={displayMessage('copy.InvestmentView.8740e5b543', { p0: info.label })}
        options={info.levels.map((one) => ({ value: one.level, name: one.name }))}
        value={level}
        disabled={action.blocked || !!lock}
        onChange={setSelected}
      />
      <div className={s.selection} data-surface="inset">
        {localizeValue(
          policyKey === 'support' ? (
            <dl className={s.supportFacts}>
              <div>
                <dt>{richMessage('copy.InvestmentTotals.d9eefc91be')}</dt>
                <dd>
                  <Amount w={w} value={preview.expenses} />
                </dd>
              </div>
              <div>
                <dt>{richMessage('copy.InvestmentTotals.4d46fe50b9')}</dt>
                <dd>
                  {localizeValue(effects.goodwill > 0 ? '+' : '')}
                  {localizeValue(effects.goodwill)}%
                </dd>
              </div>
              <div>
                <dt>{richMessage('copy.InvestmentTotals.f5d5d839bb')}</dt>
                <dd>×{localizeValue(effects.developmentMultiplier)}</dd>
              </div>
              <div>
                <dt>{richMessage('copy.InvestmentTotals.2aa2ff71ea')}</dt>
                <dd>
                  {localizeValue(effects.recoveryBonus > 0 ? '+' : '')}
                  {localizeValue(effects.recoveryBonus)}
                </dd>
              </div>
            </dl>
          ) : (
            <>
              <b>{localizeValue(option.name)}</b>
              <p>{localizeValue(option.summary)}</p>
              {localizeValue(
                annual !== undefined && (
                  <DeskStats
                    label={displayMessage('copy.InvestmentView.767f615ef4', { p0: info.label })}
                    stats={[
                      {
                        label: sourceMessage('copy.InvestmentView.0cdfeb52d0'),
                        value: <Amount w={w} value={annual} />,
                      },
                      {
                        label: sourceMessage('copy.InvestmentView.131f0bd98f'),
                        value: (
                          <Amount
                            w={w}
                            value={roundShare(annual, w.round >= 46 ? 0 : w.round + 1)}
                          />
                        ),
                      },
                      {
                        label: sourceMessage('copy.InvestmentView.d0bc06a2f8'),
                        value: <Amount w={w} value={preview.annual} />,
                      },
                    ]}
                  />
                ),
              )}
            </>
          ),
        )}
      </div>
      {localizeValue(
        lock ? (
          <p className={s.locked}>
            <span data-ui="badge" data-compact="">
              {richMessage('delegation.badge.delegated')}
            </span>
            <span>{localizeValue(lock)}</span>
          </p>
        ) : (
          <div className={s.apply}>
            <p className={s.note}>
              {localizeValue(
                policyKey === 'recruitment'
                  ? sourceMessage('copy.InvestmentView.3e9d654214')
                  : policyKey === 'support'
                    ? sourceMessage('copy.InvestmentView.a480936d6c')
                    : policyKey === 'tour'
                      ? sourceMessage('copy.InvestmentView.afb698d0e3')
                      : sourceMessage('copy.InvestmentView.fc0aadef44'),
              )}
            </p>
            <button
              type="button"
              data-ui="primary"
              disabled={action.blocked || selected === current}
              onClick={() =>
                void action.apply(
                  { type: 'club-policy', key: policyKey, level: selected },
                  sourceMessage('copy.InvestmentView.3d07a90bf0', { p0: info.label }),
                )
              }
            >
              {localizeValue(
                action.busy
                  ? sourceMessage('copy.ClubSettingControl.304d48a5d2')
                  : policyKey === 'tour'
                    ? sourceMessage('copy.InvestmentView.5ce3a5c330')
                    : sourceMessage('copy.InvestmentView.235d04c236'),
              )}
            </button>
          </div>
        ),
      )}
      {localizeValue(action.error && <p role="alert">{localizeValue(action.error)}</p>)}
      {localizeValue(
        action.message && (
          <p role="status" className={s.note}>
            {localizeValue(action.message)}
          </p>
        ),
      )}
    </Card>
  );
}

function facilityEffect(part: FacilityPart, level: number) {
  if (part === 'stadium')
    return sourceMessage('copy.ClubOperations.e718a2e7a8', {
      p0: number(STADIUM_STEPS[level].capacity),
    });
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return sourceMessage('copy.FacilityParts.22f747ccff', {
      p0: terms.growth,
      p1: terms.recoveryBonus,
      p2: terms.goodwill,
    });
  }
  const effect = ACADEMY_FACILITY[level];
  return sourceMessage('copy.InvestmentView.87c8b2640a', {
    p0: effect.intake,
    p1: effect.potential,
    p2: effect.growth,
  });
}

function facilityBenefits(
  part: FacilityPart,
  level: number,
): readonly (readonly [string, string])[] {
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return [
      [sourceMessage('copy.InvestmentTotals.f5d5d839bb'), `×${terms.growth}`],
      [sourceMessage('copy.InvestmentTotals.2aa2ff71ea'), `+${terms.recoveryBonus}`],
      [sourceMessage('copy.InvestmentTotals.4d46fe50b9'), `+${terms.goodwill}%`],
    ];
  }
  if (part === 'academy') {
    const terms = ACADEMY_FACILITY[level];
    return [
      [sourceMessage('copy.InvestmentTotals.f695772131'), `×${terms.growth}`],
      [
        sourceMessage('copy.InvestmentView.45b26f37cf'),
        sourceMessage('copy.InvestmentView.81485f02e2', { p0: terms.intake }),
      ],
      [sourceMessage('copy.ClubSettingControl.8b55b3cb94'), `+${terms.potential}`],
    ];
  }
  return [
    [
      sourceMessage('copy.InvestmentView.57d5273aac'),
      sourceMessage('copy.ClubOperations.e718a2e7a8', {
        p0: number(STADIUM_STEPS[level].capacity),
      }),
    ],
  ];
}

function facilityUpgradeTitle(part: FacilityPart, expansion: boolean) {
  if (part === 'stadium')
    return expansion
      ? sourceMessage('copy.InvestmentView.6a917c7c3d')
      : sourceMessage('copy.InvestmentView.b9b72199fd');
  return sourceMessage('copy.InvestmentView.9ac1f3f25a', { p0: FACILITY_PART_LABEL[part] });
}

function FacilitySnapshot({
  w,
  part,
  level,
  maintenance,
  future = false,
}: {
  w: World;
  part: FacilityPart;
  level: number;
  maintenance: string;
  future?: boolean;
}) {
  useTextLocale();
  const scene = {
    ...w,
    ...(part === 'training'
      ? { trainingGround: level }
      : part === 'academy'
        ? { academyFacility: level }
        : { stadium: level }),
  };
  return (
    <Card
      surface="detail"
      title={localizeValue(
        future
          ? sourceMessage('copy.InvestmentView.5c31b4aa99')
          : sourceMessage('copy.InvestmentView.72d2bae2a7'),
      )}
      className={s.facilitySnapshot}
      data-future={future || undefined}
      aria-label={localizeValue(
        `${future ? sourceMessage('copy.InvestmentView.5c31b4aa99') : sourceMessage('copy.InvestmentView.72d2bae2a7')} ${FACILITY_PART_LABEL[part]}`,
      )}
    >
      <div className={s.compareScene}>
        <FacilityArt
          kind={part}
          world={scene}
          view={part === 'stadium' ? 'exterior' : undefined}
          className={s.art}
          eager
        />
        <div className={s.overlay}>
          {localizeValue(
            part === 'stadium' && <small>{localizeValue(STADIUM_STEPS[level].name)}</small>,
          )}
          <b>{richMessage('copy.InvestmentView.5186c5563f', { p0: level, p1: partTop(part) })}</b>
        </div>
      </div>
      <dl className={s.benefitFacts}>
        {localizeValue(
          facilityBenefits(part, level).map(([label, value]) => (
            <div key={label}>
              <dt>{localizeValue(label)}</dt>
              <dd>{localizeValue(value)}</dd>
            </div>
          )),
        )}
      </dl>
      <div className={s.maintenance}>
        <span>{richMessage('copy.InvestmentTotals.7993f638ba')}</span>
        <b>
          <Amount w={w} value={maintenance} plain />
        </b>
      </div>
    </Card>
  );
}

function FacilityUpgrade({
  w,
  client,
  part,
  office,
}: {
  w: World;
  client: GameClient;
  part: FacilityPart;
  office: OfficeRead;
}) {
  useTextLocale();
  const level = partLevel(w, part);
  const preview = office.facilities[part];
  const running = facilityWork(w, part);
  const next = preview.next;
  const action = useInvestmentAction(client);
  const [quote, setQuote] = useState<{
    from: number;
    to: number;
    cost: string;
    days: number;
    maintenanceBefore: string;
    maintenanceAfter: string;
    cashBefore: string;
    cashAfter: string;
    capacityDuring: number;
    expansion: boolean;
  }>();
  const label = FACILITY_PART_LABEL[part];
  return (
    <Card
      surface="sheet"
      title={localizeValue(label)}
      meta={sourceMessage('copy.InvestmentView.f6ce82d21d')}
      className={s.panel}
      id={`investment-facility-${part}`}
    >
      <div className={s.facilityScene}>
        <FacilityArt
          kind={part}
          world={w}
          view={part === 'stadium' ? 'exterior' : undefined}
          className={s.art}
          eager
        />
        <div className={`${s.overlay} ${s.facilityCaption}`}>
          <b>{richMessage('copy.InvestmentView.5186c5563f', { p0: level, p1: partTop(part) })}</b>
          <p>{localizeValue(facilityEffect(part, level))}</p>
        </div>
      </div>
      {localizeValue(
        running ? (
          <div className={s.selection} data-surface="inset" role="status">
            <b>
              {richMessage('copy.InvestmentView.5619d2ed25', { p0: running.to, p1: running.left })}
            </b>
            <progress
              max={running.days}
              value={running.days - running.left}
              aria-label={displayMessage('copy.InvestmentView.4cf5e9130e', { p0: label })}
            />
            <p>
              {richMessage('copy.InvestmentView.8962810e09', {
                p0: facilityEffect(part, running.to),
              })}
            </p>
          </div>
        ) : next ? (
          <>
            <div className={s.facilityAction}>
              <button
                type="button"
                data-ui="primary"
                disabled={action.blocked || !preview.affordable || !preview.eligible}
                onClick={() =>
                  setQuote({
                    from: level,
                    to: next.to,
                    cost: next.cost,
                    days: next.days,
                    maintenanceBefore: preview.partMaintenanceBefore,
                    maintenanceAfter: preview.partMaintenanceAfter,
                    cashBefore: w.cash,
                    cashAfter: preview.cashAfter,
                    capacityDuring: preview.capacityDuring,
                    expansion: next.kind === 'expansion',
                  })
                }
              >
                {localizeValue(
                  part === 'stadium'
                    ? sourceMessage('copy.InvestmentView.50ab8a9c19', {
                        p0: facilityUpgradeTitle(part, next.kind === 'expansion'),
                      })
                    : sourceMessage('copy.InvestmentView.89e6fab330', { p0: label, p1: next.to }),
                )}
              </button>
              {localizeValue(
                !preview.affordable && (
                  <p className={s.note}>{richMessage('copy.InvestmentView.59cd37be3b')}</p>
                ),
              )}
            </div>
          </>
        ) : (
          <p className={s.note}>{richMessage('copy.InvestmentView.c36d1bbda5')}</p>
        ),
      )}
      {localizeValue(action.error && !quote && <p role="alert">{localizeValue(action.error)}</p>)}
      {localizeValue(
        quote && (
          <Dialog
            label={displayMessage('copy.InvestmentView.8383739d64', {
              p0: facilityUpgradeTitle(part, quote.expansion),
              p1: quote.days,
            })}
            wide
            onClose={() => {
              if (!action.busy) setQuote(undefined);
            }}
            summary={
              <dl className={s.upgradeFinances}>
                <div>
                  <dt>{richMessage('copy.InvestmentView.8195d755b6')}</dt>
                  <dd>
                    <b>
                      <Amount w={w} value={quote.cost} plain />
                    </b>
                  </dd>
                </div>
                <div>
                  <dt>{richMessage('copy.InvestmentView.5f3f7a7be9')}</dt>
                  <dd className={s.balanceChange}>
                    <span className={s.previousMoney}>
                      <Amount w={w} value={quote.cashBefore} plain />
                    </span>
                    <span aria-hidden="true">→</span>
                    <b>
                      <Amount w={w} value={quote.cashAfter} plain />
                    </b>
                  </dd>
                </div>
              </dl>
            }
            actions={
              <div className={s.dialogActions}>
                <button type="button" disabled={action.busy} onClick={() => setQuote(undefined)}>
                  {richMessage('common.cancel')}
                </button>
                <button
                  type="button"
                  data-ui="primary"
                  disabled={action.blocked}
                  onClick={async () => {
                    if (
                      await action.apply(
                        { type: 'facility-upgrade', part, from: quote.from, cost: quote.cost },
                        sourceMessage('copy.InvestmentView.05b58d46d5'),
                      )
                    )
                      setQuote(undefined);
                  }}
                >
                  {localizeValue(
                    action.busy
                      ? sourceMessage('copy.InvestmentView.b3e37d48d2')
                      : sourceMessage('copy.InvestmentView.625fb343b0'),
                  )}
                </button>
              </div>
            }
          >
            <div className={s.upgradeComparison}>
              <FacilitySnapshot
                w={w}
                part={part}
                level={quote.from}
                maintenance={quote.maintenanceBefore}
              />
              <span className={s.comparisonArrow} aria-hidden="true">
                →
              </span>
              <FacilitySnapshot
                w={w}
                part={part}
                level={quote.to}
                maintenance={quote.maintenanceAfter}
                future
              />
            </div>
            <div className={s.upgradeNotes}>
              {localizeValue(
                quote.expansion && (
                  <p>
                    {richMessage('copy.InvestmentView.a52fe9a32c', {
                      p0: number(quote.capacityDuring),
                    })}
                  </p>
                ),
              )}
              <p>{richMessage('copy.InvestmentView.f393fd1495')}</p>
              {localizeValue(
                part === 'training' && <p>{richMessage('copy.InvestmentView.bba1582516')}</p>,
              )}
            </div>
            {localizeValue(action.error && <p role="alert">{localizeValue(action.error)}</p>)}
          </Dialog>
        ),
      )}
    </Card>
  );
}

function CoachingInvestment({ w, office }: { w: World; office: OfficeRead }) {
  useTextLocale();
  const count = STAFF_ROLES.filter((post) => staffMember(w, post)).length;
  return (
    <>
      <Card
        surface="sheet"
        title={displayMessage('copy.InvestmentView.3c901b69a8', {
          p0: count,
          p1: STAFF_ROLES.length,
        })}
        className={s.panel}
      >
        <DeskStats
          label={displayMessage('copy.InvestmentView.b72edcb499')}
          stats={[
            {
              label: sourceMessage('copy.InvestmentTotals.5bbadf590b'),
              value: <Amount w={w} value={office.costs.staffWages} />,
            },
            {
              label: sourceMessage('team.vacant'),
              value: sourceMessage('copy.ClubOperations.df32dea4ca', {
                p0: STAFF_ROLES.length - count,
              }),
            },
          ]}
        />
        <dl className={s.staff}>
          {localizeValue(
            STAFF_ROLES.map((post) => {
              const member = staffMember(w, post);
              return (
                <div key={post}>
                  <dt>{localizeValue(STAFF_INFO[post].label)}</dt>
                  <dd>
                    {localizeValue(
                      member ? (
                        <>
                          {member.name}{' '}
                          <small>
                            {richMessage('copy.InvestmentView.7071838530', {
                              p0: localizeValue(member.ability),
                            })}
                          </small>
                        </>
                      ) : (
                        sourceMessage('team.vacant')
                      ),
                    )}
                  </dd>
                </div>
              );
            }),
          )}
        </dl>
      </Card>
    </>
  );
}

function InvestmentDetails({
  area,
  state,
  client,
}: {
  area: InvestmentArea;
  state: ClientState;
  client: GameClient;
}) {
  useTextLocale();
  const w = state.view!.world;
  const blocked = useGameState(gameActionsBlocked);
  const office = useOfficeRead(w);
  if (!office) return <p role="status">{richMessage('copy.InvestmentView.d6008342de')}</p>;
  const directions: readonly DirectionKey[] = AREA_DIRECTIONS[area];
  return (
    <>
      {localizeValue(
        AREA_DELEGATIONS[area].map((key) => (
          <DelegationNote key={key} w={w} responsibility={key} />
        )),
      )}
      {localizeValue(area === 'youth' && <YouthCoach w={w} office={office} />)}
      {localizeValue(
        area === 'finance' && (
          <Card surface="sheet" className={s.panel}>
            <ClubBudget w={w} titled={false} />
          </Card>
        ),
      )}
      {localizeValue(
        PASSIVE_POLICIES[area].map((key) => (
          <BudgetSetting key={key} w={w} client={client} policyKey={key} office={office} />
        )),
      )}
      {localizeValue(
        directions.length > 0 && (
          <Card
            surface="sheet"
            title={displayMessage('delegation.rules.title')}
            meta={displayMessage('delegation.rules.meta')}
            className={s.panel}
          >
            {localizeValue(
              directions.map((key) => (
                <DirectionSetting key={key} w={w} client={client} directionKey={key} />
              )),
            )}
          </Card>
        ),
      )}
      {localizeValue(
        PASSIVE_BUILDS[area].map((slot) => (
          <Card
            key={slot}
            surface="sheet"
            title={displayMessage('copy.InvestmentView.2155a52da0')}
            className={s.panel}
          >
            <BuildSetting w={w} client={client} slot={slot} />
          </Card>
        )),
      )}
      {localizeValue(
        area === 'firstTeam' && (
          <FacilityUpgrade w={w} client={client} part="training" office={office} />
        ),
      )}
      {localizeValue(
        area === 'youth' && (
          <FacilityUpgrade w={w} client={client} part="academy" office={office} />
        ),
      )}
      {localizeValue(
        area === 'stadium' && (
          <>
            <Card
              surface="sheet"
              title={displayMessage('copy.InvestmentView.e2b01b5f19')}
              className={s.panel}
            >
              <TicketSetting w={w} client={client} />
            </Card>
            <FacilityUpgrade w={w} client={client} part="stadium" office={office} />
          </>
        ),
      )}
      {localizeValue(area === 'coaches' && <CoachingInvestment w={w} office={office} />)}
      {localizeValue(
        area === 'finance' && <BusinessWorkbench state={state} client={client} part="finance" />,
      )}
      {localizeValue(
        area === 'identity' && (
          <>
            <BusinessWorkbench state={state} client={client} part="identity" />
            <Card
              surface="sheet"
              title={displayMessage('copy.InvestmentView.33dc0d2f31')}
              className={s.panel}
            >
              <FixtureKitSelector client={client} blocked={blocked} />
            </Card>
          </>
        ),
      )}
    </>
  );
}

export function InvestmentView({ state, client }: { state: ClientState; client: GameClient }) {
  useTextLocale();
  const w = state.view!.world;
  const [view] = useAddressTab('view', OPERATIONS_VIEWS, 'investment', {
    world: w.id,
    key: 'club-operations',
    path: '/club-operations',
    keepFirst: true,
  });
  const [area] = useAddressTab('area', INVESTMENT_PAGES, 'overview', {
    world: w.id,
    key: 'investment-area',
    path: operationsAddress('investment'),
  });
  const selected = INVESTMENT_AREAS.find((item) => item.id === area);
  const request = useFacilityRequest((store) => store.request);
  useEffect(() => {
    if (!request || !selected) return;
    useFacilityRequest.getState().take();
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`investment-facility-${request}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [request, selected]);
  // A factor the office opened (→WEB-116): its control comes into view and marks itself once.
  const control = useControlRequest((store) => store.request);
  useEffect(() => {
    if (!control || !selected) return;
    const frame = requestAnimationFrame(() => {
      useControlRequest.getState().take();
      const element =
        document.getElementById(control) ??
        document.querySelector(`[data-control="${CSS.escape(control)}"]`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.setAttribute('data-control-focus', '');
      element.addEventListener(
        'animationend',
        () => element.removeAttribute('data-control-focus'),
        {
          once: true,
        },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [control, selected]);
  // A detour from another task (a facility opened from its people page) names its way back (→WEB-74).
  if (view !== 'investment')
    return (
      <div className={s.page}>
        <TaskReturn />
        <BusinessWorkbench state={state} client={client} part={view} />
      </div>
    );
  return (
    <section
      className={s.page}
      aria-label={localizeValue(
        selected
          ? sourceMessage('copy.InvestmentView.3c4ac6460f', { p0: selected.title })
          : sourceMessage('copy.catalog.9a8019d09c'),
      )}
    >
      <TaskReturn />
      {localizeValue(
        selected ? (
          <>
            <header className={s.title}>
              <h2>{localizeValue(selected.title)}</h2>
              <p>{localizeValue(selected.description)}</p>
            </header>
            <InvestmentTotals w={w} area={selected.id} />
            {localizeValue(
              selected.id !== 'firstTeam' &&
                selected.id !== 'youth' &&
                selected.id !== 'stadium' && (
                  <div className={s.hero}>
                    <FacilityArt kind={selected.art} world={w} className={s.art} eager />
                    <div className={s.overlay}>
                      <b>{localizeValue(selected.title)}</b>
                    </div>
                  </div>
                ),
            )}
            <div className={s.details} key={`${w.id}:${selected.id}`}>
              <InvestmentDetails area={selected.id} state={state} client={client} />
            </div>
          </>
        ) : (
          <>
            <header className={s.title}>
              <h2>{richMessage('copy.catalog.9a8019d09c')}</h2>
              <p>{displayMessage('office.effects.lead')}</p>
            </header>
            <OfficeEffects w={w} />
          </>
        ),
      )}
    </section>
  );
}
