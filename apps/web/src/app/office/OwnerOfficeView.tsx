import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ResponsibilityKey } from '../../../../../packages/contracts/src/types';
import {
  RESPONSIBILITY_KEYS,
  settingsOf,
} from '../../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../../runtime/client';
import { useGameState } from '../../runtime/store';
import {
  AWAY_LIMITS,
  useProgression,
  type AwayLimit,
  type ProgressionController,
} from '../../runtime/progression';
import { Dialog } from '../../shared/ui/Dialog';
import { Select } from '../../shared/ui/Select';
import { FacilityArt } from '../../entities/office/ui/FacilityArt';
import { AssigneeProfile } from './AssigneeProfile';
import { modeSwitchBlocked } from '../../entities/office/lib/progressMode';
import {
  RESPONSIBILITY_DETAILS as DETAILS,
  RESPONSIBILITY_LABELS,
  responsibilityAssignees,
  type ResponsibilityPost,
} from '../../entities/office/lib/intervention';
import {
  applyOfficeChange,
  officeBulkChange,
  officeProposal,
  type OfficeChange,
  type OfficeProposal,
} from '../../entities/office/lib/officeChanges';
import { delegationCounts } from './officeSummary';
import {
  BuildSetting,
  DecisionFinanceSetting,
  DirectionSetting,
  RecruitmentGuideline,
  WageBudgetSetting,
} from '../../entities/office/ui/ClubSettingControl';
import {
  DECISION_BUILDS,
  DECISION_DIRECTIONS,
  DECISION_POLICIES,
} from '../../entities/office/lib/clubControls';
import { DecisionRuleFacts } from './DecisionRuleFacts';
import s from '../../shared/ui/styles/OwnerOffice.module.css';
const ApprovalWorkbench = lazy(() =>
  import('../../pages/club/ui/Rich').then((module) => ({ default: module.ApprovalWorkbench })),
);
const WORKBENCH_LABELS: Record<ResponsibilityKey, string> = {
  manager: sourceMessage('copy.OwnerOfficeView.ff794c03f8'),
  staff: sourceMessage('copy.OwnerOfficeView.1fcd726524'),
  contracts: sourceMessage('copy.OwnerOfficeView.7daa4792b6'),
  recruitment: sourceMessage('copy.OwnerOfficeView.76bf376002'),
  sales: sourceMessage('copy.OwnerOfficeView.2f5473eaf9'),
  academy: sourceMessage('copy.OwnerOfficeView.dc639eb0dc'),
  sponsors: sourceMessage('copy.OwnerOfficeView.cfada40360'),
};
const OBSERVATIONS = [
  [
    'matchEve',
    sourceMessage('copy.OwnerOfficeView.281583de02'),
    sourceMessage('copy.OwnerOfficeView.bd4986f13a'),
  ],
  [
    'windowOpen',
    sourceMessage('copy.OwnerOfficeView.d7995e9f8e'),
    sourceMessage('copy.OwnerOfficeView.8793f332bd'),
  ],
] as const;
export function OfficeRow({
  label,
  detail,
  delegated,
  blocked,
  onSelect,
  observation = false,
  assignee,
}: {
  label: string;
  detail: string;
  delegated: boolean;
  blocked: boolean;
  onSelect: (delegated: boolean) => void;
  observation?: boolean;
  assignee?: ReactNode;
}) {
  useTextLocale();
  return (
    <div className={`${s.row} ${s.responsibilityRow}`}>
      <span>
        <b>{localizeValue(label)}</b>
        <small>{localizeValue(detail)}</small>
      </span>
      <div className={s.rowControls}>
        {localizeValue(
          assignee && (
            <div
              className={s.assignee}
              aria-label={displayMessage('copy.ApprovalQueue.1d27c18bbd')}
            >
              {localizeValue(assignee)}
            </div>
          ),
        )}
        <div className={s.choices} role="group" aria-label={localizeValue(label)} data-ui="choices">
          {localizeValue(
            ([false, true] as const).map((value) => (
              <button
                key={String(value)}
                data-ui={delegated === value ? 'secondary' : undefined}
                aria-pressed={delegated === value}
                disabled={blocked}
                onClick={() => {
                  if (delegated !== value) onSelect(value);
                }}
              >
                {localizeValue(
                  observation
                    ? value
                      ? sourceMessage('copy.ApprovalQueue.e4b0c79fac')
                      : sourceMessage('copy.OwnerOfficeView.1febc223bb')
                    : value
                      ? sourceMessage('copy.ControllerBackgrounds.ca7eb2ef0a')
                      : sourceMessage('copy.ApprovalQueue.20c483bdda'),
                )}
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
export function PendingHandover({ proposal }: { proposal: OfficeProposal }) {
  useTextLocale();
  if (!proposal.pending.length) return null;
  return (
    <section className={s.preview} aria-label={displayMessage('copy.OwnerOfficeView.5c967dce5a')}>
      <h3>{richMessage('copy.OwnerOfficeView.39cc3c0774')}</h3>
      <ul>
        {localizeValue(
          proposal.pending.map((item) => (
            <li key={item.key}>
              {localizeValue(
                item.count > 0 && (
                  <>
                    {richMessage('copy.OwnerOfficeView.21aab38c4f', {
                      p0: RESPONSIBILITY_LABELS[item.key],
                      p1: item.count,
                      p2: ' ',
                      p3:
                        item.to === 'delegated'
                          ? sourceMessage('copy.OwnerOfficeView.e0becc4639')
                          : sourceMessage('copy.OwnerOfficeView.ae39dc2655'),
                    })}
                  </>
                ),
              )}
              {localizeValue(
                (item.held ?? 0) > 0 && (
                  <>{richMessage('copy.OwnerOfficeView.01e9d1412f', { p0: item.held })}</>
                ),
              )}
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
export function OwnerOffice({
  client,
  controller,
  scope,
  focus,
}: {
  client: GameClient;
  controller: ProgressionController;
  scope?: readonly ResponsibilityKey[];
  focus?: ResponsibilityKey | 'finance';
}) {
  useTextLocale();
  const state = useGameState((state) => state),
    w = state.view!.world,
    settings = settingsOf(w);
  const background = useProgression(controller, (state) => state.background);
  const [proposal, setProposal] = useState<OfficeProposal>();
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [assigneePost, setAssigneePost] = useState<ResponsibilityPost>();
  const [workbench, setWorkbench] = useState<ResponsibilityKey>();
  const inFlight = useRef(false);
  const blocked = modeSwitchBlocked(state) || applying;
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`office-decision-${focus === 'finance' ? 'recruitment' : focus}`)
        ?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focus, w.id]);
  const propose = (change: OfficeChange) => {
    if (blocked) return;
    setMessage('');
    setProposal(officeProposal(w, change));
  };
  const apply = async (next: OfficeProposal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setApplying(true);
    setMessage('');
    try {
      await applyOfficeChange(client, controller, next);
      setProposal(undefined);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : sourceMessage('copy.ApprovalQueue.def8fed41f'),
      );
    } finally {
      inFlight.current = false;
      setApplying(false);
    }
  };
  const close = () => {
    if (!inFlight.current) {
      setProposal(undefined);
      setMessage('');
    }
  };
  const keys = proposal
    ? RESPONSIBILITY_KEYS.filter((key) => proposal.change.responsibilities?.[key] !== undefined)
    : [];
  const observations = proposal
    ? OBSERVATIONS.filter(([key]) => proposal.change.observations?.[key] !== undefined)
    : [];
  const delegated =
    proposal &&
    (keys.length > 0
      ? proposal.change.responsibilities?.[keys[0]] === 'delegated'
      : observations.length > 0 && proposal.change.observations?.[observations[0][0]] === false);
  const title = delegated
    ? sourceMessage('copy.OwnerOfficeView.9a4efaffe0')
    : sourceMessage('copy.ApprovalQueue.33dbc38b17');
  const { delegated: delegatedCount, total: totalCount } = delegationCounts(w);
  return (
    <div className={s.office} data-testid={scope ? 'desk-responsibilities' : 'owner-office'}>
      {localizeValue(
        !scope && (
          <div
            className={s.bulkActions}
            role="group"
            aria-label={displayMessage('copy.OwnerOfficeView.d214358c34')}
            data-ui="choices"
          >
            {localizeValue(
              (['direct', 'delegated'] as const).map((value) => (
                <button
                  key={value}
                  data-ui={
                    (value === 'delegated' ? delegatedCount === totalCount : delegatedCount === 0)
                      ? 'secondary'
                      : undefined
                  }
                  aria-pressed={
                    value === 'delegated' ? delegatedCount === totalCount : delegatedCount === 0
                  }
                  disabled={blocked}
                  onClick={() => {
                    const change = officeBulkChange(w, value);
                    if (change) propose(change);
                  }}
                >
                  {localizeValue(
                    value === 'delegated'
                      ? sourceMessage('copy.OwnerOfficeView.7140de83b3')
                      : sourceMessage('copy.ApprovalQueue.0878910c76'),
                  )}
                </button>
              )),
            )}
          </div>
        ),
      )}
      {localizeValue(!scope && <FacilityArt kind="manager" world={w} className={s.hero} eager />)}
      {localizeValue(
        state.readonly && (
          <p className={s.message}>{richMessage('copy.OwnerOfficeView.c6b3435977')}</p>
        ),
      )}
      {localizeValue(
        message && !proposal && (
          <p role="alert" className={s.message}>
            {localizeValue(message)}
          </p>
        ),
      )}
      <section
        data-surface="panel"
        className={s.section}
        aria-label={displayMessage('copy.OwnerOfficeView.2760beeb88')}
      >
        <div className={s.sectionHead}>
          <h3>{richMessage('copy.OwnerOfficeView.ea69dde801')}</h3>
          <small>
            {richMessage('copy.OwnerOfficeView.3aef7bc1a8', {
              p0: scope
                ? scope.filter((key) => settings.responsibilities[key] === 'delegated').length
                : delegatedCount,
              p1: ' ',
              p2: scope?.length ?? totalCount,
            })}
          </small>
        </div>
        <p>{richMessage('copy.OwnerOfficeView.674aa7fd09')}</p>
        <div className={s.rows}>
          {localizeValue(
            !scope &&
              OBSERVATIONS.map(([key, label, detail]) => (
                <OfficeRow
                  key={key}
                  observation
                  label={localizeValue(label)}
                  detail={detail}
                  delegated={!settings.observations[key]}
                  blocked={blocked}
                  onSelect={(delegated) => propose({ observations: { [key]: !delegated } })}
                />
              )),
          )}
          {localizeValue(
            (scope ?? RESPONSIBILITY_KEYS).map((key) => (
              <article
                key={key}
                id={`office-decision-${key}`}
                className={s.responsibility}
                data-surface="inset"
                aria-label={displayMessage('copy.OwnerOfficeView.27ab9d77e9', {
                  p0: RESPONSIBILITY_LABELS[key],
                })}
              >
                <OfficeRow
                  label={localizeValue(RESPONSIBILITY_LABELS[key])}
                  detail={DETAILS[key]}
                  assignee={responsibilityAssignees(w, key).map(({ post, label }) => (
                    <button
                      key={post}
                      type="button"
                      data-ui="link"
                      aria-haspopup="dialog"
                      aria-label={displayMessage('copy.OwnerOfficeView.60ee64b3c8', { p0: label })}
                      onClick={(event) => {
                        event.currentTarget.focus();
                        setAssigneePost(post);
                      }}
                    >
                      {localizeValue(label)}
                    </button>
                  ))}
                  delegated={settings.responsibilities[key] === 'delegated'}
                  blocked={blocked}
                  onSelect={(delegated) =>
                    propose({ responsibilities: { [key]: delegated ? 'delegated' : 'direct' } })
                  }
                />
                <div className={s.guidelines}>
                  {localizeValue(
                    DECISION_POLICIES[key].map(
                      (policy) =>
                        policy === 'recruitment' && (
                          <RecruitmentGuideline key={policy} w={w} client={client} />
                        ),
                    ),
                  )}
                  {localizeValue(
                    DECISION_DIRECTIONS[key].map((direction) => (
                      <DirectionSetting
                        key={direction}
                        w={w}
                        client={client}
                        directionKey={direction}
                      />
                    )),
                  )}
                  {localizeValue(
                    DECISION_BUILDS[key].map((slot) => (
                      <BuildSetting key={slot} w={w} client={client} slot={slot} />
                    )),
                  )}
                  {localizeValue(
                    key !== 'sales' && key !== 'sponsors' && (
                      <WageBudgetSetting w={w} client={client} responsibility={key} />
                    ),
                  )}
                  {localizeValue(
                    key !== 'sponsors' && (
                      <DecisionFinanceSetting w={w} client={client} responsibility={key} />
                    ),
                  )}
                  <DecisionRuleFacts w={w} responsibility={key} />
                  <button
                    type="button"
                    data-ui="secondary"
                    className={s.workbenchButton}
                    aria-haspopup="dialog"
                    onClick={() => setWorkbench(key)}
                  >
                    {richMessage('copy.stories.a779e41652', { p0: WORKBENCH_LABELS[key] })}
                  </button>
                </div>
              </article>
            )),
          )}
        </div>
      </section>
      {localizeValue(
        workbench && (
          <Dialog
            label={localizeValue(WORKBENCH_LABELS[workbench])}
            wide
            onClose={() => setWorkbench(undefined)}
          >
            <Suspense
              fallback={<p role="status">{richMessage('copy.OwnerOfficeView.d82fac75b0')}</p>}
            >
              <ApprovalWorkbench
                state={state}
                client={client}
                controller={controller}
                responsibility={workbench}
              />
            </Suspense>
          </Dialog>
        ),
      )}
      {localizeValue(
        !scope && settings.mode === 'automatic' && (
          <section
            data-surface="panel"
            className={s.section}
            aria-label={displayMessage('copy.OwnerOfficeView.0b17ee2b4f')}
          >
            <label className={s.check}>
              {richMessage('copy.OwnerOfficeView.2576957358', {
                p0: (
                  <input
                    type="checkbox"
                    checked={background.resultNotice}
                    disabled={blocked}
                    onChange={(event) =>
                      controller.setBackground({ resultNotice: event.target.checked })
                    }
                  />
                ),
              })}
            </label>
          </section>
        ),
      )}
      {localizeValue(
        !scope && settings.mode === 'automatic' && (
          <section
            data-surface="panel"
            className={s.section}
            aria-label={displayMessage('copy.OwnerOfficeView.80f971650a')}
          >
            <h3>{richMessage('copy.AwaySummary.5cb298a46d')}</h3>
            <label className={s.check}>
              {richMessage('copy.OwnerOfficeView.7578f9d7cc', {
                p0: (
                  <input
                    type="checkbox"
                    checked={background.hidden}
                    disabled={blocked}
                    onChange={(event) => controller.setBackground({ hidden: event.target.checked })}
                  />
                ),
              })}
            </label>
            <label className={s.row}>
              <b>{richMessage('copy.OwnerOfficeView.996d14a015')}</b>
              <Select
                aria-label={displayMessage('copy.OwnerOfficeView.8d7d7184d2')}
                disabled={blocked}
                value={background.away}
                onValueChange={(value) => controller.setBackground({ away: value as AwayLimit })}
              >
                {localizeValue(
                  Object.entries(AWAY_LIMITS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {localizeValue(label)}
                    </option>
                  )),
                )}
              </Select>
            </label>
          </section>
        ),
      )}
      {localizeValue(
        assigneePost && (
          <AssigneeProfile
            w={w}
            post={assigneePost}
            client={client}
            onClose={() => setAssigneePost(undefined)}
          />
        ),
      )}
      {localizeValue(
        proposal && (
          <Dialog
            label={localizeValue(title)}
            onClose={close}
            actions={
              <div className={s.actions}>
                <button disabled={applying} onClick={close}>
                  {richMessage('common.cancel')}
                </button>
                <button
                  data-ui="primary"
                  disabled={blocked || w.id !== proposal.id}
                  onClick={() => void apply(proposal)}
                >
                  {localizeValue(
                    delegated
                      ? sourceMessage('copy.OwnerOfficeView.1c0244d4e4')
                      : sourceMessage('copy.ApprovalQueue.2157d80d03'),
                  )}
                </button>
              </div>
            }
          >
            <div className={s.confirmation} aria-busy={applying}>
              <FacilityArt
                kind={delegated ? 'staff' : 'manager'}
                world={w}
                className={s.hero}
                eager
              />
              <p>
                {localizeValue(
                  [
                    ...observations.map(([, label]) => label),
                    ...keys.map((key) => RESPONSIBILITY_LABELS[key]),
                  ].join(' · '),
                )}
              </p>
              <strong>
                {localizeValue(
                  delegated
                    ? sourceMessage('copy.OwnerOfficeView.4c91111c2d')
                    : sourceMessage('copy.OwnerOfficeView.75dfb5ad23'),
                )}
              </strong>
              <ul>
                {localizeValue(
                  observations.map(([key, label, detail]) => (
                    <li key={key}>
                      {localizeValue(label)}:{' '}
                      {localizeValue(
                        delegated ? detail : sourceMessage('copy.OwnerOfficeView.72d0e7aafc'),
                      )}
                    </li>
                  )),
                )}
                {localizeValue(keys.map((key) => <li key={key}>{localizeValue(DETAILS[key])}</li>))}
              </ul>
              <p>
                {localizeValue(
                  delegated
                    ? sourceMessage('copy.OwnerOfficeView.263b958bf3')
                    : sourceMessage('copy.OwnerOfficeView.21dd03a4d5'),
                )}
              </p>
              <PendingHandover proposal={proposal} />
              {localizeValue(
                message && (
                  <p role="alert" className={s.message}>
                    {localizeValue(message)}
                  </p>
                ),
              )}
            </div>
          </Dialog>
        ),
      )}
    </div>
  );
}
