import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { DirectionAreas } from './DirectionFacts';
import { PersonnelHub } from './PersonnelHubs';
import { TeamDirectory, TeamReturn } from './TeamDirectory';
import { StaffRoleBadge } from './StaffRoleBadge';
import { FacilityOverview } from './FacilityOverview';
import { approvalRequests, type ProgressionController } from '../../../runtime/progression';
import { squadRegistration } from '../../../entities/player/lib/squadRegistration';
import { PersonCareerLink } from '../../../features/person-career/ui/PersonCareer';
import { useTaskState } from '../../../shared/routing/taskMemory';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { lazy, Suspense, useEffect, useState } from 'react';
import type {
  ContractTalk,
  ContractTerm,
  ManagerTrait,
  Player,
  ResponsibilityKey,
  TalkTerm,
  TransferStance,
  World,
} from '../../../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import {
  injuryDaysLeft,
  overall,
  UNHAPPY_PENALTY,
} from '../../../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import {
  agentOf,
  agentPremium,
  clausesLabel,
  marketWage,
  TALK_LABEL,
  TALK_TERMS,
  talkFor,
  talkRoundChance,
  talkUntil,
  talkWindow,
  termLabel,
  UNHAPPY_CONFIG,
  UNHAPPY_REASON,
} from '../../../../../../packages/engine/src/contracts';
import { ballonDorPremiumLine } from '../../../entities/player/lib/ballonDorText';
import { operatingCosts } from '../../../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../../../packages/engine/src/investment';
import { UNHAPPY_MORALE } from '../../../../../../packages/engine/src/morale';
import { ratio } from '../../../../../../packages/engine/src/primitives';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import type { ClientState, GameClient } from '../../../runtime/client';
import { Panel } from '../../../app/ui/App';
import { RecruitmentDesk } from './RecruitmentDesk';
import { OperationsView } from './Operations';
import { InvestmentView } from './InvestmentView';
import { BusinessWorkbench } from './BusinessWorkbench';
import { ApprovalQueue } from './ApprovalQueue';
import { EventCard } from '../../../widgets/event-center/ui/EventCenter';
import { MediationReview } from './MediationReview';
import { PlayingCoachReview } from './PlayingCoachReview';
import type { ApprovalRequest } from '../../../shared/routing/eventRouting';
import { STAFF_ROLES } from '../../../../../../packages/engine/src/staff-info';
import {
  expectedOfferDays,
  LISTED_OFFER,
  playerValue,
  saleBar,
  STANCE_INFO,
  TRANSFER_STANCES,
  transferStance,
  UNTOUCHABLE_BAR,
  UNTOUCHABLE_PRICE,
} from '../../../../../../packages/engine/src/transfers';
import { transferWindow } from '../../../../../../packages/engine/src/transfer-window';
import { buildOf, cardOf } from '../../../../../../packages/engine/src/build';
import { Dialog } from '../../../shared/ui/Dialog';
import { OvrBadge } from '../../../entities/player/ui/OvrBadge';
import { positionsLabel } from '../../../entities/player/ui/FormationPitch';
import {
  DEFAULT_ROSTER_VIEW,
  RosterFilters,
  rosterViewSummary,
  type RosterView,
} from './RosterFilters';
import {
  useBusinessView,
  APPROVAL_INBOX_OPEN,
  APPROVAL_DIALOG_REQUEST,
  useContractTalk,
  returnApprovalHome,
  type Page,
  type PeopleTab,
} from '../../../shared/routing/state';
import {
  CoachingPlan,
  CoachingStaff,
  ManagerHireTerm,
  ManagerPost,
  ManagerRenewal,
  StaffMarket,
  TalkRulePanel,
} from './ClubStaff';
import { TabList, TabPanel } from '../../../shared/ui/PageTabs';
import { AcademyPanel } from './AcademyPanel';
import { TrainingView } from './TrainingView';
import { WorkResponsibility } from './WorkResponsibility';
import { WORK_RESPONSIBILITIES } from '../../../shared/routing/personnelNavigation';
import management from './ManagementView.module.css';
import { explorePlayers, ofScope, playerStatus } from '../../../entities/player/lib/playerAnalysis';
import { bansOf, banText } from '../../../entities/player/lib/discipline';
import { yellowWarning } from '../../../../../../packages/engine/src/discipline';
import { PlayerLink } from '../../../entities/player';
import { Attributes } from '../../../entities/player/ui/Attributes';
import { StyleCard } from '../../../shared/ui/StyleCard';
import { STYLE_INFO } from '../../../../../../packages/engine/src/styles';
import { MANAGER_TRAIT_INFO } from '../../../../../../packages/engine/src/staff-info';
import {
  managerRenewal,
  defaultManagerTerm,
  managerPayoff,
  managerTermLimit,
} from '../../../../../../packages/engine/src/ops-staff';
import { roundsUntilRefresh } from '../../../../../../packages/engine/src/managerMarket';
import { ClubLink } from '../../../entities/club';
import { runwayText, squadAvailability } from '../../../entities/player/lib/teamState';
import { PlayerComparison } from './PlayerComparison';
import { compactMoney, contractLine, number } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import s from '../../../shared/ui/styles/App.module.css';
type Props = { state: ClientState; client: GameClient };
/**
 * The records room loads on its first visit: its charts, boards and archive tables stay out of
 * the first-play entry bundle (→ARCH-28).
 */
const RecordsRoom = lazy(() =>
  import('./RecordsRoom').then((module) => ({ default: module.RecordsRoom })),
);
/** The manager's youth attribute speeds every young player's growth; the academy is separate. */
const YOUTH_HINT = sourceMessage('copy.Rich.0ece5306ff');
/** "38세", or nothing for someone from an older save without an age. */
function personAge(w: World, born?: number) {
  return born === undefined
    ? ''
    : sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: w.year - born });
}
/** Where a manager's career is heading, for his card (→STAFF-16). */
function growthNote(w: World, m: { ability: number; potential?: number; born?: number }) {
  if (m.potential === undefined || m.born === undefined) return '';
  const age = w.year - m.born;
  if (m.potential > m.ability)
    return sourceMessage('copy.ClubStaff.4719fc8cca', { p0: m.potential - m.ability });
  return age >= 60 ? sourceMessage('copy.Rich.8fd8564eff') : sourceMessage('copy.Rich.248bff31f0');
}
/** A manager's selection habit (→STAFF-12): its label and effect, or that he has none. */
function TraitNote({ trait }: { trait?: ManagerTrait }) {
  useTextLocale();
  if (!trait) return <>{richMessage('copy.Rich.866c28eff9')}</>;
  return (
    <>
      {richMessage('copy.Rich.5e42e2e31e', {
        p0: <b>{localizeValue(MANAGER_TRAIT_INFO[trait].label)}</b>,
        p1: MANAGER_TRAIT_INFO[trait].effect,
      })}
    </>
  );
}
/**
 * Personnel and office screens compose these same action panels; neither copies commands. 1군
 * leads with its roster under the current locker room, then its tactics and locker-room culture;
 * 코치진 leads with the manager under his office and every post's person or vacancy under the
 * coaching workroom, then who appoints them (→WEB-43/72). Each room heads its own people, so
 * neither scene pushes the other's list off a phone's first view. Offers for our players are
 * answered in the market's 이적 협상 (→WEB-71). Each but the market ends with the responsibilities
 * it owns.
 */
