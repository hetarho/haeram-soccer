import { openOfficeWork } from './officeDesks';
import { PlaceActivities } from './PlaceActivities';
import { PlayerOfficeWork, OfficeWorkResponsibility } from './PlayerOfficePanel';
import { saleOfferItems } from './playerOfficeWork';
import { AreaCriteria } from './DirectionLines';
import { stoppingEvents } from '../runtime/progression';
import { PersonnelHub } from './PersonnelHubs';
import type { ProgressionController } from '../runtime/progression';
import { squadRegistration } from './squadRegistration';
import { PersonCareerLink } from './PersonCareer';
import { useTaskState, useTaskMemory } from './taskMemory';
import { PixelIcon } from './PixelIcon';
import { Select } from './Select';
import { lazy, Suspense, useEffect, useState } from 'react';
import type {
  ContractTalk,
  ContractTerm,
  ManagerTrait,
  Player,
  TalkTerm,
  TransferStance,
  World,
} from '../../../../packages/contracts/src/types';
import { priceIndex } from '../../../../packages/catalogs/src/index';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import {
  injuryDaysLeft,
  overall,
  UNHAPPY_PENALTY,
} from '../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { quote } from '../../../../packages/engine/src/quotes';
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
} from '../../../../packages/engine/src/contracts';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { UNHAPPY_MORALE } from '../../../../packages/engine/src/morale';
import { ratio } from '../../../../packages/engine/src/primitives';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import type { ClientState, GameClient } from '../runtime/client';
import { Panel } from './App';
import { RecruitmentDesk } from './RecruitmentDesk';
import { OperationsView } from './Operations';
import { EventCard } from './EventCenter';
import { MediationReview } from './MediationReview';
import { PlayingCoachReview } from './PlayingCoachReview';
import type { ApprovalRequest } from './eventRouting';
import { STAFF_ROLES } from '../../../../packages/engine/src/staff-info';
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
} from '../../../../packages/engine/src/transfers';
import { transferWindow } from '../../../../packages/engine/src/transfer-window';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { Dialog } from './Dialog';
import { OvrBadge } from './OvrBadge';
import { positionsLabel } from './FormationPitch';
import {
  DEFAULT_ROSTER_VIEW,
  RosterFilters,
  rosterViewSummary,
  type RosterView,
} from './RosterFilters';
import {
  useBusinessView,
  useContractTalk,
  returnApprovalHome,
  type Page,
  type PeopleTab,
} from './state';
import {
  CoachingPlan,
  CoachingStaff,
  ManagerHireTerm,
  ManagerPost,
  ManagerRenewal,
  TalkRulePanel,
} from './ClubStaff';
import { TabList, TabPanel, useAddressTab } from './PageTabs';
import { AcademyPanel } from './AcademyPanel';
import { TrainingView } from './TrainingView';
import management from './ManagementView.module.css';
import { explorePlayers, ofScope, playerStatus } from './playerAnalysis';
import { bansOf, banText } from './discipline';
import { yellowWarning } from '../../../../packages/engine/src/discipline';
import { PlayerLink } from './PlayerSheet';
import { Attributes } from './Attributes';
import { StyleCard } from './StyleCard';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { MANAGER_TRAIT_INFO } from '../../../../packages/engine/src/staff-info';
import {
  managerRenewal,
  defaultManagerTerm,
  managerPayoff,
  managerTermLimit,
} from '../../../../packages/engine/src/ops-staff';
import { roundsUntilRefresh } from '../../../../packages/engine/src/managerMarket';
import { ClubLink } from './ClubLink';
import { runwayText } from './teamState';
import { PlayerComparison } from './PlayerComparison';
import { compactMoney, contractLine, number } from './format';
import { Money } from './Money';
import s from './App.module.css';
type Props = { state: ClientState; client: GameClient };
/**
 * The records room loads on its first visit: its charts, boards and archive tables stay out of
 * the first-play entry bundle (→ARCH-28).
 */
