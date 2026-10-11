import { Select } from './Select';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  MatchRecord,
  Player,
  Role,
  TransferStance,
  World,
} from '../../../../packages/contracts/src/types';
import { priceIndex, country, currency } from '../../../../packages/catalogs/src/index';
import { injuryDaysLeft, quote, tacticLabel, overall } from '../../../../packages/engine/src/world';
import { ratio } from '../../../../packages/engine/src/primitives';
import { useGameState } from '../runtime/store';
import type { ClientState, GameClient } from '../runtime/client';
import type { Reply } from '../runtime/protocol';
import { Panel } from './App';
import { RecruitmentDesk } from './RecruitmentDesk';
import { BusinessWorkbench } from './BusinessWorkbench';
import { PolicyBoard } from './PolicyBoard';
import { FinanceOutlook } from './FinanceOutlook';
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
import { useNavigation, useSquadView, type Page, type SquadTab } from './state';
import { AcademyView, CoachingPlan, CoachingStaff, Delegation } from './ClubStaff';
import { Chart } from './Chart';
import { Pitch } from './Pitch';
import { archivePlayback } from './replay';
import { explorePlayers, type PlayerOrder, type PlayerScope } from './playerAnalysis';
import { PlayerPerformance } from './PlayerPerformance';
import { PlayerAdvancedStats } from './PlayerAdvancedStats';
import { StyleCard } from './StyleCard';
import { BuildBoard } from './BuildBoard';
import { RemedySheet } from './RemedySheet';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import type { StateKey } from './teamState';
import { PlayerComparison } from './PlayerComparison';
import { SeasonAnalysis } from './SeasonAnalysis';
import { CareerRecordBook } from './CareerRecordBook';
import { ClubTrends } from './ClubTrends';
import { AnalysisExport } from './AnalysisExport';
import { money, number, percent, seasonName, kindLabel } from './format';
import s from './App.module.css';
type Props = { state: ClientState; client: GameClient };
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
/** Squad, market and manager are one group, so the segment control routes between them. */
function SquadSegments({ current, players }: { current: SquadTab | 'manager'; players: number }) {
  const { setPage } = useNavigation();
  const setTab = useSquadView((state) => state.setTab);
  const go = (target: SquadTab | 'manager') => {
    if (target === 'manager') setPage('manager');
    else {
      setTab(target);
      setPage('squad');
    }
  };
  return (
    <div className={s.segments} role="group" aria-label="선수단 메뉴">
      {(
        [
          ['roster', `선수단 ${players}/26`],
          ['academy', '유소년'],
          ['manager', '스태프'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          aria-pressed={current === id}
          className={current === id ? s.selected : undefined}
          onClick={() => go(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function Attributes({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className={s.attributes}>
      {rows.map(([label, v]) => (
        <div className={s.attribute} key={label}>
          <span>{label}</span>
          <b>{typeof v === 'number' ? Math.round(v) : v}</b>
        </div>
      ))}
    </div>
  );
}
function ManagerView({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [tactic, setTactic] = useState(w.tactic),
    [tone, setTone] = useState('respect'),
    [hiring, setHiring] = useState<number>(),
    [requests, setRequests] = useState<StateKey>();
  const acting = useGameState((state) => !!state.pendingActions);
  const disabled = state.busy || state.readonly || acting;
  const response = w.events.filter((e) => e.kind === 'manager-response').at(-1);
  return (
    <>
      <Header
        eyebrow="SQUAD · STAFF"
        title="스태프"
        description="감독과 코치진이 선발·전술·훈련·유소년을 운영해요. 구단주는 사람을 고르고, 맡길 일을 정해요."
      >
        <SquadSegments
          current="manager"
          players={w.players.filter((p) => p.status === 'active').length}
        />
      </Header>
      <CoachingPlan w={w} />
      <CoachingStaff w={w} client={client} />
      <Delegation w={w} client={client} />
      <div className={s.twoCols}>
        <Panel title={m.name} note={m.interim ? 'INTERIM MANAGER' : 'FIRST TEAM MANAGER'}>
          <div className={s.panelBody}>
            <span className={s.pill}>
              {m.since}년 부임 · {m.until}년까지
            </span>
            <StyleCard style={m.interim ? undefined : m.style} />
            <div className={s.actions}>
              <button onClick={() => setRequests('manager')}>감독에게 힘 실어주기</button>
              <button onClick={() => setRequests('morale')}>선수단 분위기 요청</button>
            </div>
            <Attributes
              rows={[
                ['철학', tacticLabel[m.philosophy]],
                ['지도력', m.ability],
                ['유소년 육성', m.youth],
                ['유연성', m.flexibility],
                ['자존심', m.pride],
                ['신뢰', m.trust],
                ['불만 누적', m.conflicts],
                ['연봉', money(m.wage, c.country, w.year)],
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
                <p>훈련 지원 {money(quote(c.country, w.year, 30), c.country, w.year)} 필요</p>
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
      <Panel title="감독 후보 · 네 가지 성향" note="COMPARE FOUR SCHOOLS">
        <div className={s.panelBody}>
          <div className={s.cards}>
            {v.managers.map((candidate, i) => {
              const fee = (
                BigInt(candidate.fee) + (m.interim ? 0n : BigInt(ratio(m.wage, 1n, 4n)))
              ).toString();
              return (
                <article className={s.card} key={candidate.id}>
                  <h3>{candidate.name}</h3>
                  <span className={s.pill}>
                    {STYLE_INFO[candidate.style].label} · {tacticLabel[candidate.philosophy]}
                  </span>
                  <StyleCard style={candidate.style} compact />
                  <Attributes
                    rows={[
                      ['지도력', candidate.ability],
                      ['유소년 육성', candidate.youth],
                      ['유연성', candidate.flexibility],
                      ['자존심', candidate.pride],
                      ['야망', candidate.ambition],
                      ['연봉', money(candidate.wage, c.country, w.year)],
                    ]}
                  />
                  <p>
                    계약 {candidate.until}년까지 · 즉시 지출 {money(fee, c.country, w.year)} (이전
                    감독 보상 포함)
                  </p>
                  <button disabled={disabled || candidate.id === m.id} onClick={() => setHiring(i)}>
                    {candidate.id === m.id ? '현재 감독' : '감독 선임'}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </Panel>
      {requests && (
        <RemedySheet
          w={w}
          client={client}
          state={requests}
          onClose={() => setRequests(undefined)}
        />
      )}
      {hiring !== undefined && v.managers[hiring] && (
        <Dialog label="감독 선임 확인" onClose={() => setHiring(undefined)}>
          <h2>{v.managers[hiring].name} 감독을 선임할까요?</h2>
          <ul className={s.consequences}>
            <li>
              즉시 지출{' '}
              <b>
                {money(
                  (
                    BigInt(v.managers[hiring].fee) +
                    (m.interim ? 0n : BigInt(ratio(m.wage, 1n, 4n)))
                  ).toString(),
                  c.country,
                  w.year,
                )}
              </b>{' '}
              (이전 감독 보상 포함)
            </li>
            <li>{m.name} 감독은 오늘 팀을 떠나요.</li>
            <li>
              새 감독 성향 <b>{STYLE_INFO[v.managers[hiring].style].label}</b> ·{' '}
              {[
                ...STYLE_INFO[v.managers[hiring].style].pros,
                ...STYLE_INFO[v.managers[hiring].style].cons,
              ].join(' · ')}
            </li>
            <li>
              적용 전술 {tacticLabel[w.tactic]} →{' '}
              <b>{tacticLabel[v.managers[hiring].philosophy]}</b> (새 감독의 철학)
            </li>
            <li>
              연봉 {money(v.managers[hiring].wage, c.country, w.year)} · 계약{' '}
              {v.managers[hiring].until}년까지
            </li>
          </ul>
          <div className={s.actions}>
            <button onClick={() => setHiring(undefined)}>취소</button>
            <button
              className={s.primary}
              disabled={disabled}
              onClick={() => {
                void client.command({ type: 'hire', candidate: hiring });
                setHiring(undefined);
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
/** Injury and retirement at a glance on a roster card; the stance badge shows the market. */
function PlayerFlags({ w, player }: { w: World; player: Player }) {
  const out = injuryDaysLeft(w, player);
  const flags = [
    out > 0 && player.injury ? `부상 · ${player.injury.label} · ${Math.ceil(out / 7)}주` : '',
    player.retiring !== undefined ? '시즌 후 은퇴' : '',
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
    format = (amount: string) => money(amount, c.country, w.year);
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
        ? `거액 제안도 지켜요 · 이적 기조 ${card} (자금 위기면 매각)`
        : `거액 제안은 스태프가 감독과 상의해요 · 이적 기조 ${card} 기준 ${UNTOUCHABLE_PRICE[market ?? 'standard']}%, 자금 사정과 주전 여부로 조정`
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
        {money(playerValue(w, player), c.country, w.year)}
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
function Squad({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    tab = useSquadView((state) => state.tab),
    [selectedId, setSelectedId] = useState<string>(),
    [scope, setScope] = useState<PlayerScope>('season'),
    [role, setRole] = useState<Role | 'all'>('all'),
    [order, setOrder] = useState<PlayerOrder>('roster'),
    [minutes, setMinutes] = useState(0),
    [comparing, setComparing] = useState(false),
    [fullTable, setFullTable] = useState(false),
    [playerQuery, setPlayerQuery] = useState(''),
    [playerPage, setPlayerPage] = useState(0),
    [stanceId, setStanceId] = useState<string>();
  const acting = useGameState((state) => !!state.pendingActions);
  const disabled = state.busy || state.readonly || acting;
  const active = w.players.filter((p) => p.status === 'active');
  const window = transferWindow(w);
  const selected = w.players.find((p) => p.id === selectedId);
  const stancePlayer = w.players.find((p) => p.id === stanceId && canSetStance(p));
  const listed = explorePlayers(w.players, { scope, role, order, query: playerQuery, minutes });
  const lastPage = Math.max(0, Math.ceil(listed.length / 25) - 1),
    shownPage = Math.min(playerPage, lastPage),
    visiblePlayers = listed.slice(shownPage * 25, (shownPage + 1) * 25);
  return (
    <>
      <Header
        eyebrow="SQUAD"
        title={tab === 'academy' ? '유소년' : '선수단'}
        description={
          tab === 'academy'
            ? '아카데미에서 키운 유망주를 1군으로 올려요. 유스 디렉터가 입단 수준과 성장을 좌우해요.'
            : '능력·피로·잠재력을 보고 매각을 결정해요. 선발과 기용은 감독이 맡아요.'
        }
      >
        <SquadSegments current={tab} players={active.length} />
      </Header>
      {tab === 'academy' && <AcademyView w={w} client={client} />}
      {tab === 'roster' && (
        <div className={s.filters}>
          <button onClick={() => setComparing(true)}>우리 선수 비교</button>
          <label>
            지표 범위{' '}
            <Select
              aria-label="선수 지표 범위"
              value={scope}
              onValueChange={(value) => {
                setScope(value as PlayerScope);
                setPlayerPage(0);
              }}
            >
              <option value="season">현재 시즌 · 모든 대회</option>
              <option value="career">우리 클럽 통산</option>
            </Select>
          </label>
        </div>
      )}
      {tab === 'roster' ? (
        <Panel title="우리 클럽의 선수들" note="GK · DEF · MID · FWD">
          <div className={s.filters} style={{ padding: '12px 16px' }}>
            <label>
              포지션{' '}
              <Select
                aria-label="선수 포지션 필터"
                value={role}
                onValueChange={(value) => {
                  setRole(value as Role | 'all');
                  setPlayerPage(0);
                }}
              >
                <option value="all">전체</option>
                {(['GK', 'DEF', 'MID', 'FWD'] as const).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              정렬{' '}
              <Select
                aria-label="우리 선수 정렬"
                value={order}
                onValueChange={(value) => {
                  setOrder(value as PlayerOrder);
                  setPlayerPage(0);
                }}
              >
                <option value="roster">선수단 순서</option>
                <option value="ability">능력 높은 순</option>
                <option value="minutes">출전 분 많은 순</option>
                <option value="fatigue">피로 낮은 순</option>
                <option value="goals90">90분당 득점 높은 순</option>
              </Select>
            </label>
            <label>
              최소 표본{' '}
              <Select
                aria-label="최소 출전 분"
                value={minutes}
                onValueChange={(value) => {
                  setMinutes(Number(value));
                  setPlayerPage(0);
                }}
              >
                {[0, 90, 180, 450, 900].map((value) => (
                  <option value={value} key={value}>
                    {value ? `${value}분 이상` : '제한 없음'}
                  </option>
                ))}
              </Select>
            </label>
          </div>
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
          <div className={s.rosterCards}>
            {visiblePlayers.map((p) => (
              <article key={p.id}>
                <button onClick={() => setSelectedId(p.id)}>
                  <span>{p.role}</span>
                  <b>{p.name}</b>
                  <small>
                    {p.status === 'active'
                      ? `${w.year - p.born}세 · 능력 ${overall(p)} / 잠재력 ${Math.round(p.potential)}`
                      : p.status === 'retired'
                        ? '은퇴 · 클럽 기록 보존'
                        : '이적 · 클럽 기록 보존'}
                  </small>
                  {p.status === 'active' && <PlayerFlags w={w} player={p} />}
                </button>
                <div>
                  <b>피로 {Math.round(p.fatigue)}</b>
                  <small>성장 +{(p.developed || 0).toFixed(2)}</small>
                </div>
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
                      <th>나이</th>
                      <th>공격</th>
                      <th>패스</th>
                      <th>수비</th>
                      <th>잠재력</th>
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
                            <button onClick={() => setSelectedId(p.id)}>{p.name}</button>
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
                          <td>{p.status === 'active' ? w.year - p.born : `${p.born}년생`}</td>
                          <td>{number(p.attack)}</td>
                          <td>{number(p.passing)}</td>
                          <td>{number(p.defense)}</td>
                          <td>{number(p.potential)}</td>
                          <td>{stats[0]}</td>
                          <td>{stats[1]}</td>
                          <td>{number(p.fatigue)}</td>
                          <td>{p.status === 'active' ? money(p.wage, c.country, w.year) : '—'}</td>
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
      {selected && (
        <Dialog label="선수 상세 기록" onClose={() => setSelectedId(undefined)}>
          <h2>{selected.name}</h2>
          <p>
            {selected.role} ·{' '}
            {selected.status === 'active'
              ? `${w.year - selected.born}세`
              : `${selected.born}년생 · ${selected.status === 'retired' ? '은퇴' : '매각'}`}
          </p>
          <PlayerPerformance player={selected} scope={scope} />
          <Attributes
            rows={[
              ['득점', selected[scope][0]],
              ['도움', selected[scope][1]],
              ['누적 출전 분', selected[scope][10]],
              ['패스 성공률', percent(selected[scope][3], selected[scope][2])],
              ['슈팅', selected[scope][4]],
              ['유효 슈팅', selected[scope][5]],
              ['태클', selected[scope][6]],
              ['인터셉트', selected[scope][7]],
              ['돌파', selected[scope][8]],
              ['선방', selected[scope][9]],
            ]}
          />
          <p>
            분모: 패스 시도 {number(selected[scope][2])}회 ·{' '}
            {scope === 'career' ? '우리 클럽 통산' : '이번 시즌 모든 대회'}
          </p>
          <PlayerAdvancedStats w={w} player={selected} scope={scope} />
          <button onClick={() => setSelectedId(undefined)}>닫기</button>
        </Dialog>
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
function History({ state, client }: Props) {
  const w = state.view!.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [year, setYear] = useState(w.year),
    [archiveResult, setArchiveResult] = useState<{
      year: number;
      revision: number;
      data?: Reply['archive'];
      error?: string;
    }>(),
    [match, setMatch] = useState<MatchRecord>(),
    [filter, setFilter] = useState('all'),
    [historicalCode, setHistoricalCode] = useState(c.country),
    [tier, setTier] = useState(0),
    [historicalGroup, setHistoricalGroup] = useState(0);
  useEffect(() => {
    let valid = true;
    void client
      .archive(year)
      .then((result) => {
        if (valid)
          setArchiveResult({
            year,
            revision: w.revision,
            data: result,
            error: result ? undefined : '시즌 기록을 읽지 못했어요. 시즌을 다시 선택해보세요.',
          });
      })
      .catch(() => {
        if (valid)
          setArchiveResult({
            year,
            revision: w.revision,
            error: '시즌 기록을 읽지 못했어요. 시즌을 다시 선택해보세요.',
          });
      });
    return () => {
      valid = false;
    };
  }, [client, year, w.revision]);
  const loaded =
    archiveResult?.year === year && archiveResult?.revision === w.revision
      ? archiveResult
      : undefined;
  const archive = loaded?.data;
  const matches = archive?.matches.filter((m) => filter === 'all' || m.kind === filter) || [],
    h = archive?.season;
  const rows =
    h?.standings
      .filter(
        (row) =>
          w.clubs[row[0]].country === historicalCode &&
          row[1] === tier &&
          row[2] === historicalGroup,
      )
      .sort((a, b) => b[3] - a[3] || b[4] - b[5] - (a[4] - a[5]) || b[4] - a[4] || a[0] - b[0]) ||
    [];
  const f = (n: string, y = year) => money(n, c.country, y);
  return (
    <>
      <Header
        eyebrow="ARCHIVE"
        title="클럽 기록실"
        description="시즌과 선수, 경기와 장부. 그때의 숫자를 그대로 펼쳐봐요."
      />
      <CareerRecordBook w={w} />
      <ClubTrends w={w} />
      <div className={s.twoCols}>
        <Panel title="서포터의 성장">
          <div className={s.panelBody}>
            <Chart
              label="서포터"
              values={w.history.map((h) => h.fans)}
              labels={w.history.map((h) => String(h.year))}
            />
          </div>
        </Panel>
        <Panel title="현재 물가로 본 시즌 말 자금">
          <div className={s.panelBody}>
            <Chart
              label="현재 물가 기준 자금"
              values={w.history.map(
                (h) =>
                  Number(
                    ratio(
                      h.cash,
                      BigInt(quote(c.country, w.year, 10000)),
                      BigInt(quote(c.country, h.year, 10000)),
                    ),
                  ) / currency(c.country, w.year).units,
              )}
              labels={w.history.map((h) => String(h.year))}
            />
            <p className={s.muted}>
              물가와 화폐 전환을 보정해 지금 돈으로 환산했어요. 초기 국가 자료가 없으면 영국 지수
              추정을 씁니다. 실험 전후 변화는 인과관계의 증명이 아닙니다.
            </p>
          </div>
        </Panel>
        <Panel title="감독들이 남긴 계절">
          <div className={s.panelBody}>
            <ul className={s.timeline}>
              {archive?.managers
                .filter((e) => e.kind === 'manager-hire' || e.kind === 'manager-departure')
                .map((e, i) => (
                  <li key={i}>
                    <small>
                      {e.year} · ROUND {e.round}
                    </small>
                    <b>{e.title}</b>
                    <p>{e.detail}</p>
                  </li>
                ))}
              <li>
                <b>{w.manager.name} · 현재</b>
                <p>
                  {w.manager.since}년부터 · {tacticLabel[w.manager.philosophy]}
                </p>
              </li>
            </ul>
          </div>
        </Panel>
      </div>
      <div className={s.filters}>
        <label>
          시즌{' '}
          <Select
            aria-label="기록 시즌"
            value={year}
            onValueChange={(value) => setYear(Number(value))}
          >
            {[...w.history.map((h) => h.year), w.year].reverse().map((y) => (
              <option key={y} value={y}>
                {seasonName(y)}
                {y === w.year ? ' 진행 중' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label>
          대회 범위{' '}
          <Select
            aria-label="기록 대회 범위"
            value={filter}
            onValueChange={(value) => setFilter(value)}
          >
            <option value="all">모든 대회</option>
            {Object.entries(kindLabel).map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        <span className={s.pill}>
          {matches.length}경기 · 전체 {state.view!.totalMatches}경기 보존
        </span>
      </div>
      {h && (
        <div className={s.stats}>
          {[
            ['리그 성적', `${h.tier + 1}부 ${h.rank}위 · ${h.points}pts`],
            ['서포터', number(h.fans)],
            ['당시 자금', f(h.cash)],
            ['당시 손익', f((BigInt(h.income) - BigInt(h.expense)).toString())],
          ].map(([label, value]) => (
            <div className={s.stat} key={label}>
              <div className={s.label}>{label}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {archive ? (
        <SeasonAnalysis
          records={matches}
          club={w.playerClub}
          year={year}
          scope={filter === 'all' ? '모든 대회' : kindLabel[filter]}
        />
      ) : (
        <p className={s.muted} role={loaded?.error ? 'alert' : 'status'}>
          {loaded?.error || '선택한 시즌 기록을 펼치는 중…'}
        </p>
      )}
      <AnalysisExport
        w={w}
        records={matches}
        year={year}
        scope={filter === 'all' ? '모든 대회' : kindLabel[filter]}
        ready={!!archive}
      />
      <Panel title="경기의 페이지" note={seasonName(year)}>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>라운드</th>
                <th>홈 클럽</th>
                <th>결과</th>
                <th>원정 클럽</th>
                <th>대회</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>{m.round}</td>
                  <td>{w.clubs.find((c) => c.id === m.home)?.name}</td>
                  <td>
                    <b>
                      {m.score.home}–{m.score.away}
                    </b>
                  </td>
                  <td>{w.clubs.find((c) => c.id === m.away)?.name}</td>
                  <td>{kindLabel[m.kind]}</td>
                  <td>
                    <button onClick={() => setMatch(m)}>경기 기록 보기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {archive && !matches.length && (
            <div className={s.empty}>아직 기록된 경기가 없습니다.</div>
          )}
        </div>
      </Panel>
      {h && (
        <>
          <Panel title="클럽대항전 우승과 순위" note="HISTORICAL HONORS">
            <div className={s.panelBody}>
              {h.europe.length ? (
                h.europe.map((e) => (
                  <details key={e.kind} style={{ marginBottom: 14 }}>
                    <summary>
                      <b>{e.name}</b> · {w.clubs.find((c) => c.id === e.winner)?.name} 우승 ·{' '}
                      {e.field}팀
                    </summary>
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>참가 클럽</th>
                            <th>경기</th>
                            <th>승점</th>
                            <th>득점</th>
                            <th>실점</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.standings?.map((row) => (
                            <tr key={row[0]}>
                              <td>{row[1]}</td>
                              <td>{w.clubs[row[0]].name}</td>
                              <td>{row[2]}</td>
                              <td>{row[3]}</td>
                              <td>{row[4]}</td>
                              <td>{row[5]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {e.secondStandings && (
                      <p className={s.muted}>
                        2차 조별 단계 {e.secondStandings.length}개 클럽 기록도 저장되어 있습니다.
                      </p>
                    )}
                  </details>
                ))
              ) : (
                <p className={s.muted}>아직 클럽대항전 창설 이전의 시즌입니다.</p>
              )}
            </div>
          </Panel>
          <Panel title="그해의 각국 리그">
            <div className={s.panelBody}>
              <div className={s.filters}>
                <label>
                  국가{' '}
                  <Select
                    aria-label="과거 국가"
                    value={historicalCode}
                    onValueChange={(value) => {
                      setHistoricalCode(value);
                      setTier(0);
                      setHistoricalGroup(0);
                    }}
                  >
                    {h.champions.map((ch) => (
                      <option key={ch.country} value={ch.country}>
                        {country(ch.country).name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  디비전{' '}
                  <Select
                    aria-label="과거 디비전"
                    value={tier}
                    onValueChange={(value) => {
                      setTier(Number(value));
                      setHistoricalGroup(0);
                    }}
                  >
                    {country(historicalCode).groups.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}부
                      </option>
                    ))}
                  </Select>
                </label>
                {country(historicalCode).groups[tier].length > 1 && (
                  <label>
                    지역 그룹{' '}
                    <Select
                      aria-label="과거 지역 그룹"
                      value={historicalGroup}
                      onValueChange={(value) => setHistoricalGroup(Number(value))}
                    >
                      {country(historicalCode).groups[tier].map((_, i) => (
                        <option key={i} value={i}>
                          {String.fromCharCode(65 + i)}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <p className={s.muted}>
                리그 우승{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.club,
                  )?.name
                }{' '}
                · 국내 컵{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.cup,
                  )?.name
                }
              </p>
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>클럽</th>
                      <th>그룹</th>
                      <th>승점</th>
                      <th>득점</th>
                      <th>실점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row[0]}
                        className={w.clubs[row[0]].id === w.playerClub ? s.own : undefined}
                      >
                        <td>{i + 1}</td>
                        <td>{w.clubs[row[0]].name}</td>
                        <td>{String.fromCharCode(65 + row[2])}</td>
                        <td>{row[3]}</td>
                        <td>{row[4]}</td>
                        <td>{row[5]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </>
      )}
      <Panel title="그해의 결정들">
        <div className={s.panelBody}>
          <ul className={s.timeline}>
            {archive?.events
              .filter((e) => e.kind !== 'gate')
              .map((e, i) => (
                <li key={i}>
                  <small>
                    {e.year} · ROUND {e.round}{' '}
                    {e.amount && `· ${e.amount} ${e.currency} (원래 최소 단위)`}
                  </small>
                  <b>{e.title}</b>
                  <p>{e.detail}</p>
                </li>
              ))}
          </ul>
        </div>
      </Panel>
      {match && (
        <Dialog label="지난 경기 상세" onClose={() => setMatch(undefined)} wide>
          <button onClick={() => setMatch(undefined)}>닫기</button>
          <h2>
            {seasonName(match.year)} · {kindLabel[match.kind]}
          </h2>
          <Pitch playback={archivePlayback(match)} summary world={w} />
          <h3>선수별 기록 · 우리 클럽</h3>
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>득점</th>
                  <th>선수</th>
                  <th>도움</th>
                  <th>패스 성공/시도</th>
                  <th>슈팅/유효</th>
                  <th>태클</th>
                  <th>선방</th>
                </tr>
              </thead>
              <tbody>
                {match.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.metrics[0]}</td>
                    <td>{w.players.find((owned) => owned.id === p.id)?.name}</td>
                    <td>{p.metrics[1]}</td>
                    <td>
                      {p.metrics[3]}/{p.metrics[2]}
                    </td>
                    <td>
                      {p.metrics[4]}/{p.metrics[5]}
                    </td>
                    <td>{p.metrics[6]}</td>
                    <td>{p.metrics[9]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.muted}>
            전체 경기 기록은 보존됩니다. 과거 관전에서는 저장된 골 이벤트를 재생하며, 상세 분 단위
            패스와 이동 경로는 저장하지 않습니다.
          </p>
        </Dialog>
      )}
    </>
  );
}
export default function Rich({ state, client, page }: Props & { page: Page }) {
  if (page === 'manager') return <ManagerView state={state} client={client} />;
  if (page === 'squad') return <Squad state={state} client={client} />;
  if (page === 'transfers')
    return (
      <>
        <Header
          eyebrow="TRANSFERS"
          title="이적 시장"
          description="이적료가 있는 영입·임대·매각은 이적시장 기간에만 가능하고, 자유계약 선수는 언제든 영입해요."
        />
        <RecruitmentDesk state={state} client={client} />
      </>
    );
  if (page === 'business')
    return (
      <>
        <Header
          eyebrow="CLUB OPERATIONS"
          title="구단 운영"
          description="방침은 매 라운드 비용과 효과로 자동 정산되고, 투자와 계약은 한 번에 지출돼요."
        />
        <BuildBoard w={state.view!.world} client={client} />
        <FinanceOutlook w={state.view!.world} />
        <PolicyBoard w={state.view!.world} client={client} />
        <BusinessWorkbench
          state={state}
          client={client}
          legacy={<EconomicContext state={state} />}
        />
      </>
    );
  return <History state={state} client={client} />;
}