function PersonnelPanel({
  tab,
  state,
  client,
  controller,
  onReplace,
}: Props & { tab: PeopleTab; controller: ProgressionController; onReplace: () => void }) {
  useTextLocale();
  const w = state.view!.world;
  const work = tab === 'players' || tab === 'market' ? tab : 'coaches';
  const coach = sourceMessage('copy.Rich.2499d3ec89', {
    p0: w.manager.name,
    p1: tacticLabel[w.tactic],
  });
  return (
    <>
      {localizeValue(
        tab === 'players' ? (
          <>
            <FacilityOverview w={w} kind="locker" title={displayMessage('copy.Rich.70a55c30bf')}>
              {localizeValue(coach)}
            </FacilityOverview>
            <Roster state={state} client={client} />
            <DirectionAreas w={w} areas={['squad']} />
          </>
        ) : tab === 'market' ? (
          <MarketHub state={state} client={client} />
        ) : (
          <>
            <FacilityOverview w={w} kind="manager" title={displayMessage('facility.manager')}>
              {localizeValue(coach)}
            </FacilityOverview>
            <ManagerCard state={state} client={client} onReplace={onReplace} />
            <FacilityOverview w={w} kind="staff" title={displayMessage('facility.staff')}>
              {richMessage('copy.Rich.c92f106675', { p0: w.staff?.length ?? 0 })}
            </FacilityOverview>
            <CoachingStaff w={w} client={client} />
            <ManagerPost w={w} client={client} />
            <CoachingPlan w={w} />
          </>
        ),
      )}
      {/* The market's responsibility is edited in 결재 설정, not under its list. */}
      {localizeValue(
        tab !== 'market' && (
          <WorkResponsibility
            w={w}
            client={client}
            controller={controller}
            scope={WORK_RESPONSIBILITIES[work]}
          />
        ),
      )}
    </>
  );
}
const MARKET_KINDS = [
  ['players', sourceMessage('team.column.player')],
  ['youth', sourceMessage('team.view.academy')],
  ['coaches', sourceMessage('team.view.coaches')],
  ['manager', sourceMessage('staff.role.manager')],
  ['director', sourceMessage('staff.role.director')],
] as const;
type MarketKind = (typeof MARKET_KINDS)[number][0];
const COACH_ROLES = STAFF_ROLES.filter((role) => role !== 'director');
/**
 * The 이적시장: whom the owner offers to sign, from players to the staff that run them. Each view
 * composes its own authoritative desk — players and youth the world market, coaches and 단장 the
 * staff candidates, 감독 the manager market — so none copies a command.
 */
function MarketHub({ state, client }: Props) {
  useTextLocale();
  const w = state.view!.world;
  const [stored, setKind] = useTaskState<MarketKind>(w.id, 'market-kind', 'players');
  const kind = MARKET_KINDS.some(([id]) => id === stored) ? stored : 'players';
  return (
    <>
      {/* The market's own page tabs (→WEB-69): each kind is a page of the market, not a filter. */}
      <TabList
        tabs={MARKET_KINDS}
        value={kind}
        onChange={setKind}
        label={displayMessage('copy.EventCenter.42bd764e17')}
        idPrefix="market-kind"
      />
      <TabPanel idPrefix="market-kind" value={kind}>
        {localizeValue(
          kind === 'players' || kind === 'youth' ? (
            <RecruitmentDesk key={kind} state={state} client={client} youth={kind === 'youth'} />
          ) : kind === 'manager' ? (
            <ManagerMarket
              state={state}
              client={client}
              onClose={() => setKind('players')}
              inline
            />
          ) : (
            <StaffMarket
              key={kind}
              w={w}
              client={client}
              roles={kind === 'director' ? ['director'] : COACH_ROLES}
            />
          ),
        )}
      </TabPanel>
    </>
  );
}
/** Request hosts compose the same forms used in ordinary personnel work. */
function PersonnelRequest({
  state,
  client,
  request,
  controller,
  error,
}: Props & {
  request: ApprovalRequest;
  controller: ProgressionController;
  error?: string;
}) {
  useTextLocale();
  const w = state.view!.world;
  const item = request.item;
  const blocked = useGameState(gameActionsBlocked);
  const [market, setMarket] = useState(false);
  const cancel = () => returnApprovalHome(request);
  const player = w.players.find((player) => player.id === item.ref);
  const talk = player && item.kind === 'contract-talk' ? talkFor(w, player) : undefined;
  const mediation = w.mediations?.find((record) => record.id === item.ref);
  if (player && talk)
    return (
      <ContractTalkSheet
        w={w}
        player={player}
        talk={talk}
        disabled={blocked}
        error={error}
        onOffer={(term) => {
          void client.command({
            type: 'contract-offer',
            player: player.id,
            wage: talk.floor,
            term,
          });
        }}
        onDecline={() => {
          void client.command({ type: 'contract-decline', player: player.id });
        }}
        onClose={cancel}
      />
    );
  if (mediation)
    return <MediationReview record={mediation} w={w} client={client} onClose={cancel} />;
  if (player && w.playingCoachProposals?.[player.id]?.status === 'pending')
    return <PlayingCoachReview w={w} player={player} client={client} />;
  if (item.kind === 'incoming-bid' || item.kind === 'bid-response')
    return <EventCard client={client} controller={controller} item={item} inDesk />;
  if (item.responsibility === 'academy')
    return <AcademyPanel w={w} client={client} selected={item.ref} />;
  if (item.ref === w.manager.id)
    return (
      <>
        <ManagerCard state={state} client={client} onReplace={() => setMarket(true)} />
        <ManagerPost w={w} client={client} />
        {localizeValue(
          market && (
            <ManagerMarket
              state={state}
              client={client}
              onClose={cancel}
              onCancel={cancel}
              error={error}
            />
          ),
        )}
      </>
    );
  const role =
    w.staff?.find((member) => member.id === item.ref)?.role ??
    STAFF_ROLES.find((role) => role === item.ref);
  return <CoachingStaff w={w} client={client} selected={role} onCancel={cancel} error={error} />;
}
/**
 * The manager at the head of 코치진 (→WEB-43): who he is, what he signed, his school and habits,
 * and the way to replace him — or, with an interim in charge, to appoint one.
 */