const RecordsRoom = lazy(() =>
  import('./RecordsRoom').then((module) => ({ default: module.RecordsRoom })),
);
const toneLabel = {
  respect: '정중하게 제안',
  evidence: '지표를 근거로',
  support: '지원을 약속하며',
  demand: '강하게 요구',
};
/** The manager's youth attribute speeds every young player's growth; the academy is separate. */
const YOUTH_HINT = '27세 미만 선수 성장';
/** "38세", or nothing for someone from an older save without an age. */
function personAge(w: World, born?: number) {
  return born === undefined ? '' : `${w.year - born}세`;
}
/** Where a manager's career is heading, for his card (→STAFF-16). */
function growthNote(w: World, m: { ability: number; potential?: number; born?: number }) {
  if (m.potential === undefined || m.born === undefined) return '';
  const age = w.year - m.born;
  if (m.potential > m.ability) return ` · 성장 여지 +${m.potential - m.ability}`;
  return age >= 60 ? ' · 노쇠기' : ' · 전성기';
}
/** A manager's selection habit (→STAFF-12): its label and effect, or that he has none. */
function TraitNote({ trait }: { trait?: ManagerTrait }) {
  if (!trait) return <>선발 성향 없음</>;
  return (
    <>
      선발 성향 <b>{MANAGER_TRAIT_INFO[trait].label}</b> · {MANAGER_TRAIT_INFO[trait].effect}
    </>
  );
}
/** Personnel and office screens compose these same action panels; neither copies commands. */
function PersonnelPanel({
  tab,
  state,
  client,
  onReplace,
}: Props & { tab: PeopleTab; onReplace: () => void }) {
  const w = state.view!.world;
  return tab === 'players' ? (
    <>
      <AreaCriteria w={w} areas={['squad']} />
      <Roster state={state} client={client} />
    </>
  ) : tab === 'market' ? (
    <RecruitmentDesk state={state} client={client} />
  ) : tab === 'manager' ? (
    <>
      <ManagerOffice state={state} client={client} onReplace={onReplace} />
      <ManagerPost w={w} client={client} />
    </>
  ) : (
    <>
      <CoachingStaff w={w} client={client} />
      <CoachingPlan w={w} />
    </>
  );
}
const STAFF_WORK = [
  ['manager', '감독 계약'],
  ['coaches', '스태프 계약'],
] as const;
function OfficePersonnelWork({
  desk,
  state,
  client,
  controller,
}: Props & { desk: 'players' | 'staff'; controller: ProgressionController }) {
  const offers = desk === 'players' ? saleOfferItems(state.view!.world) : [];
  if (desk === 'players')
    return (
      <PlayerOfficeWork
        w={state.view!.world}
        client={client}
        controller={controller}
        pending={stoppingEvents(state.view!.world)}
        work={(tab) =>
          tab === 'recruitment' ? (
            <RecruitmentDesk state={state} client={client} />
          ) : tab === 'academy' ? (
            <PlaceActivities place="academy" state={state} client={client} />
          ) : (
            <>
              {tab === 'sales' && (
                <section aria-label="들어온 매각 제안">
                  {offers.map((item) => (
                    <EventCard
                      key={item.id}
                      client={client}
                      controller={controller}
                      item={item}
                      inDesk
                    />
                  ))}
                  {!offers.length && <p>현재 답변할 매각 제안이 없어요.</p>}
                </section>
              )}
              <Roster state={state} client={client} work={tab} />
            </>
          )
        }
      />
    );
  return <StaffOfficeWork state={state} client={client} controller={controller} />;
}
function StaffOfficeWork({
  state,
  client,
  controller,
}: Props & { controller: ProgressionController }) {
  const w = state.view!.world;
  const [tab, setTab] = useAddressTab('work', STAFF_WORK, 'manager', {
    world: w.id,
    key: 'office-work-staff',
    path: '/direction?view=staff',
    keepFirst: true,
    older: (params) =>
      (params.get('work') ?? useTaskMemory.getState().values['office-work-staff']) === 'coaches'
        ? 'coaches'
        : 'manager',
  });
  const [market, setMarket] = useState(false);
  return (
    <>
      <TabList
        tabs={STAFF_WORK}
        value={tab}
        label="스태프 계약 업무"
        idPrefix="office-staff"
        onChange={(next) => {
          if (next === tab) return;
          setTab(next);
          openOfficeWork(next);
        }}
      />
      <TabPanel idPrefix="office-staff" value={tab}>
        <OfficeWorkResponsibility
          w={w}
          client={client}
          controller={controller}
          scope={[tab === 'manager' ? 'manager' : 'staff']}
        />
        <PersonnelPanel tab={tab} state={state} client={client} onReplace={() => setMarket(true)} />
      </TabPanel>
      {market && <ManagerMarket state={state} client={client} onClose={() => setMarket(false)} />}
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
        <PersonnelPanel
          tab="manager"
          state={state}
          client={client}
          onReplace={() => setMarket(true)}
        />
        {market && (
          <ManagerMarket
            state={state}
            client={client}
            onClose={cancel}
            onCancel={cancel}
            error={error}
          />
        )}
      </>
    );
  const role =
    w.staff?.find((member) => member.id === item.ref)?.role ??
    STAFF_ROLES.find((role) => role === item.ref);
  return <CoachingStaff w={w} client={client} selected={role} onCancel={cancel} error={error} />;
}
/** The manager's office: who he is and what he signed, and the owner's requests to him. */
function ManagerOffice({ state, client, onReplace }: Props & { onReplace: () => void }) {
  const w = state.view!.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [tactic, setTactic] = useTaskState(w.id, 'manager-tactic', w.tactic),
    [tone, setTone] = useTaskState(w.id, 'manager-tone', 'respect');
  const disabled = useGameState(gameActionsBlocked);
  const response = w.events.filter((e) => e.kind === 'manager-response').at(-1);
  // What a conditional acceptance asks the owner to put into training.
  const support = quote(c.country, w.year, 30);
  return (
    <>
      <div className={s.twoCols}>
        <Panel title={m.name} note={m.interim ? 'INTERIM MANAGER' : 'FIRST TEAM MANAGER'}>
          <div className={s.panelBody}>
            <div className={s.personHead}>
              <OvrBadge value={m.ability} role="감독" potential={m.potential} large />
              <div>
                <b>{personAge(w, m.born)}</b>
                {m.person && <PersonCareerLink id={m.person} name={m.name} client={client} />}
                <small>
                  {m.since}년 부임 ·{' '}
                  {m.interim ? '새 감독을 뽑을 때까지 대행' : contractLine(m.until, w.year)}
                  {growthNote(w, m)}
                </small>
              </div>
            </div>
            {/* No manager renews himself (→STAFF-14): unrenewed, he leaves at the close. */}
            {managerRenewal(w) && (
              <div className={`${s.renewal} ${s.leaving}`} data-testid="manager-renewal">
                <ManagerRenewal w={w} client={client} disabled={disabled} />
              </div>
            )}
            <StyleCard style={m.interim ? undefined : m.style} />
            <p className={s.muted}>
              <TraitNote trait={m.trait} />
            </p>
            <div className={s.actions}>
              {/* Like a coach's 교체, the market opens as a list over the office (→WEB-40). */}
              <button onClick={onReplace}>{m.interim ? '감독 선임' : '교체'}</button>
            </div>
            <details className={management.reference}>
              <summary>감독 능력·성향</summary>
              <Attributes
                rows={[
                  ['철학', tacticLabel[m.philosophy]],
                  ['육성', m.youth, YOUTH_HINT],
                  ['유연성', m.flexibility],
                  ['자존심', m.pride],
                  ['신뢰', m.trust],
                  ['불만 누적', m.conflicts],
                  ['연봉', <Money value={m.wage} code={c.country} year={w.year} />],
                ]}
              />
              <p className={s.muted}>
                {m.pride >= 75
                  ? '자존심이 강한 감독입니다. 신뢰가 낮아진 상태에서 간섭을 계속하면 떠날 수 있습니다.'
                  : m.flexibility >= 65
                    ? '변화를 비교적 열린 마음으로 받아들이는 감독입니다.'
                    : '자신의 철학을 지키려는 성향입니다. 납득할 근거와 지원을 준비하세요.'}
              </p>
            </details>
          </div>
        </Panel>
        <Panel title="감독실에서의 대화" note="YOUR REQUEST">
          <div className={s.panelBody}>
            <p className={s.muted}>
              현재 적용 전술: <b>{tacticLabel[w.tactic]}</b>
              {w.requested && ` · 최근 요청: ${tacticLabel[w.requested]}`}
            </p>
            <div className={s.filters} style={{ marginTop: 20 }}>
              <label>
                전술{' '}
                <Select
                  aria-label="요청 전술"
                  value={tactic}
                  onValueChange={(value) => setTactic(value as typeof tactic)}
                >
                  {Object.entries(tacticLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                말투{' '}
                <Select
                  aria-label="요청 말투"
                  value={tone}
                  onValueChange={(value) => setTone(value)}
                >
                  {Object.entries(toneLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <button
              data-ui="primary"
              className={s.primary}
              disabled={disabled}
              onClick={() => void client.command({ type: 'tactics', tactic, tone })}
            >
              감독에게 제안하기
            </button>
            {m.pending && (
              <div className={s.critical} style={{ marginTop: 20 }}>
                조건 대기: {tacticLabel[m.pending]}
                <p>
                  훈련 지원 <Money value={support} code={c.country} year={w.year} /> 필요
                </p>
                <button
                  disabled={disabled}
                  onClick={() => void client.command({ type: 'accept-condition' })}
                >
                  훈련 지원하고 수락
                </button>
              </div>
            )}
            {response && (
              <blockquote className={s.notice} style={{ margin: '20px 0 0' }}>
                <b>{response.title}</b>
                <p>{response.detail}</p>
              </blockquote>
            )}
            <details className={management.reference}>
              <summary>대화 판단 기준</summary>
              <p className={s.muted}>
                요청 결과는 성향·신뢰·말투·이전 갈등을 따릅니다. 동일 요청은 신뢰를 반복해서 높이지
                않습니다.
              </p>
            </details>
          </div>
        </Panel>
      </div>
    </>
  );
}
/**
 * The manager market behind 교체 (→STAFF-17, →WEB-40): free agents first, then the best managers
 * of our league and the division above, who cost compensation to their clubs. The list moves every
 * four rounds; hiring confirms on top of it and closes both.
 */
function ManagerMarket({
  state,
  client,
  onClose,
  onCancel,
  error,
}: Props & { onClose: () => void; onCancel?: () => void; error?: string }) {
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
        <OvrBadge value={candidate.ability} role="감독" potential={candidate.potential} large />
        <div>
          <h3>{candidate.name}</h3>
          {candidate.person && (
            <PersonCareerLink id={candidate.person} name={candidate.name} client={client} />
          )}
          <small>
            {personAge(w, candidate.born)}
            {growthNote(w, candidate)}
          </small>
          {candidate.club && (
            <small className={s.candidateClub}>
              현 소속 <ClubLink w={w} id={candidate.club} />
            </small>
          )}
        </div>
      </div>
      <span className={s.pill}>
        {STYLE_INFO[candidate.style].label} · {tacticLabel[candidate.philosophy]}
      </span>
      <StyleCard style={candidate.style} compact />
      <Attributes
        rows={[
          ['육성', candidate.youth, YOUTH_HINT],
          ['유연성', candidate.flexibility],
          ['자존심', candidate.pride],
          ['연봉', format(candidate.wage)],
        ]}
      />
      <p>
        <TraitNote trait={candidate.trait} />
      </p>
      <p>
        {managerTermLimit(candidate, w.year) === 1
          ? contractLine(w.year + 1, w.year)
          : `계약 1–${managerTermLimit(candidate, w.year)}시즌 선택`}{' '}
        · 계약금 {format(candidate.fee)}
        {candidate.compensation && <> · 보상금(웃돈) {format(candidate.compensation)}</>}
        {candidate.coachingRelease && (
          <> · 코치 계약 종료 보상 {format(candidate.coachingRelease)}</>
        )}
        {candidate.source === 'internal' && <> · 내부 승진</>}
        {candidate.person && candidate.source === 'club' && <> · 타 구단 코치 재직 중</>}
      </p>
      <button
        disabled={disabled}
        onClick={() => {
          setHiring(candidate.id);
          setTerm(defaultManagerTerm(candidate, w.year));
        }}
      >
        {candidate.source === 'club' ? '데려오기' : '감독 선임'} ·{' '}
        <Money value={outlay(candidate)} code={c.country} year={w.year} plain />
      </button>
    </article>
  );
  return (
    <>
      <Dialog label={m.interim ? '감독 선임' : '감독 교체'} wide onClose={onClose}>
        <p className={s.muted}>
          지금 {m.name}
          {m.interim ? ' (임시 감독)' : ''} · OVR {m.ability}
        </p>
        <Panel title="자유계약 감독" note="FREE AGENTS">
          <div className={s.panelBody}>
            <p className={s.muted}>
              감독 시장은 {roundsUntilRefresh(w)}라운드 뒤에 다시 움직여요. 다른 구단에서 경질된
              감독이 들어오고, 자리를 찾은 감독은 빠져요. 즉시 지출에는 지금 감독 보상(남은 시즌마다
              연봉의 25%)이 포함돼요.
            </p>
            {free.length ? (
              <div className={s.cards}>{free.map(card)}</div>
            ) : (
              <p className={s.muted}>지금은 자유계약 감독이 없어요.</p>
            )}
          </div>
        </Panel>
        <Panel title="다른 구단 감독 · 보상금 필요" note="POACH">
          <div className={s.panelBody}>
            <p className={s.muted}>
              우리 리그와 바로 위 디비전 감독 중 지도력 상위 {others.length}명이에요. 데려오려면
              계약금에 더해 그 구단에 연봉의 1.5배를 보상금으로 내요. 감독 선임을 맡기면 기준이
              허락할 때만 스태프가 다른 구단 감독을 데려와요.
            </p>
            <div className={s.cards}>{others.map(card)}</div>
          </div>
        </Panel>
      </Dialog>
      {chosen && (
        <Dialog
          label="감독 선임 확인"
          onClose={() => {
            setHiring(undefined);
            onCancel?.();
          }}
        >
          <h2>{chosen.name} 감독을 선임할까요?</h2>
          <ul className={s.consequences}>
            <li>
              즉시 지출 <b>{format(outlay(chosen))}</b> · 계약금 {format(chosen.fee)}
              {chosen.compensation && <> · 보상금 {format(chosen.compensation)}</>}
              {chosen.coachingRelease && (
                <> · 코치 계약 종료 보상 {format(chosen.coachingRelease)}</>
              )}
              {payoff > 0n && <> · 이전 감독 보상 {format(payoff)}</>}
            </li>
            {chosen.person && (
              <li>
                코치로 재직 중이면 해당 코치 자리와 연봉은 끝나고 같은 인물이 감독으로 부임해요.
              </li>
            )}
            {chosen.club && !chosen.person && (
              <li>
                <ClubLink w={w} id={chosen.club} />은 새 감독을 찾아요.
              </li>
            )}
            <li>
              지도력 OVR <b>{chosen.ability}</b> · 잠재력{' '}
              <b>{chosen.potential ?? chosen.ability}</b> · {personAge(w, chosen.born)}
              {(chosen.potential ?? 0) > chosen.ability ? ' · 시즌마다 잠재력에 가까워져요' : ''}
            </li>
            <li>
              {m.name} 감독은 오늘 팀을 떠나요
              {!m.interim && m.style ? ' (자유계약 감독 명단에 올라요)' : ''}.
            </li>
            <li>
              새 감독 성향 <b>{STYLE_INFO[chosen.style].label}</b> ·{' '}
              {[...STYLE_INFO[chosen.style].pros, ...STYLE_INFO[chosen.style].cons].join(' · ')}
            </li>
            <li>
              <TraitNote trait={chosen.trait} />
            </li>
            <li>
              적용 전술 {tacticLabel[w.tactic]} → <b>{tacticLabel[chosen.philosophy]}</b> (새 감독의
              철학)
            </li>
            <li>
              연봉 {format(chosen.wage)} · {contractLine(w.year + term, w.year)}
              {STYLE_INFO[chosen.style].term === 1 && ' · 남기려면 4월에 1시즌씩 재계약해요'}
              <ManagerHireTerm
                w={w}
                candidate={chosen}
                term={term}
                disabled={disabled}
                onChange={setTerm}
              />
            </li>
          </ul>
          <div className={s.actions}>
            <button
              onClick={() => {
                setHiring(undefined);
                onCancel?.();
              }}
            >
              취소
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
              선임 확정
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </>
  );
}
/**
 * Injury, retirement, an unhappy player with his reason and his transfer request at a glance on a
 * roster card (→WEB-68); the stance badge shows the market.
 */
function PlayerFlags({ w, player }: { w: World; player: Player }) {
  const out = injuryDaysLeft(w, player);
  const flags = [
    out > 0 && player.injury ? `부상 · ${player.injury.label} · ${Math.ceil(out / 7)}주` : '',
    // Bans and a warning one yellow short of a league ban sit by the injury (→WEB-68, CLUB-45).
    ...bansOf(w, player.id).map(banText),
    yellowWarning(w, player) ? '경고 누적 주의' : '',
    player.retiring !== undefined ? '시즌 후 은퇴' : '',
    player.unhappy ? `언해피 · ${UNHAPPY_REASON[player.unhappy.reason]}` : '',
    player.transferRequest ? '이적 요청' : '',
  ].filter(Boolean);
  if (!flags.length) return null;
  return (
    <em className={s.playerFlags}>
      {flags.map((flag, i) => (
        <i key={`${i}:${flag}`}>{flag}</i>
      ))}
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
  const stance = transferStance(player);
  return (
    <button
      type="button"
      className={s.stanceBadge}
      data-surface="tile"
      data-stance={stance}
      disabled={disabled}
      aria-label={`${player.name} 이적 상태 · ${STANCE_INFO[stance].label} · 바꾸기`}
      onClick={onOpen}
    >
      <i aria-hidden="true" />
      {STANCE_INFO[stance].label}
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
      what: `이적시장 기간에 실제 구단이 평가 가치의 ${Math.round(LISTED_OFFER.low * 100)}–${Math.round(LISTED_OFFER.high * 100)}%로 제안해요 · 첫 제안까지 평균 약 ${expectedOfferDays(w, p)}일`,
      who: staffAnswer
        ? '들어오는 제안은 스태프가 받아들여 매각해요'
        : '제안마다 구단주가 수락·거절해요',
    };
  if (stance === 'open')
    return {
      what: '다른 구단이 먼저 제안해 올 때 협상해요',
      who: staffAnswer
        ? `스태프가 평가 가치의 ${saleBar(w, p).percent}% 이상이면 팔아요 · 대체 선수 없는 주전은 지켜요`
        : '제안마다 구단주가 수락·거절해요',
    };
  const market = buildOf(w).market,
    card = cardOf(buildOf(w), 'market').label;
  return {
    what: `평가 가치 ${UNTOUCHABLE_BAR}%(${format(ratio(value, BigInt(UNTOUCHABLE_BAR), 100n))}) 미만 제안은 바로 거절해요`,
    who: staffAnswer
      ? market === 'hold'
        ? `거액 제안도 지켜요 · 매각 기조 ${card} (자금 위기면 매각)`
        : `거액 제안은 스태프가 감독과 상의해요 · 매각 기조 ${card} 기준 ${UNTOUCHABLE_PRICE[market ?? 'standard']}%, 자금 사정과 주전 여부로 조정`
      : '그 이상 거액 제안만 구단주에게 확인받아요',
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
  const c = w.clubs.find((club) => club.id === w.playerClub)!,
    current = transferStance(player),
    window = transferWindow(w);
  return (
    <Dialog label="이적 상태" onClose={onClose}>
      <h2>{player.name} 이적 상태</h2>
      <p>
        {player.position} · {w.year - player.born}세 · 능력 {overall(player)} · 평가 가치{' '}
        <Money value={playerValue(w, player)} code={c.country} year={w.year} />
      </p>
      <div className={s.stanceChoices} role="radiogroup" aria-label="이적 상태">
        {TRANSFER_STANCES.map((stance) => {
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
                {STANCE_INFO[stance].label} · {STANCE_INFO[stance].tag}
              </b>
              <span>{consequence.what}</span>
              <small>{consequence.who}</small>
            </button>
          );
        })}
      </div>
      <p className={s.muted}>
        수락해야 이적이 성사돼요. 지금: {window.label}
        {window.open ? '' : ' · 시장이 열리면 제안이 들어와요.'}
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
      label="계약 협상"
      onClose={onClose}
      actions={
        <div className={s.actions}>
          {player.talk ? (
            <button disabled={disabled} onClick={onDecline}>
              거절
            </button>
          ) : (
            <button onClick={onClose}>닫기</button>
          )}
          <button
            data-ui="primary"
            className={s.primary}
            disabled={disabled}
            onClick={() => onOffer(term)}
          >
            하한 <Money value={talk.floor} code={c.country} year={w.year} plain /> ·{' '}
            {termLabel(window, term)} 제시
          </button>
        </div>
      }
    >
      {error && <p role="alert">{error}</p>}
      <h2>
        {player.name} {player.talk ? `${label} 협상` : '언해피 · 하한 제시'}
      </h2>
      <p>
        {player.position} · {w.year - player.born}세 · 능력 {overall(player)} · 지금 연봉{' '}
        {money(player.wage)} · {contractLine(player.until, w.year)}
      </p>
      {player.unhappy && (
        <p className={s.muted}>
          {UNHAPPY_REASON[player.unhappy.reason]}로 언해피예요. 하한 이상을 제시하면 풀리고
          {player.transferRequest ? ' 이적 요청도 거둬요' : ' 이적 요청을 하지 않아요'}.
        </p>
      )}
      {talk.kind === 'improve' && (
        <p className={s.muted}>
          시장가보다 25% 넘게 적게 받아 계약 개선을 요구해요. 합의하면 오늘부터 새 계약으로 바뀌고
          지난 기간은 소급하지 않아요.
        </p>
      )}
      <p>
        요구 {money(talk.demand)} · 하한 {money(talk.floor)} · 하한 이상이면 바로 합의해요.
      </p>
      <p>
        에이전트 {agent}등급(1–5){premium ? ` · 요구 +${premium}%` : ''} · 새 계약 조항:{' '}
        {clausesLabel(talk.clauses)}
      </p>
      <p className={s.muted}>
        {window === 'summer'
          ? '여름 계약: 이번 시즌을 포함해 1–5시즌'
          : '겨울 계약: 이번 시즌 남은 기간과 0–4시즌 더(½–4½시즌)'}
      </p>
      <div className={s.segments} role="radiogroup" aria-label="계약 기간">
        {terms.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={term === value}
            className={term === value ? s.selected : undefined}
            onClick={() => setTerm(value)}
          >
            {termLabel(window, value)}
          </button>
        ))}
      </div>
      <p>
        연 비용 {money(talk.floor)}
        {raise > 0n ? (
          <> (지금보다 +{money(raise)})</>
        ) : raise < 0n ? (
          <> (지금보다 −{money(-raise)})</>
        ) : null}{' '}
        · {contractLine(talkUntil(w, term), w.year)} · 합의 뒤 자금 여력 {runwayText(runway)}
      </p>
      {player.talk && (
        <p className={s.muted}>
          거절하면 감독이 설득해요: 성공 {chance}% · 실패하면 언해피(능력 −{UNHAPPY_PENALTY}, 선발로
          뛴 라운드마다 분위기 −{UNHAPPY_MORALE}, 재계약 거부, {UNHAPPY_CONFIG.requestDays / 7}주 뒤
          이적 요청)
        </p>
      )}
    </Dialog>
  );
}
/** 사람's 선수: the roster with each player's stance and contract talks (→WEB-43). */
function Roster({ state, client, work }: Props & { work?: 'contracts' | 'sales' }) {
  const prefix = work ? `office-roster-${work}` : 'roster';
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [view, setView] = useTaskState<RosterView>(w.id, `${prefix}-view`, DEFAULT_ROSTER_VIEW),
    [comparing, setComparing] = useTaskState(w.id, `${prefix}-comparing`, false),
    [fullTable, setFullTable] = useTaskState(w.id, `${prefix}-table`, false),
    [playerQuery, setPlayerQuery] = useTaskState(w.id, `${prefix}-query`, ''),
    [playerPage, setPlayerPage] = useTaskState(w.id, `${prefix}-page`, 0),
    [stanceId, setStanceId] = useTaskState<string | undefined>(w.id, `${prefix}-stance`, undefined);
  const talkId = useContractTalk((state) => state.id),
    { open: openTalk, close: closeTalk } = useContractTalk.getState();
  const disabled = useGameState(gameActionsBlocked);
  const active = w.players.filter((p) => p.status === 'active');
  const registered = squadRegistration(w);
  const window = transferWindow(w);
  const stancePlayer = w.players.find((p) => p.id === stanceId && canSetStance(p));
  const talkPlayer = work !== 'sales' ? active.find((p) => p.id === talkId) : undefined,
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
        <button onClick={() => setComparing(true)}>우리 선수 비교</button>
      </div>
      <Panel
        title="우리 클럽의 선수들"
        note={
          <>
            <span>선수단 {registered.value}</span>
            <br />
            <small>{registered.detail}</small>
          </>
        }
      >
        <div className={s.rosterTools}>
          <label className={s.rosterSearch}>
            <span className={s.srOnly}>선수 찾기</span>
            <input
              aria-label="선수 찾기"
              value={playerQuery}
              onChange={(event) => {
                setPlayerQuery(event.target.value);
                setPlayerPage(0);
              }}
              placeholder="선수 이름으로 찾기"
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
        {summary.length > 0 && (
          <p className={s.rosterViewSummary} data-testid="roster-view-summary">
            {summary.join(' · ')}
          </p>
        )}
        <div className={s.rosterCards}>
          {visiblePlayers.map((p) => (
            <article data-surface="panel" key={p.id}>
              <div className={s.rosterBody}>
                <OvrBadge value={overall(p)} role={p.position} />
                <PlayerLink id={p.id} name={p.name} scope={scope} className={s.cardLink} />
                <small>
                  {p.status === 'active' ? (
                    <>
                      {w.year - p.born}세 · 잠재력 {Math.round(p.potential)} · 적응{' '}
                      <span data-testid="roster-adaptation">{p.adaptation.toFixed(2)}</span>
                      <br />
                      연봉 <Money value={p.wage} code={c.country} year={w.year} plain /> / 시장{' '}
                      <Money value={marketWage(w, p)} code={c.country} year={w.year} plain /> ·{' '}
                      {contractLine(p.until, w.year)}
                    </>
                  ) : (
                    `${playerStatus(p)} · 통산 ${ofScope(tallies[p.id]?.apps, 'career')}경기 ${p.career[0]}골`
                  )}
                </small>
                {p.status === 'active' && <PlayerFlags w={w} player={p} />}
              </div>
              <div className={s.rosterStats}>
                <b>피로 {Math.round(p.fatigue)}</b>
                <small>성장 +{(p.developed || 0).toFixed(2)}</small>
              </div>
              <div className={s.rosterActions}>
                {work !== 'sales' && p.status === 'active' && talkFor(w, p) && (
                  <button
                    type="button"
                    className={s.stanceBadge}
                    data-surface="tile"
                    data-stance="listed"
                    disabled={disabled}
                    aria-label={`${p.name} 계약 협상 열기`}
                    onClick={() => openTalk(p.id)}
                  >
                    협상
                  </button>
                )}
                {work !== 'contracts' && canSetStance(p) && (
                  <StanceBadge player={p} disabled={disabled} onOpen={() => setStanceId(p.id)} />
                )}
              </div>
            </article>
          ))}
        </div>
        {listed.length === 0 && <p className={s.panelBody}>이 조건에 맞는 선수가 없어요.</p>}
        {lastPage > 0 && (
          <div className={s.rosterPages}>
            <button disabled={shownPage === 0} onClick={() => setPlayerPage(shownPage - 1)}>
              이전 선수
            </button>
            <span>
              {shownPage + 1}/{lastPage + 1} · {listed.length}명
            </span>
            <button disabled={shownPage === lastPage} onClick={() => setPlayerPage(shownPage + 1)}>
              다음 선수
            </button>
          </div>
        )}
        <details
          className={s.rosterDetails}
          onToggle={(event) => setFullTable(event.currentTarget.open)}
        >
          <summary>전체 선수 지표 표 보기</summary>
          {fullTable && (
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>포지션</th>
                    <th>선수</th>
                    <th>OVR</th>
                    <th>적응</th>
                    <th>나이</th>
                    <th>잠재력</th>
                    <th>출전</th>
                    <th>득점</th>
                    <th>도움</th>
                    <th>피로</th>
                    <th>연봉</th>
                    <th>계약</th>
                    <th>선택</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((p) => {
                    const stats = scope === 'career' ? p.career : p.season;
                    return (
                      <tr key={p.id}>
                        <td title={positionsLabel(p.positions)}>{p.position}</td>
                        <td>
                          <PlayerLink id={p.id} name={p.name} scope={scope} />
                          <small>
                            {' '}
                            {p.status === 'retired'
                              ? '은퇴'
                              : p.status === 'sold'
                                ? '이적'
                                : p.loanUntil
                                  ? '임대'
                                  : ''}
                          </small>
                        </td>
                        <td>{overall(p)}</td>
                        <td>{p.status === 'active' ? p.adaptation.toFixed(2) : '—'}</td>
                        <td>{p.status === 'active' ? w.year - p.born : `${p.born}년생`}</td>
                        <td>{number(p.potential)}</td>
                        <td>
                          {ofScope(tallies[p.id]?.apps, scope)}
                          {ofScope(tallies[p.id]?.sub, scope) > 0 &&
                            ` (교체 ${ofScope(tallies[p.id]?.sub, scope)})`}
                        </td>
                        <td>{stats[0]}</td>
                        <td>{stats[1]}</td>
                        <td>{number(p.fatigue)}</td>
                        <td>
                          {p.status === 'active' ? (
                            <Money value={p.wage} code={c.country} year={w.year} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{p.until}</td>
                        <td>
                          {work !== 'contracts' && canSetStance(p) && (
                            <StanceBadge
                              player={p}
                              disabled={disabled}
                              onOpen={() => setStanceId(p.id)}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </details>
        <div className={s.panelFoot}>
          감독이 포메이션 자리마다 실효 능력과 피로를 따져 선발을 고르고, 부상 선수는 빼요. 선수마다
          {work === 'contracts'
            ? '계약 협상이 열려 있으면 하한과 기간, 비용을 확인하고 답변할 수 있어요.'
            : '이적 상태 뱃지(이적 명단·협상 가능·이적 불가)를 눌러 바꿀 수 있어요.'}{' '}
          제안은 이적시장 기간에 실제 구단이 보내고, 수락해야 이적이 성사돼요. 최소 14명·골키퍼
          1명을 유지해야 해요. 지금: {window.label}
        </div>
      </Panel>
      {!work && <TalkRulePanel w={w} client={client} />}
      {comparing && (
        <PlayerComparison
          w={w}
          client={client}
          initialScope={scope}
          onClose={() => setComparing(false)}
        />
      )}
      {stancePlayer && (
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
      )}
      {talkPlayer && talk && (
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
      )}
    </>
  );
}
function EconomicContext({ state }: { state: ClientState }) {
  const w = state.view!.world,
    c = w.clubs.find((club) => club.id === w.playerClub)!,
    cp = priceIndex(c.country, w.year);
  return (
    <Panel title="돈의 시대, 기록의 기준" note={cp.status.toUpperCase()}>
      <div className={s.panelBody}>
        <p>
          현재 화폐 {w.currency} · 물가지수 {cp.value.toFixed(2)}
        </p>
        <p className={s.muted}>
          {cp.source} ·{' '}
          {cp.status === 'observed'
            ? '실제 관측 자료'
            : cp.status === 'estimated'
              ? '영국 역사 지수에 연결한 추정치'
              : '최근 관측 이후 연 2% 가정'}
        </p>
        <p className={s.muted}>
          현금과 고정 계약은 물가에 맞춰 자동으로 불어나지 않습니다. 과거 장부에는 거래 당시의
          화폐와 금액을 보존합니다.
        </p>
      </div>
    </Panel>
  );
}
/**
 * The owner office (→WEB-39). A view asked for while it shows lands in the address and reopens
 * the office on it; from elsewhere the address already carries it.
 */
function Business({ state, client, controller }: Props & { controller: ProgressionController }) {
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
        controller={controller}
        state={state}
        client={client}
        legacy={<EconomicContext state={state} />}
        personnel={(desk, scoped, request, error) =>
          request ? (
            <PersonnelRequest
              key={`${request.world}:${request.item.id}`}
              request={request}
              state={state}
              client={scoped}
              controller={controller}
              error={error}
            />
          ) : (
            <OfficePersonnelWork
              key={`${state.view!.world.id}:${desk}`}
              desk={desk}
              controller={controller}
              state={state}
              client={scoped}
            />
          )
        }
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
  if (page === 'firstTeam' || page === 'staff')
    return (
      <PersonnelHub
        key={`${state.view!.world.id}:${page}`}
        page={page}
        state={state}
        client={client}
        panel={(tab, replace) => (
          <PersonnelPanel tab={tab} state={state} client={client} onReplace={replace} />
        )}
        market={(close) => <ManagerMarket state={state} client={client} onClose={close} />}
      />
    );
  if (page === 'training') return <TrainingView state={state} client={client} view="training" />;
  if (page === 'academy') return <TrainingView state={state} client={client} view="academy" />;
  if (page === 'business')
    return <Business state={state} client={client} controller={controller} />;
  return (
    <Suspense
      fallback={
        <div className={s.loading} role="status">
          클럽 기록실을 여는 중…
        </div>
      }
    >
      <RecordsRoom state={state} client={client} />
    </Suspense>
  );
}
