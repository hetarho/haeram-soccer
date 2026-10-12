import { Select } from './Select';
import { lazy, Suspense, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type {
  ContractTalk,
  ContractTerm,
  ManagerTrait,
  Player,
  TransferStance,
  World,
} from '../../../../packages/contracts/src/types';
import { priceIndex } from '../../../../packages/catalogs/src/index';
import {
  injuryDaysLeft,
  quote,
  tacticLabel,
  overall,
  UNHAPPY_PENALTY,
} from '../../../../packages/engine/src/world';
import {
  marketWage,
  talkFor,
  talkRoundChance,
  talkUntil,
  UNHAPPY_CONFIG,
  UNHAPPY_REASON,
} from '../../../../packages/engine/src/contracts';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { UNHAPPY_MORALE } from '../../../../packages/engine/src/morale';
import { ratio } from '../../../../packages/engine/src/primitives';
import { useGameState } from '../runtime/store';
import type { ClientState, GameClient } from '../runtime/client';
import { Panel } from './App';
import { RecruitmentDesk } from './RecruitmentDesk';
import { OperationsView } from './Operations';
import {
  expectedOfferDays,
  LISTED_OFFER,
  playerValue,
  saleBar,
  STANCE_INFO,
  TRANSFER_STANCES,
  transferStance,
  transferWindow,
  UNTOUCHABLE_BAR,
  UNTOUCHABLE_PRICE,
} from '../../../../packages/engine/src/transfers';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { Dialog } from './Dialog';
import { OvrBadge } from './OvrBadge';
import {
  DEFAULT_ROSTER_VIEW,
  RosterFilters,
  rosterViewSummary,
  type RosterView,
} from './RosterFilters';
import {
  STAFF_TABS,
  useContractTalk,
  useSquadView,
  useStaffView,
  type Page,
  type SquadTab,
  type StaffRequest,
  type StaffTab,
} from './state';
import {
  AcademyView,
  CoachingPlan,
  CoachingStaff,
  Delegation,
  ManagerHireTerm,
  ManagerRenewal,
} from './ClubStaff';
import { appearances, explorePlayers, playerStatus } from './playerAnalysis';
import { PlayerLink } from './PlayerSheet';
import { Attributes } from './Attributes';
import { StyleCard } from './StyleCard';
import { RemedySheet } from './RemedySheet';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { MANAGER_TRAIT_INFO } from '../../../../packages/engine/src/staff';
import { managerRenewal } from '../../../../packages/engine/src/operations';
import {
  defaultManagerTerm,
  managerPayoff,
  managerTermLimit,
} from '../../../../packages/engine/src/ops-staff';
import { roundsUntilRefresh } from '../../../../packages/engine/src/managerMarket';
import { ClubLink } from './ClubLink';
import { runwayText, type StateKey } from './teamState';
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
function Header({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.pageHead}>
      <div>
        <div className={s.eyebrow}>{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
const SQUAD_HEADS: Record<SquadTab, { eyebrow: string; title: string; description: string }> = {
  roster: {
    eyebrow: 'SQUAD',
    title: '선수단',
    description: '능력·피로·잠재력을 보고 매각을 결정해요. 선발과 기용은 감독이 맡아요.',
  },
  academy: {
    eyebrow: 'SQUAD',
    title: '유소년',
    description:
      '아카데미에서 키운 유망주를 1군으로 올려요. 유스 디렉터가 입단 수준과 성장을 좌우해요.',
  },
  market: {
    eyebrow: 'TRANSFERS',
    title: '이적 시장',
    description:
      '이적료가 있는 영입·임대·매각은 이적시장 기간에만 가능하고, 자유계약 선수는 언제든 영입해요.',
  },
};
/**
 * The squad page's three views: the players we have, the academy and the market that brings more;
 * staff is its own destination in the navigation (→WEB-43).
 */
function SquadSegments({ current, players }: { current: SquadTab; players: number }) {
  const setTab = useSquadView((state) => state.setTab);
  return (
    <div className={s.segments} role="group" aria-label="선수단 메뉴">
      {(
        [
          ['roster', `선수단 ${players}/26`],
          ['academy', '유소년'],
          ['market', '이적 시장'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          aria-pressed={current === id}
          className={current === id ? s.selected : undefined}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
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
/**
 * The staff view in the page's address, so a reload keeps the tab; an old ?view=candidates opens
 * 감독 with the manager market (→WEB-40).
 */
function savedStaffView(): StaffRequest | undefined {
  const saved = new URLSearchParams(location.search).get('view');
  return saved === 'candidates' ? saved : STAFF_TABS.find(([id]) => id === saved)?.[0];
}
const tabOf = (view: StaffRequest): StaffTab => (view === 'candidates' ? 'manager' : view);
/**
 * The staff page as one tab bar instead of a long scroll: the manager first, whose 교체 opens the
 * market to replace him, then the coaching staff and what the staff decide for the owner.
 */
function ManagerView({ state, client }: Props) {
  const w = state.view!.world;
  const request = useStaffView((view) => view.request);
  const [tab, setTab] = useState<StaffTab>(() => tabOf(request ?? savedStaffView() ?? 'manager'));
  const [market, setMarket] = useState(() => (request ?? savedStaffView()) === 'candidates');
  useEffect(() => {
    if (!request) return;
    setTab(tabOf(request));
    if (request === 'candidates') setMarket(true);
    useStaffView.getState().take();
  }, [request]);
  useEffect(() => {
    const url = new URL(location.href);
    if (tab === 'manager') url.searchParams.delete('view');
    else url.searchParams.set('view', tab);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? STAFF_TABS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + STAFF_TABS.length) % STAFF_TABS.length;
    setTab(STAFF_TABS[next][0]);
    document.getElementById(`staff-tab-${STAFF_TABS[next][0]}`)?.focus();
  };
  return (
    <>
      <Header
        eyebrow="STAFF"
        title="스태프"
        description="감독과 코치진이 선발·전술·훈련·유소년을 운영해요. 구단주는 사람을 고르고, 맡길 일을 정해요. 젊은 감독과 코치는 잠재력까지 성장해요."
      />
      <div
        className={`${s.seasonTabs} ${s.operationsTabs}`}
        role="tablist"
        aria-label="스태프 보기"
      >
        {STAFF_TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`staff-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="staff-panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => keyboard(event, index)}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="staff-panel" role="tabpanel" aria-labelledby={`staff-tab-${tab}`}>
        {tab === 'manager' ? (
          <ManagerOffice state={state} client={client} onReplace={() => setMarket(true)} />
        ) : tab === 'coaches' ? (
          <>
            <CoachingPlan w={w} />
            <CoachingStaff w={w} client={client} />
          </>
        ) : (
          <Delegation w={w} client={client} />
        )}
      </div>
      {market && <ManagerMarket state={state} client={client} onClose={() => setMarket(false)} />}
    </>
  );
}
/** The manager's office: who he is and what he signed, and the owner's requests to him. */
function ManagerOffice({ state, client, onReplace }: Props & { onReplace: () => void }) {
  const w = state.view!.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [tactic, setTactic] = useState(w.tactic),
    [tone, setTone] = useState('respect'),
    [requests, setRequests] = useState<StateKey>();
  const acting = useGameState((state) => !!state.pendingActions);
  const disabled = state.busy || state.readonly || acting;
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
              <button onClick={() => setRequests('manager')}>감독에게 힘 실어주기</button>
              <button onClick={() => setRequests('morale')}>선수단 분위기 요청</button>
            </div>
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
          </div>
          <div className={s.panelFoot}>
            요청 결과는 성향·신뢰·말투·이전 갈등을 따릅니다. 동일 요청은 신뢰를 반복해서 높이지
            않습니다.
          </div>
        </Panel>
      </div>
      {requests && (
        <RemedySheet
          w={w}
          client={client}
          state={requests}
          onClose={() => setRequests(undefined)}
        />
      )}
    </>
  );
}
/**
 * The manager market behind 교체 (→STAFF-17, →WEB-40): free agents first, then the best managers
 * of our league and the division above, who cost compensation to their clubs. The list moves every
 * four rounds; hiring confirms on top of it and closes both.
 */
function ManagerMarket({ state, client, onClose }: Props & { onClose: () => void }) {
  const v = state.view!,
    w = v.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [hiring, setHiring] = useState<string>(),
    [term, setTerm] = useState<ContractTerm>(1);
  const acting = useGameState((state) => !!state.pendingActions);
  const disabled = state.busy || state.readonly || acting;
  const format = (value: bigint | string) => <Money value={value} code={c.country} year={w.year} />;
  // Replacing a contracted manager pays him 25% of his wage per season left; an interim leaves
  // freely.
  const payoff = BigInt(managerPayoff(w));
  const outlay = (candidate: (typeof v.managers)[number]) =>
    BigInt(candidate.fee) + BigInt(candidate.compensation ?? '0') + payoff;
  const chosen = v.managers.find((candidate) => candidate.id === hiring);
  const free = v.managers.filter((candidate) => candidate.source === 'free'),
    others = v.managers.filter((candidate) => candidate.source === 'club');
  const card = (candidate: (typeof v.managers)[number]) => (
    <article className={s.card} key={candidate.id}>
      <div className={s.personHead}>
        <OvrBadge value={candidate.ability} role="감독" potential={candidate.potential} large />
        <div>
          <h3>{candidate.name}</h3>
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
              계약금에 더해 그 구단에 연봉의 1.5배를 보상금으로 내요. 스태프는 다른 구단 감독을
              데려오지 않아요.
            </p>
            <div className={s.cards}>{others.map(card)}</div>
          </div>
        </Panel>
      </Dialog>
      {chosen && (
        <Dialog label="감독 선임 확인" onClose={() => setHiring(undefined)}>
          <h2>{chosen.name} 감독을 선임할까요?</h2>
          <ul className={s.consequences}>
            <li>
              즉시 지출 <b>{format(outlay(chosen))}</b> · 계약금 {format(chosen.fee)}
              {chosen.compensation && <> · 보상금 {format(chosen.compensation)}</>}
              {payoff > 0n && <> · 이전 감독 보상 {format(payoff)}</>}
            </li>
            {chosen.club && (
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
            <button onClick={() => setHiring(undefined)}>취소</button>
            <button
              className={s.primary}
              disabled={disabled}
              onClick={() => {
                void client.command({ type: 'hire', id: chosen.id, term });
                setHiring(undefined);
                onClose();
              }}
            >
              선임 확정
            </button>
          </div>
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
    player.retiring !== undefined ? '시즌 후 은퇴' : '',
    player.unhappy ? `언해피 · ${UNHAPPY_REASON[player.unhappy.reason]}` : '',
    player.transferRequest ? '이적 요청' : '',
  ].filter(Boolean);
  if (!flags.length) return null;
  return (
    <em className={s.playerFlags}>
      {flags.map((flag) => (
        <i key={flag}>{flag}</i>
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
      data-stance={stance}
      disabled={disabled}
      aria-label={`${player.name} 이적 상태 · ${STANCE_INFO[stance].label} · 바꾸기`}
      onClick={onOpen}
    >
      <i aria-hidden="true" />
      {STANCE_INFO[stance].label}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
/** What each stance does for this player, given who answers offers (→CLUB-22). */
function stanceConsequence(w: World, p: Player, stance: TransferStance) {
  const delegated = !!w.delegation?.transfers,
    value = playerValue(w, p),
    c = w.clubs.find((club) => club.id === w.playerClub)!,
    // Each stance reads as a sentence inside its own radio, so amounts come as text (→WEB-67).
    format = (amount: string) => compactMoney(amount, c.country, w.year);
  if (stance === 'listed')
    return {
      what: `이적시장 기간에 실제 구단이 평가 가치의 ${Math.round(LISTED_OFFER.low * 100)}–${Math.round(LISTED_OFFER.high * 100)}%로 제안해요 · 첫 제안까지 평균 약 ${expectedOfferDays(w, p)}일`,
      who: delegated
        ? '들어오는 제안은 스태프가 받아들여 매각해요'
        : '제안마다 구단주가 수락·거절해요',
    };
  if (stance === 'open')
    return {
      what: '다른 구단이 먼저 제안해 올 때 협상해요',
      who: delegated
        ? `스태프가 평가 가치의 ${saleBar(w, p).percent}% 이상이면 팔아요 · 대체 선수 없는 주전은 지켜요`
        : '제안마다 구단주가 수락·거절해요',
    };
  const market = buildOf(w).market,
    card = cardOf(buildOf(w), 'market').label;
  return {
    what: `평가 가치 ${UNTOUCHABLE_BAR}%(${format(ratio(value, BigInt(UNTOUCHABLE_BAR), 100n))}) 미만 제안은 바로 거절해요`,
    who: delegated
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
        {player.role} · {w.year - player.born}세 · 능력 {overall(player)} · 평가 가치{' '}
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
const TERMS: ContractTerm[] = [1, 2, 3, 4, 5];
/**
 * A contract talk (→WEB-68, CLUB-26): his demand and the floor he settles for, the term, the yearly
 * cost and the runway after it, and what a refusal risks (→CLUB-27). He accepts any offer at or
 * above the floor, so the owner offers the floor or declines; an unhappy player has only his
 * floor, as it stands today, to be met.
 */
function ContractTalkSheet({
  w,
  player,
  talk,
  disabled,
  onOffer,
  onDecline,
  onClose,
}: {
  w: World;
  player: Player;
  talk: ContractTalk;
  disabled: boolean;
  onOffer: (term: ContractTerm) => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState<ContractTerm>(2);
  const c = w.clubs.find((club) => club.id === w.playerClub)!,
    money = (value: string | bigint) => <Money value={value} code={c.country} year={w.year} />,
    raise = BigInt(talk.floor) - BigInt(player.wage),
    runway = fixedCostRunway(w.cash, (BigInt(operatingCosts(w).annual) + raise).toString()),
    chance = Math.round(talkRoundChance(w) * 100),
    label = talk.kind === 'renew' ? '재계약' : '연봉 인상';
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
          <button className={s.primary} disabled={disabled} onClick={() => onOffer(term)}>
            하한 <Money value={talk.floor} code={c.country} year={w.year} plain /> · {term}시즌 제시
          </button>
        </div>
      }
    >
      <h2>
        {player.name} {player.talk ? `${label} 협상` : '언해피 · 하한 제시'}
      </h2>
      <p>
        {player.role} · {w.year - player.born}세 · 능력 {overall(player)} · 지금 연봉{' '}
        {money(player.wage)} · {contractLine(player.until, w.year)}
      </p>
      {player.unhappy && (
        <p className={s.muted}>
          {UNHAPPY_REASON[player.unhappy.reason]}로 언해피예요. 하한 이상을 제시하면 풀리고
          {player.transferRequest ? ' 이적 요청도 거둬요' : ' 이적 요청을 하지 않아요'}.
        </p>
      )}
      <p>
        요구 {money(talk.demand)} · 하한 {money(talk.floor)} · 하한 이상이면 바로 합의해요.
      </p>
      <div className={s.segments} role="radiogroup" aria-label="계약 기간">
        {TERMS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={term === value}
            className={term === value ? s.selected : undefined}
            onClick={() => setTerm(value)}
          >
            {value}시즌
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
function Squad({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    tab = useSquadView((state) => state.tab),
    [view, setView] = useState<RosterView>(DEFAULT_ROSTER_VIEW),
    [comparing, setComparing] = useState(false),
    [fullTable, setFullTable] = useState(false),
    [playerQuery, setPlayerQuery] = useState(''),
    [playerPage, setPlayerPage] = useState(0),
    [stanceId, setStanceId] = useState<string>();
  const talkId = useContractTalk((state) => state.id),
    { open: openTalk, close: closeTalk } = useContractTalk.getState();
  const acting = useGameState((state) => !!state.pendingActions);
  const disabled = state.busy || state.readonly || acting;
  const active = w.players.filter((p) => p.status === 'active');
  const window = transferWindow(w);
  const stancePlayer = w.players.find((p) => p.id === stanceId && canSetStance(p));
  const talkPlayer = active.find((p) => p.id === talkId),
    talk = talkPlayer && talkFor(w, talkPlayer);
  const { scope } = view;
  const listed = explorePlayers(w.players, { ...view, query: playerQuery });
  const summary = rosterViewSummary(view);
  const lastPage = Math.max(0, Math.ceil(listed.length / 25) - 1),
    shownPage = Math.min(playerPage, lastPage),
    visiblePlayers = listed.slice(shownPage * 25, (shownPage + 1) * 25);
  return (
    <>
      <Header {...SQUAD_HEADS[tab]}>
        <SquadSegments current={tab} players={active.length} />
      </Header>
      {tab === 'academy' && <AcademyView w={w} client={client} />}
      {tab === 'market' && <RecruitmentDesk state={state} client={client} />}
      {tab === 'roster' && (
        <div className={s.filters}>
          <button onClick={() => setComparing(true)}>우리 선수 비교</button>
        </div>
      )}
      {tab === 'roster' ? (
        <Panel
          title="우리 클럽의 선수들"
          action={
            <RosterFilters
              view={view}
              onChange={(next) => {
                setView(next);
                setPlayerPage(0);
              }}
            />
          }
        >
          <label className={s.rosterSearch}>
            선수 찾기{' '}
            <input
              aria-label="선수 찾기"
              value={playerQuery}
              onChange={(event) => {
                setPlayerQuery(event.target.value);
                setPlayerPage(0);
              }}
              placeholder="이름으로 찾기"
            />
          </label>
          {summary.length > 0 && (
            <p className={s.rosterViewSummary} data-testid="roster-view-summary">
              {summary.join(' · ')}
            </p>
          )}
          <div className={s.rosterCards}>
            {visiblePlayers.map((p) => (
              <article key={p.id}>
                <div className={s.rosterBody}>
                  <OvrBadge value={overall(p)} role={p.role} />
                  <PlayerLink id={p.id} name={p.name} scope={scope} className={s.cardLink} />
                  <small>
                    {p.status === 'active' ? (
                      <>
                        {w.year - p.born}세 · 잠재력 {Math.round(p.potential)}
                        <br />
                        연봉 <Money value={p.wage} code={c.country} year={w.year} plain /> / 시장{' '}
                        <Money value={marketWage(w, p)} code={c.country} year={w.year} plain /> ·{' '}
                        {contractLine(p.until, w.year)}
                      </>
                    ) : (
                      `${playerStatus(p)} · 통산 ${appearances(p.career)}경기 ${p.career[0]}골`
                    )}
                  </small>
                  {p.status === 'active' && <PlayerFlags w={w} player={p} />}
                </div>
                <div>
                  <b>피로 {Math.round(p.fatigue)}</b>
                  <small>성장 +{(p.developed || 0).toFixed(2)}</small>
                </div>
                {p.status === 'active' && talkFor(w, p) && (
                  <button
                    type="button"
                    className={s.stanceBadge}
                    data-stance="listed"
                    disabled={disabled}
                    aria-label={`${p.name} 계약 협상 열기`}
                    onClick={() => openTalk(p.id)}
                  >
                    협상
                  </button>
                )}
                {canSetStance(p) && (
                  <StanceBadge player={p} disabled={disabled} onOpen={() => setStanceId(p.id)} />
                )}
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
              <button
                disabled={shownPage === lastPage}
                onClick={() => setPlayerPage(shownPage + 1)}
              >
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
                      <th>역할</th>
                      <th>선수</th>
                      <th>OVR</th>
                      <th>나이</th>
                      <th>공격</th>
                      <th>패스</th>
                      <th>수비</th>
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
                          <td>{p.role}</td>
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
                          <td>{p.status === 'active' ? w.year - p.born : `${p.born}년생`}</td>
                          <td>{number(p.attack)}</td>
                          <td>{number(p.passing)}</td>
                          <td>{number(p.defense)}</td>
                          <td>{number(p.potential)}</td>
                          <td>{appearances(stats)}</td>
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
                            {canSetStance(p) && (
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
            감독이 역할과 능력·피로에 따라 선발을 고르고, 부상 선수는 빼요. 선수마다 이적 상태
            뱃지(이적 명단·협상 가능·이적 불가)를 눌러 바꿀 수 있어요. 제안은 이적시장 기간에 실제
            구단이 보내고, 수락해야 이적이 성사돼요. 최소 14명·골키퍼 1명을 유지해야 해요. 지금:{' '}
            {window.label}
          </div>
        </Panel>
      ) : null}
      {comparing && (
        <PlayerComparison w={w} initialScope={scope} onClose={() => setComparing(false)} />
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
export default function Rich({ state, client, page }: Props & { page: Page }) {
  if (page === 'manager') return <ManagerView state={state} client={client} />;
  if (page === 'squad') return <Squad state={state} client={client} />;
  if (page === 'business')
    return (
      <>
        <Header
          eyebrow="CLUB OPERATIONS"
          title="구단 운영"
          description="운영 전략으로 방향과 씀씀이를 정하고, 재정에서 장부를, 시설·후원·캠페인에서 한 번 지출하고 오래 남는 결정을 해요."
        />
        <OperationsView state={state} client={client} legacy={<EconomicContext state={state} />} />
      </>
    );
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