function ManagerCard({ state, client, onReplace }: Props & { onReplace: () => void }) {
  useTextLocale();
  const w = state.view!.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!;
  const disabled = useGameState(gameActionsBlocked);
  return (
    <Panel
      title={m.name}
      note={m.interim ? sourceMessage('copy.Rich.af10b7f0e0') : 'FIRST TEAM MANAGER'}
    >
      <div className={s.panelBody} data-testid="manager-card">
        <div className={s.personHead}>
          <OvrBadge
            value={m.ability}
            role={sourceMessage('staff.role.manager')}
            potential={m.potential}
            large
          />
          <div>
            <StaffRoleBadge post="manager" />
            <b>{localizeValue(personAge(w, m.born))}</b>
            {localizeValue(
              m.person && <PersonCareerLink id={m.person} name={m.name} client={client} />,
            )}
            <small>
              {richMessage('copy.Rich.fb0b744a0c', {
                p0: m.since,
                p1: ' ',
                p2: m.interim
                  ? sourceMessage('copy.Rich.ba7691f8a1')
                  : contractLine(m.until, w.year),
                p3: growthNote(w, m),
              })}
            </small>
          </div>
        </div>
        {/* No manager renews himself (→STAFF-14): unrenewed, he leaves at the close. */}
        {localizeValue(
          managerRenewal(w) && (
            <div
              data-surface="inset"
              className={`${s.renewal} ${s.leaving}`}
              data-testid="manager-renewal"
            >
              <ManagerRenewal w={w} client={client} disabled={disabled} />
            </div>
          ),
        )}
        <StyleCard style={m.interim ? undefined : m.style} />
        <p className={s.muted}>
          <TraitNote trait={m.trait} />
        </p>
        <div className={s.actions}>
          {/* Like a coach's 교체, the market opens as a list over the office (→WEB-40). */}
          <button onClick={onReplace}>
            {localizeValue(
              m.interim
                ? sourceMessage('copy.ClubStaff.10451c4909')
                : sourceMessage('copy.LabPage.084c5a6dd7'),
            )}
          </button>
        </div>
        <details data-ui="disclosure" className={management.reference}>
          <summary>{richMessage('copy.Rich.8d0b1b1d85')}</summary>
          <Attributes
            rows={[
              [sourceMessage('copy.Rich.2a6586f5bc'), tacticLabel[m.philosophy]],
              [sourceMessage('copy.Rich.0bef0f2164'), m.youth, YOUTH_HINT],
              [sourceMessage('copy.Rich.48abebf6b2'), m.flexibility],
              [sourceMessage('copy.Rich.0c19a517db'), m.pride],
              [sourceMessage('copy.Rich.817d68fde8'), m.trust],
              [
                sourceMessage('team.column.wage'),
                <Money value={m.wage} code={c.country} year={w.year} />,
              ],
            ]}
          />
        </details>
      </div>
    </Panel>
  );
}
/**
 * The manager market behind 교체 (→STAFF-17, →WEB-40): free agents first, then the best managers
 * of our league and the division above, who cost compensation to their clubs. The list moves every
 * four rounds; hiring confirms on top of it and closes both.
 */
export function ManagerMarket({
  state,
  client,
  onClose,
  onCancel,
  error,
  inline = false,
}: Props & {
  onClose: () => void;
  onCancel?: () => void;
  error?: string;
  /** The 이적시장's 감독 view: the same lists in the page, without a sheet of their own. */
  inline?: boolean;
}) {
  useTextLocale();
  const v = state.view!,
    w = v.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [hiring, setHiring] = useTaskState<string | undefined>(w.id, 'manager-hiring', undefined),
    [term, setTerm] = useTaskState<ContractTerm>(w.id, 'manager-hire-term', 1);
  const disabled = useGameState(gameActionsBlocked);
  const format = (value: bigint | string) => <Money value={value} code={c.country} year={w.year} />;
  // Replacing a contracted manager pays him 25% of his wage per season left; an interim leaves
  // freely.
  const payoff = BigInt(managerPayoff(w));
  const outlay = (candidate: (typeof v.managers)[number]) =>
    BigInt(candidate.fee) +
    BigInt(candidate.compensation ?? '0') +
    BigInt(candidate.coachingRelease ?? '0') +
    payoff;
  const chosen = v.managers.find((candidate) => candidate.id === hiring);
  const free = v.managers.filter(
      (candidate) => candidate.source === 'free' || candidate.source === 'internal',
    ),
    others = v.managers.filter((candidate) => candidate.source === 'club');
  const card = (candidate: (typeof v.managers)[number]) => (
    <article data-surface="panel" className={s.card} key={candidate.id}>
      <div className={s.personHead}>
        <OvrBadge
          value={candidate.ability}
          role={sourceMessage('staff.role.manager')}
          potential={candidate.potential}
          large
        />
        <div>
          <h3>{candidate.name}</h3>
          {localizeValue(
            candidate.person && (
              <PersonCareerLink id={candidate.person} name={candidate.name} client={client} />
            ),
          )}
          <small>
            {localizeValue(personAge(w, candidate.born))}
            {localizeValue(growthNote(w, candidate))}
          </small>
          {localizeValue(
            candidate.club && (
              <small className={s.candidateClub}>
                {richMessage('copy.Rich.dc1e71653d', {
                  p0: <ClubLink w={w} id={candidate.club} />,
                })}
              </small>
            ),
          )}
        </div>
      </div>
      <span className={s.pill}>
        {localizeValue(STYLE_INFO[candidate.style].label)} ·{' '}
        {localizeValue(tacticLabel[candidate.philosophy])}
      </span>
      <StyleCard style={candidate.style} compact />
      <Attributes
        rows={[
          [sourceMessage('copy.Rich.0bef0f2164'), candidate.youth, YOUTH_HINT],
          [sourceMessage('copy.Rich.48abebf6b2'), candidate.flexibility],
          [sourceMessage('copy.Rich.0c19a517db'), candidate.pride],
          [sourceMessage('team.column.wage'), format(candidate.wage)],
        ]}
      />
      <p>
        <TraitNote trait={candidate.trait} />
      </p>
      <p>
        {richMessage('copy.Rich.fdb98897ae', {
          p0:
            managerTermLimit(candidate, w.year) === 1
              ? contractLine(w.year + 1, w.year)
              : sourceMessage('copy.Rich.0265f9f074', {
                  p0: managerTermLimit(candidate, w.year),
                }),
          p1: ' ',
          p2: format(candidate.fee),
          p3: candidate.compensation && (
            <>{richMessage('copy.ClubStaff.3e2995c1db', { p0: format(candidate.compensation) })}</>
          ),
          p4: candidate.coachingRelease && (
            <>{richMessage('copy.Rich.73439e559e', { p0: format(candidate.coachingRelease) })}</>
          ),
          p5: candidate.source === 'internal' && <>{richMessage('copy.Rich.17762f8ae4')}</>,
          p6: candidate.person && candidate.source === 'club' && (
            <>{richMessage('copy.Rich.6020fc64ba')}</>
          ),
        })}
      </p>
      <button
        disabled={disabled}
        onClick={() => {
          setHiring(candidate.id);
          setTerm(defaultManagerTerm(candidate, w.year));
        }}
      >
        {localizeValue(
          candidate.source === 'club'
            ? sourceMessage('copy.Rich.fea04efbc9')
            : sourceMessage('copy.ClubStaff.10451c4909'),
        )}{' '}
        ·{localizeValue(' ')}
        <Money value={outlay(candidate)} code={c.country} year={w.year} plain />
      </button>
    </article>
  );
  const lists = (
    <>
      <p className={s.muted}>
        {richMessage('copy.Rich.86dd0b88c3', {
          p0: m.name,
          p1: m.interim ? sourceMessage('copy.Rich.0c3957678c') : '',
          p2: m.ability,
        })}
      </p>
      <Panel title={displayMessage('copy.Rich.ae481cf0db')} note="FREE AGENTS">
        <div className={s.panelBody}>
          <p className={s.muted}>
            {richMessage('copy.Rich.d3a5a94beb', { p0: roundsUntilRefresh(w) })}
          </p>
          {localizeValue(
            free.length ? (
              <div className={s.cards}>{localizeValue(free.map(card))}</div>
            ) : (
              <p className={s.muted}>{richMessage('copy.Rich.7ce4653cdc')}</p>
            ),
          )}
        </div>
      </Panel>
      <Panel title={displayMessage('copy.Rich.845360ffbd')} note="POACH">
        <div className={s.panelBody}>
          <p className={s.muted}>{richMessage('copy.Rich.07644a687f', { p0: others.length })}</p>
          <div className={s.cards}>{localizeValue(others.map(card))}</div>
        </div>
      </Panel>
    </>
  );
  return (
    <>
      {localizeValue(
        inline ? (
          <div className={s.inlineMarket} aria-label={displayMessage('copy.Rich.3d2202fddf')}>
            {localizeValue(lists)}
          </div>
        ) : (
          <Dialog
            label={localizeValue(
              m.interim
                ? sourceMessage('copy.ClubStaff.10451c4909')
                : sourceMessage('copy.influences.4e0080bed2'),
            )}
            wide
            onClose={onClose}
          >
            {localizeValue(lists)}
          </Dialog>
        ),
      )}
      {localizeValue(
        chosen && (
          <Dialog
            label={displayMessage('copy.Rich.fdb9dc19b7')}
            onClose={() => {
              setHiring(undefined);
              onCancel?.();
            }}
          >
            <h2>{richMessage('copy.Rich.4a24e4c4d9', { p0: chosen.name })}</h2>
            <ul className={s.consequences}>
              <li>
                {richMessage('copy.Rich.9130b27af6', {
                  p0: <b>{localizeValue(format(outlay(chosen)))}</b>,
                  p1: format(chosen.fee),
                  p2: chosen.compensation && (
                    <>{richMessage('copy.Rich.5ef1f043f3', { p0: format(chosen.compensation) })}</>
                  ),
                  p3: chosen.coachingRelease && (
                    <>
                      {richMessage('copy.Rich.73439e559e', { p0: format(chosen.coachingRelease) })}
                    </>
                  ),
                  p4: payoff > 0n && (
                    <>{richMessage('copy.Rich.a489973b55', { p0: format(payoff) })}</>
                  ),
                })}
              </li>
              {localizeValue(chosen.person && <li>{richMessage('copy.Rich.88d000783a')}</li>)}
              {localizeValue(
                chosen.club && !chosen.person && (
                  <li>
                    {richMessage('copy.Rich.479539aad2', {
                      p0: <ClubLink w={w} id={chosen.club} />,
                    })}
                  </li>
                ),
              )}
              <li>
                {richMessage('copy.Rich.027ad1b267', {
                  p0: <b>{localizeValue(chosen.ability)}</b>,
                  p1: ' ',
                  p2: <b>{localizeValue(chosen.potential ?? chosen.ability)}</b>,
                  p3: personAge(w, chosen.born),
                  p4:
                    (chosen.potential ?? 0) > chosen.ability
                      ? sourceMessage('copy.Rich.7f6873b93c')
                      : '',
                })}
              </li>
              <li>
                {richMessage('copy.Rich.65a5c3a480', {
                  p0: m.name,
                  p1: !m.interim && m.style ? sourceMessage('copy.Rich.7b582ac330') : '',
                })}
              </li>
              <li>
                {richMessage('copy.Rich.ee201ac20b', {
                  p0: <b>{localizeValue(STYLE_INFO[chosen.style].label)}</b>,
                  p1: ' ',
                  p2: [...STYLE_INFO[chosen.style].pros, ...STYLE_INFO[chosen.style].cons].join(
                    ' · ',
                  ),
                })}
              </li>
              <li>
                <TraitNote trait={chosen.trait} />
              </li>
              <li>
                {richMessage('copy.Rich.699ba564b7', {
                  p0: tacticLabel[w.tactic],
                  p1: <b>{localizeValue(tacticLabel[chosen.philosophy])}</b>,
                })}
              </li>
              <li>
                {richMessage('copy.Rich.a6d26aef12', {
                  p0: format(chosen.wage),
                  p1: contractLine(w.year + term, w.year),
                  p2: STYLE_INFO[chosen.style].term === 1 && sourceMessage('copy.Rich.e6f9de0b3b'),
                  p3: (
                    <ManagerHireTerm
                      w={w}
                      candidate={chosen}
                      term={term}
                      disabled={disabled}
                      onChange={setTerm}
                    />
                  ),
                })}
              </li>
            </ul>
            <div className={s.actions}>
              <button
                onClick={() => {
                  setHiring(undefined);
                  onCancel?.();
                }}
              >
                {richMessage('common.cancel')}
              </button>
              <button
                data-ui="primary"
                className={s.primary}
                disabled={disabled}
                onClick={async () => {
                  const reply = await client.command({ type: 'hire', id: chosen.id, term });
                  if (reply?.ok) {
                    setHiring(undefined);
                    onClose();
                  }
                }}
              >
                {richMessage('copy.Rich.b3d797b51d')}
              </button>
            </div>
            {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
          </Dialog>
        ),
      )}
    </>
  );
}
/**
 * Injury, retirement, an unhappy player with his reason and his transfer request at a glance on a
 * roster card (→WEB-68); the stance badge shows the market.
 */
function PlayerFlags({ w, player }: { w: World; player: Player }) {
  useTextLocale();
  const out = injuryDaysLeft(w, player);
  const flags = [
    out > 0 && player.injury
      ? sourceMessage('copy.Rich.dc9b9e68bb', { p0: player.injury.label, p1: Math.ceil(out / 7) })
      : '',
    // Bans and a warning one yellow short of a league ban sit by the injury (→WEB-68, CLUB-45).
    ...bansOf(w, player.id).map(banText),
    yellowWarning(w, player) ? sourceMessage('copy.Rich.51b23b5112') : '',
    player.retiring !== undefined ? sourceMessage('copy.Rich.5582150704') : '',
    player.unhappy
      ? sourceMessage('copy.Rich.f30601cfa7', { p0: UNHAPPY_REASON[player.unhappy.reason] })
      : '',
    player.transferRequest ? sourceMessage('copy.EventCenter.e389075954') : '',
  ].filter(Boolean);
  if (!flags.length) return null;
  return (
    <em className={s.playerFlags}>
      {localizeValue(flags.map((flag, i) => <i key={`${i}:${flag}`}>{localizeValue(flag)}</i>))}
    </em>
  );
}
const canSetStance = (p: Player) =>
  p.status === 'active' && !p.loanUntil && p.retiring === undefined;
/** A player's market stance on his roster card; tapping it opens the three choices. */
function StanceBadge({
  player,
  disabled,
  onOpen,
}: {
  player: Player;
  disabled: boolean;
  onOpen: () => void;
}) {
  useTextLocale();
  const stance = transferStance(player);
  return (
    <button
      type="button"
      className={s.stanceBadge}
      data-surface="tile"
      data-stance={stance}
      disabled={disabled}
      aria-label={displayMessage('copy.Rich.160a16c38f', {
        p0: player.name,
        p1: STANCE_INFO[stance].label,
      })}
      onClick={onOpen}
    >
      <i aria-hidden="true" />
      {localizeValue(STANCE_INFO[stance].label)}
      <PixelIcon name="chevronDown" size={16} />
    </button>
  );
}
/** What each stance does for this player, given who answers offers (→CLUB-22). */
function stanceConsequence(w: World, p: Player, stance: TransferStance) {
  const staffAnswer = isDelegated(w, 'sales'),
    value = playerValue(w, p),
    c = w.clubs.find((club) => club.id === w.playerClub)!,
    // Each stance reads as a sentence inside its own radio, so amounts come as text (→WEB-67).
    format = (amount: string) => compactMoney(amount, c.country, w.year);
  if (stance === 'listed')
    return {
      what: sourceMessage('copy.Rich.fa4027c909', {
        p0: Math.round(LISTED_OFFER.low * 100),
        p1: Math.round(LISTED_OFFER.high * 100),
        p2: expectedOfferDays(w, p),
      }),
      who: staffAnswer
        ? sourceMessage('copy.Rich.2d87e0aa1d')
        : sourceMessage('copy.Rich.6fa78664ca'),
    };
  if (stance === 'open')
    return {
      what: sourceMessage('copy.Rich.6aa4d020ff'),
      who: staffAnswer
        ? sourceMessage('copy.Rich.d630d96fa4', { p0: saleBar(w, p).percent })
        : sourceMessage('copy.Rich.6fa78664ca'),
    };
  const market = buildOf(w).market,
    card = cardOf(buildOf(w), 'market').label;
  return {
    what: sourceMessage('copy.Rich.c1583a64cf', {
      p0: UNTOUCHABLE_BAR,
      p1: format(ratio(value, BigInt(UNTOUCHABLE_BAR), 100n)),
    }),
    who: staffAnswer
      ? market === 'hold'
        ? sourceMessage('copy.Rich.6c4000e91e', { p0: card })
        : sourceMessage('copy.Rich.7ec00fbab6', {
            p0: card,
            p1: UNTOUCHABLE_PRICE[market ?? 'standard'],
          })
      : sourceMessage('copy.Rich.e25d43ab4e'),
  };
}
function StanceSheet({
  w,
  player,
  disabled,
  onChoose,
  onClose,
}: {
  w: World;
  player: Player;
  disabled: boolean;
  onChoose: (stance: TransferStance) => void;
  onClose: () => void;
}) {
  useTextLocale();
  const c = w.clubs.find((club) => club.id === w.playerClub)!,
    current = transferStance(player),
    window = transferWindow(w);
  return (
    <Dialog label={displayMessage('copy.Rich.5a473ce138')} onClose={onClose}>
      <h2>{richMessage('copy.Rich.b9546a6703', { p0: player.name })}</h2>
      <p>
        {richMessage('copy.Rich.56d348d298', {
          p0: player.position,
          p1: w.year - player.born,
          p2: overall(player),
          p3: ' ',
          p4: <Money value={playerValue(w, player)} code={c.country} year={w.year} />,
        })}
      </p>
      <div
        className={s.stanceChoices}
        role="radiogroup"
        aria-label={displayMessage('copy.Rich.5a473ce138')}
      >
        {localizeValue(
          TRANSFER_STANCES.map((stance) => {
            const consequence = stanceConsequence(w, player, stance);
            return (
              <button
                key={stance}
                type="button"
                role="radio"
                data-stance={stance}
                aria-checked={current === stance}
                className={current === stance ? s.selected : undefined}
                disabled={disabled}
                onClick={() => onChoose(stance)}
              >
                <b>
                  {localizeValue(STANCE_INFO[stance].label)} ·{' '}
                  {localizeValue(STANCE_INFO[stance].tag)}
                </b>
                <span>{localizeValue(consequence.what)}</span>
                <small>{localizeValue(consequence.who)}</small>
              </button>
            );
          }),
        )}
      </div>
      <p className={s.muted}>
        {richMessage('copy.Rich.d0aeb0ef5b', {
          p0: window.label,
          p1: window.open ? '' : sourceMessage('copy.Rich.2fee883401'),
        })}
      </p>
    </Dialog>
  );
}
/**
 * A contract talk (→WEB-68, CLUB-26): a renewal or an improved contract, his agent's rating and the
 * clauses the new contract carries (→CLUB-29, CLUB-30), his demand and the floor he settles for, the
 * window's terms (1–5 seasons in the summer, ½–4½ in winter), the yearly cost and the runway after
 * it, and what a refusal risks (→CLUB-27). He accepts any offer at or above
 * the floor, so the owner offers the floor or declines; an unhappy player has only his floor, as it
 * stands today, to be met.
 */
function ContractTalkSheet({
  w,
  player,
  talk,
  disabled,
  onOffer,
  onDecline,
  onClose,
  error,
}: {
  w: World;
  player: Player;
  talk: ContractTalk;
  disabled: boolean;
  onOffer: (term: TalkTerm) => void;
  onDecline: () => void;
  onClose: () => void;
  error?: string;
}) {
  useTextLocale();
  const [picked, setTerm] = useTaskState<TalkTerm>(w.id, `player-talk-term-${player.id}`, 2);
  const c = w.clubs.find((club) => club.id === w.playerClub)!,
    money = (value: string | bigint) => <Money value={value} code={c.country} year={w.year} />,
    raise = BigInt(talk.floor) - BigInt(player.wage),
    runway = fixedCostRunway(w.cash, (BigInt(operatingCosts(w).annual) + raise).toString()),
    chance = Math.round(talkRoundChance(w) * 100),
    label = TALK_LABEL[talk.kind],
    window = talkWindow(w),
    terms = TALK_TERMS[window],
    agent = agentOf(w, player),
    premium = Math.round((agentPremium(agent) - 1) * 100),
    // A sheet left open across 1 January keeps a term the new window offers.
    term: TalkTerm = terms.includes(picked) ? picked : 2;
  return (
    <Dialog
      label={displayMessage('copy.ClubStaff.5ca939d3e3')}
      onClose={onClose}
      actions={
        <div className={s.actions}>
          {localizeValue(
            player.talk ? (
              <button disabled={disabled} onClick={onDecline}>
                {richMessage('copy.EventCenter.cc6314d04d')}
              </button>
            ) : (
              <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
            ),
          )}
          <button
            data-ui="primary"
            className={s.primary}
            disabled={disabled}
            onClick={() => onOffer(term)}
          >
            {richMessage('copy.Rich.2438f7027f', {
              p0: <Money value={talk.floor} code={c.country} year={w.year} plain />,
              p1: ' ',
              p2: termLabel(window, term),
            })}
          </button>
        </div>
      }
    >
      {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
      <h2>
        {player.name}{' '}
        {localizeValue(
          player.talk
            ? sourceMessage('copy.Rich.6703818631', { p0: label })
            : sourceMessage('copy.Rich.74ceae00d5'),
        )}
      </h2>
      <p>
        {richMessage('copy.Rich.3e671d0a15', {
          p0: player.position,
          p1: w.year - player.born,
          p2: overall(player),
          p3: ' ',
          p4: money(player.wage),
          p5: contractLine(player.until, w.year),
        })}
      </p>
      {localizeValue(
        player.unhappy && (
          <p className={s.muted}>
            {richMessage('copy.Rich.54db82f7cf', {
              p0: UNHAPPY_REASON[player.unhappy.reason],
              p1: player.transferRequest
                ? sourceMessage('copy.Rich.716e17c88b')
                : sourceMessage('copy.Rich.a43d2917b3'),
            })}
          </p>
        ),
      )}
      {localizeValue(
        talk.kind === 'improve' && <p className={s.muted}>{richMessage('copy.Rich.94dd6887a9')}</p>,
      )}
      <p>
        {richMessage('copy.Rich.3293275d8c', { p0: money(talk.demand), p1: money(talk.floor) })}
      </p>
      <p>
        {richMessage('copy.Rich.1c2ca8a472', {
          p0: agent,
          p1: premium ? sourceMessage('copy.Rich.e20447872f', { p0: premium }) : '',
          p2: ' ',
          p3: clausesLabel(talk.clauses),
        })}
      </p>
      {localizeValue(
        ballonDorPremiumLine(w, player.id) && (
          <p data-testid="ballon-dor-premium">
            {localizeValue(ballonDorPremiumLine(w, player.id))}
          </p>
        ),
      )}
      <p className={s.muted}>
        {localizeValue(
          window === 'summer'
            ? sourceMessage('copy.Rich.5fc7181c4e')
            : sourceMessage('copy.Rich.a46c47d0a9'),
        )}
      </p>
      <div
        className={s.segments}
        role="radiogroup"
        aria-label={displayMessage('copy.stories.ebf9376720')}
      >
        {localizeValue(
          terms.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={term === value}
              className={term === value ? s.selected : undefined}
              onClick={() => setTerm(value)}
            >
              {localizeValue(termLabel(window, value))}
            </button>
          )),
        )}
      </div>
      <p>
        {richMessage('copy.Rich.cb33333f24', {
          p0: money(talk.floor),
          p1:
            raise > 0n ? (
              <>{richMessage('copy.Rich.09faf2e67c', { p0: money(raise) })}</>
            ) : raise < 0n ? (
              <>{richMessage('copy.Rich.40ba450e63', { p0: money(-raise) })}</>
            ) : null,
          p2: ' ',
          p3: contractLine(talkUntil(w, term), w.year),
          p4: runwayText(runway),
        })}
      </p>
      {localizeValue(
        player.talk && (
          <p className={s.muted}>
            {richMessage('copy.Rich.29de4afc10', {
              p0: chance,
              p1: UNHAPPY_PENALTY,
              p2: UNHAPPY_MORALE,
              p3: UNHAPPY_CONFIG.requestDays / 7,
            })}
          </p>
        ),
      )}
    </Dialog>
  );
}
/** 사람's 선수: the roster with each player's stance and contract talks (→WEB-43). */
function Roster({ state, client }: Props) {
  useTextLocale();
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [view, setView] = useTaskState<RosterView>(w.id, 'roster-view', DEFAULT_ROSTER_VIEW),
    [comparing, setComparing] = useTaskState(w.id, 'roster-comparing', false),
    [fullTable, setFullTable] = useTaskState(w.id, 'roster-table', false),
    [playerQuery, setPlayerQuery] = useTaskState(w.id, 'roster-query', ''),
    [playerPage, setPlayerPage] = useTaskState(w.id, 'roster-page', 0),
    [stanceId, setStanceId] = useTaskState<string | undefined>(w.id, 'roster-stance', undefined);
  const talkId = useContractTalk((state) => state.id),
    { open: openTalk, close: closeTalk } = useContractTalk.getState();
  const disabled = useGameState(gameActionsBlocked);
  const active = w.players.filter((p) => p.status === 'active');
  const registered = squadRegistration(w);
  const availability = squadAvailability(w);
  const window = transferWindow(w);
  const stancePlayer = w.players.find((p) => p.id === stanceId && canSetStance(p));
  const talkPlayer = active.find((p) => p.id === talkId),
    talk = talkPlayer && talkFor(w, talkPlayer);
  const { scope } = view;
  const tallies = v.tallies.players;
  const listed = explorePlayers(w.players, { ...view, query: playerQuery });
  const summary = rosterViewSummary(view);
  const lastPage = Math.max(0, Math.ceil(listed.length / 25) - 1),
    shownPage = Math.min(playerPage, lastPage),
    visiblePlayers = listed.slice(shownPage * 25, (shownPage + 1) * 25);
  return (
    <>
      <div className={s.filters}>
        <button onClick={() => setComparing(true)}>
          {richMessage('copy.PlayerComparison.e5d818b4c3')}
        </button>
      </div>
      <Panel
        title={displayMessage('copy.Rich.ebe2ebe944')}
        note={
          <>
            <span>{richMessage('copy.Rich.1573cecd98', { p0: registered.value })}</span>
            <br />
            <small>{localizeValue(registered.detail)}</small>
          </>
        }
      >
        {/* Who can play now leads the roster (→WEB-43/44); each card names its injury or ban. */}
        <p className={s.rosterViewSummary} data-testid="roster-availability">
          {richMessage('copy.Rich.2de180bff9', {
            p0: <b>{localizeValue(availability.available)}</b>,
            p1: availability.total,
            p2: ' ',
            p3: availability.injured,
            p4: availability.suspended,
          })}
        </p>
        <div className={s.rosterTools}>
          <label className={s.rosterSearch}>
            <span className={s.srOnly}>{richMessage('copy.Rich.b794634a49')}</span>
            <input
              aria-label={displayMessage('copy.Rich.b794634a49')}
              value={playerQuery}
              onChange={(event) => {
                setPlayerQuery(event.target.value);
                setPlayerPage(0);
              }}
              placeholder={displayMessage('copy.Rich.d02b30199c')}
            />
          </label>
          <RosterFilters
            view={view}
            onChange={(next) => {
              setView(next);
              setPlayerPage(0);
            }}
          />
        </div>
        {localizeValue(
          summary.length > 0 && (
            <p className={s.rosterViewSummary} data-testid="roster-view-summary">
              {localizeValue(summary.join(' · '))}
            </p>
          ),
        )}
        <div className={s.rosterCards}>
          {localizeValue(
            visiblePlayers.map((p) => (
              <article data-surface="panel" key={p.id}>
                <div className={s.rosterBody}>
                  <OvrBadge value={overall(p)} role={p.position} />
                  <PlayerLink id={p.id} name={p.name} scope={scope} className={s.cardLink} />
                  <small>
                    {localizeValue(
                      p.status === 'active' ? (
                        <>
                          {richMessage('copy.Rich.3c0aad8104', {
                            p0: w.year - p.born,
                            p1: Math.round(p.potential),
                            p2: ' ',
                            p3: (
                              <span data-testid="roster-adaptation">
                                {localizeValue(p.adaptation.toFixed(2))}
                              </span>
                            ),
                            p4: <br />,
                            p5: <Money value={p.wage} code={c.country} year={w.year} plain />,
                            p6: ' ',
                            p7: (
                              <Money
                                value={marketWage(w, p)}
                                code={c.country}
                                year={w.year}
                                plain
                              />
                            ),
                            p8: ' ',
                            p9: contractLine(p.until, w.year),
                          })}
                        </>
                      ) : (
                        sourceMessage('copy.Rich.25ec2568bd', {
                          p0: playerStatus(p),
                          p1: ofScope(tallies[p.id]?.apps, 'career'),
                          p2: p.career[0],
                        })
                      ),
                    )}
                  </small>
                  {localizeValue(p.status === 'active' && <PlayerFlags w={w} player={p} />)}
                </div>
                <div className={s.rosterStats}>
                  <b>{richMessage('copy.Rich.af39eef578', { p0: Math.round(p.fatigue) })}</b>
                  <small>
                    {richMessage('copy.Rich.0e67d9b4af', { p0: (p.developed || 0).toFixed(2) })}
                  </small>
                </div>
                <div className={s.rosterActions}>
                  {localizeValue(
                    p.status === 'active' && talkFor(w, p) && (
                      <button
                        type="button"
                        className={s.stanceBadge}
                        data-surface="tile"
                        data-stance="listed"
                        disabled={disabled}
                        aria-label={displayMessage('copy.Rich.c4bd22a5c6', { p0: p.name })}
                        onClick={() => openTalk(p.id)}
                      >
                        {richMessage('copy.Rich.ba7bffee64')}
                      </button>
                    ),
                  )}
                  {localizeValue(
                    canSetStance(p) && (
                      <StanceBadge
                        player={p}
                        disabled={disabled}
                        onOpen={() => setStanceId(p.id)}
                      />
                    ),
                  )}
                </div>
              </article>
            )),
          )}
        </div>
        {localizeValue(
          listed.length === 0 && (
            <p className={s.panelBody}>{richMessage('copy.Rich.eb8b7c3ab1')}</p>
          ),
        )}
        {localizeValue(
          lastPage > 0 && (
            <div className={s.rosterPages}>
              <button disabled={shownPage === 0} onClick={() => setPlayerPage(shownPage - 1)}>
                {richMessage('copy.Rich.f2b4991b96')}
              </button>
              <span>
                {richMessage('copy.Rich.b133fbb9f7', {
                  p0: shownPage + 1,
                  p1: lastPage + 1,
                  p2: listed.length,
                })}
              </span>
              <button
                disabled={shownPage === lastPage}
                onClick={() => setPlayerPage(shownPage + 1)}
              >
                {richMessage('copy.Rich.ecb3f631a4')}
              </button>
            </div>
          ),
        )}
        <details
          data-ui="disclosure"
          className={s.rosterDetails}
          onToggle={(event) => setFullTable(event.currentTarget.open)}
        >
          <summary>{richMessage('copy.Rich.208e0c274f')}</summary>
          {localizeValue(
            fullTable && (
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{richMessage('copy.BallonDorView.cb34c0f691')}</th>
                      <th>{richMessage('team.column.player')}</th>
                      <th>{richMessage('team.column.ovr')}</th>
                      <th>{richMessage('copy.Rich.a074c1b50b')}</th>
                      <th>{richMessage('team.column.age')}</th>
                      <th>{richMessage('copy.AssigneeProfile.ad725da0ea')}</th>
                      <th>{richMessage('copy.BallonDorView.b849877c07')}</th>
                      <th>{richMessage('copy.summary.eb4e291be3')}</th>
                      <th>{richMessage('copy.BallonDorView.8d901cc28d')}</th>
                      <th>{richMessage('team.column.fatigue')}</th>
                      <th>{richMessage('team.column.wage')}</th>
                      <th>{richMessage('team.column.contract')}</th>
                      <th>{richMessage('copy.ControllerBackgrounds.8d1a750c93')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localizeValue(
                      visiblePlayers.map((p) => {
                        const stats = scope === 'career' ? p.career : p.season;
                        return (
                          <tr key={p.id}>
                            <td title={localizeValue(positionsLabel(p.positions))}>
                              {localizeValue(p.position)}
                            </td>
                            <td>
                              <PlayerLink id={p.id} name={p.name} scope={scope} />
                              <small>
                                {localizeValue(' ')}
                                {localizeValue(
                                  p.status === 'retired'
                                    ? sourceMessage('copy.Rich.fc798874df')
                                    : p.status === 'sold'
                                      ? sourceMessage('copy.NewsFeed.832934e8a8')
                                      : p.loanUntil
                                        ? sourceMessage('team.loan')
                                        : '',
                                )}
                              </small>
                            </td>
                            <td>{localizeValue(overall(p))}</td>
                            <td>
                              {localizeValue(p.status === 'active' ? p.adaptation.toFixed(2) : '—')}
                            </td>
                            <td>
                              {localizeValue(
                                p.status === 'active'
                                  ? w.year - p.born
                                  : sourceMessage('copy.Rich.5e81695906', { p0: p.born }),
                              )}
                            </td>
                            <td>{localizeValue(number(p.potential))}</td>
                            <td>
                              {localizeValue(ofScope(tallies[p.id]?.apps, scope))}
                              {localizeValue(
                                ofScope(tallies[p.id]?.sub, scope) > 0 &&
                                  sourceMessage('copy.Rich.f254b07d47', {
                                    p0: ofScope(tallies[p.id]?.sub, scope),
                                  }),
                              )}
                            </td>
                            <td>{localizeValue(stats[0])}</td>
                            <td>{localizeValue(stats[1])}</td>
                            <td>{localizeValue(number(p.fatigue))}</td>
                            <td>
                              {localizeValue(
                                p.status === 'active' ? (
                                  <Money value={p.wage} code={c.country} year={w.year} />
                                ) : (
                                  '—'
                                ),
                              )}
                            </td>
                            <td>{localizeValue(p.until)}</td>
                            <td>
                              {localizeValue(
                                canSetStance(p) && (
                                  <StanceBadge
                                    player={p}
                                    disabled={disabled}
                                    onOpen={() => setStanceId(p.id)}
                                  />
                                ),
                              )}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            ),
          )}
        </details>
        <div className={s.panelFoot}>
          {richMessage('copy.Rich.0ff383e96f', { p0: window.label })}
        </div>
      </Panel>
      <TalkRulePanel w={w} client={client} />
      {localizeValue(
        comparing && (
          <PlayerComparison
            w={w}
            client={client}
            initialScope={scope}
            onClose={() => setComparing(false)}
          />
        ),
      )}
      {localizeValue(
        stancePlayer && (
          <StanceSheet
            w={w}
            player={stancePlayer}
            disabled={disabled}
            onChoose={(stance) => {
              if (stance !== transferStance(stancePlayer))
                void client.command({ type: 'transfer-stance', id: stancePlayer.id, stance });
              setStanceId(undefined);
            }}
            onClose={() => setStanceId(undefined)}
          />
        ),
      )}
      {localizeValue(
        talkPlayer && talk && (
          <ContractTalkSheet
            w={w}
            player={talkPlayer}
            talk={talk}
            disabled={disabled}
            onOffer={(term) => {
              void client.command({
                type: 'contract-offer',
                player: talkPlayer.id,
                wage: talk.floor,
                term,
              });
              closeTalk();
            }}
            onDecline={() => {
              void client.command({ type: 'contract-decline', player: talkPlayer.id });
              closeTalk();
            }}
            onClose={closeTalk}
          />
        ),
      )}
    </>
  );
}
/** Manual actions are also reachable beside their instructions, through the same forms. */
export function ApprovalWorkbench({
  state,
  client,
  controller,
  responsibility,
}: Props & {
  controller: ProgressionController;
  responsibility: ResponsibilityKey;
}) {
  useTextLocale();
  const w = state.view!.world;
  const [market, setMarket] = useState(false);
  const [mediationId, setMediationId] = useState<string>();
  const pending = approvalRequests(w).filter(
    (item) =>
      item.responsibility === responsibility || item.responsibilities?.includes(responsibility),
  );
  const mediation = w.mediations?.find((record) => record.id === mediationId);
  return (
    <>
      {localizeValue(
        pending
          .filter((item) => item.kind === 'incoming-bid' || item.kind === 'bid-response')
          .map((item) => (
            <EventCard key={item.id} client={client} controller={controller} item={item} inDesk />
          )),
      )}
      {localizeValue(
        (responsibility === 'staff' || responsibility === 'contracts') &&
          w.players
            .filter((player) => w.playingCoachProposals?.[player.id]?.status === 'pending')
            .map((player) => (
              <PlayingCoachReview key={player.id} w={w} client={client} player={player} />
            )),
      )}
      {localizeValue(
        responsibility === 'recruitment' &&
          w.mediations
            ?.filter((record) => record.status === 'pending')
            .map((record) => (
              <button
                key={record.id}
                type="button"
                data-ui="secondary"
                onClick={() => setMediationId(record.id)}
              >
                {richMessage('copy.Rich.9821436305')}
              </button>
            )),
      )}
      {localizeValue(
        mediation && (
          <MediationReview
            record={mediation}
            w={w}
            client={client}
            onClose={() => setMediationId(undefined)}
          />
        ),
      )}
      {localizeValue(
        responsibility === 'manager' ? (
          <>
            <ManagerCard state={state} client={client} onReplace={() => setMarket(true)} />
            {localizeValue(
              market && (
                <ManagerMarket
                  state={state}
                  client={client}
                  inline
                  onClose={() => setMarket(false)}
                />
              ),
            )}
          </>
        ) : responsibility === 'staff' ? (
          <CoachingStaff w={w} client={client} />
        ) : responsibility === 'contracts' || responsibility === 'sales' ? (
          <Roster state={state} client={client} />
        ) : responsibility === 'recruitment' ? (
          <RecruitmentDesk state={state} client={client} />
        ) : responsibility === 'academy' ? (
          <AcademyPanel w={w} client={client} />
        ) : (
          <BusinessWorkbench state={state} client={client} part="sponsor" />
        ),
      )}
    </>
  );
}
/** The inbox and each review overlay the current page, without changing its address. */
export function ApprovalInbox({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  useTextLocale();
  const state = useGameState((state) => state);
  const w = state.view!.world;
  const [open, setOpen] = useTaskState(w.id, APPROVAL_INBOX_OPEN, false);
  const [selected, setSelected] = useTaskState<ApprovalRequest | undefined>(
    w.id,
    APPROVAL_DIALOG_REQUEST,
    undefined,
  );
  useEffect(() => {
    const close = () => {
      setOpen(false);
      setSelected(undefined);
    };
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setOpen, setSelected]);
  if (selected && selected.world === w.id) {
    return (
      <OperationsView
        key={`${w.id}:${selected.item.id}`}
        state={state}
        client={client}
        controller={controller}
        selectedRequest={selected}
        personnel={(_desk, scoped, request, error) => (
          <PersonnelRequest
            key={`${request.world}:${request.item.id}`}
            request={request}
            state={state}
            client={scoped}
            controller={controller}
            error={error}
          />
        )}
      />
    );
  }
  if (!open) return null;
  return (
    <Dialog
      label={displayMessage('copy.ApprovalButtons.216a759610')}
      wide
      onClose={() => setOpen(false)}
    >
      <ApprovalQueue
        w={w}
        pending={approvalRequests(w)}
        client={client}
        controller={controller}
        requestsOnly
      />
    </Dialog>
  );
}
/**
 * The owner office (→WEB-39). A view asked for while it shows lands in the address and reopens
 * the office on it; from elsewhere the address already carries it.
 */
function Business({ state, client, controller }: Props & { controller: ProgressionController }) {
  useTextLocale();
  const request = useBusinessView((view) => view.request);
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    if (!request) return;
    useBusinessView.getState().take();
    const url = new URL(location.href);
    if (request === 'lobby') url.searchParams.delete('view');
    else url.searchParams.set('view', request);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setOpened((count) => count + 1);
  }, [request]);
  return (
    <>
      <OperationsView
        key={opened}
        state={state}
        client={client}
        controller={controller}
        personnel={(_desk, scoped, request, error) => (
          <PersonnelRequest
            key={`${request.world}:${request.item.id}`}
            request={request}
            state={state}
            client={scoped}
            controller={controller}
            error={error}
          />
        )}
      />
    </>
  );
}
export default function Rich({
  state,
  client,
  page,
  controller,
}: Props & { page: Page; controller: ProgressionController }) {
  useTextLocale();
  // 팀's compact directory of our people (→WEB-112); their detailed pages follow.
  if (page === 'team')
    return <TeamDirectory key={state.view!.world.id} state={state} client={client} />;
  if (page === 'firstTeam' || page === 'staff')
    return (
      <PersonnelHub
        key={`${state.view!.world.id}:${page}`}
        page={page}
        state={state}
        panel={(tab, replace) => (
          <PersonnelPanel
            tab={tab}
            state={state}
            client={client}
            controller={controller}
            onReplace={replace}
          />
        )}
        market={(close) => <ManagerMarket state={state} client={client} onClose={close} />}
      />
    );
  // Youth management stays in Team while the owner's workspace is being redesigned.
  if (page === 'academy')
    return (
      <>
        {localizeValue(page === 'academy' && <TeamReturn page="academy" />)}
        <TrainingView state={state} client={client} view={page} />
        {localizeValue(
          page === 'academy' && (
            <WorkResponsibility
              w={state.view!.world}
              client={client}
              controller={controller}
              scope={WORK_RESPONSIBILITIES.academy}
            />
          ),
        )}
      </>
    );
  // First-team training is read on its own page (→WEB-39/116); the overview is the office's modal.
  if (page === 'training') return <TrainingView state={state} client={client} view="training" />;
  if (page === 'operations') return <InvestmentView state={state} client={client} />;
  if (page === 'business')
    return <Business state={state} client={client} controller={controller} />;
  return (
    <Suspense
      fallback={
        <div className={s.loading} role="status">
          {richMessage('copy.Rich.87f98fe11c')}
        </div>
      }
    >
      <RecordsRoom state={state} client={client} />
    </Suspense>
  );
}
