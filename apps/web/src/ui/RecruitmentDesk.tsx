import { squadRegistration } from './squadRegistration';
import { RecruitmentCommitments } from './MediationReview';
import { PlayerLink } from './PlayerSheet';
import { useTaskState } from './taskMemory';
import { Select } from './Select';
import { PixelIcon } from './PixelIcon';
import { useEffect, useRef, useState } from 'react';
import type {
  Line,
  TransferBid,
  World,
  WorldMarketTarget,
  WorldMarketOffer,
} from '../../../../packages/contracts/src/types';
import { POSITIONS } from '../../../../packages/contracts/src/player';
import type { Personality } from '../../../../packages/contracts/src/player';
import {
  lineOf,
  PERSONALITY_LABEL,
  POSITION_LABEL,
  ROLE_LABEL,
  TRAIT_LABEL,
} from '../../../../packages/engine/src/player';
import { releaseCost, staffMember } from '../../../../packages/engine/src/staff-info';
import { positionsLabel } from './FormationPitch';
import { gradeLabel, PlayerProfile } from './PlayerProfile';
import { bidBoard } from '../../../../packages/engine/src/transfers';
import { transferWindow } from '../../../../packages/engine/src/transfer-window';
import { bidKind, freeSigning, visibleBids } from './bids';
import { clubOf, overall } from '../../../../packages/engine/src/player-state';
import { recruitmentLineNeed } from '../../../../packages/engine/src/recruitment';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { compactMoney } from './format';
import { Money } from './Money';
import { OvrBadge } from './OvrBadge';
import { OfferAnswers } from './ClubStaff';
import { RecruitmentNeeds, ScoutShortlist } from './ScoutShortlist';
import { openCoachSheet, openDirection } from './state';
import { currentStepName } from './board';
import { clubDivision } from './league';
import {
  DEFAULT_MARKET_QUERY,
  changeMarketQuery,
  marketLeagueKey,
  marketLeagues,
  toggleMarketComparison,
  useMarketDetail,
  useMarketPage,
  type MarketDetail,
  type MarketQuery,
} from './worldMarket';
import s from './RecruitmentDesk.module.css';

type Candidate = MarketDetail;
function sourceLabel(w: World, offer: WorldMarketOffer) {
  if (!offer.source) return offer.freeAgent ? '자유계약 선수' : '스카우트 후보';
  const source = w.clubs.find((club) => club.id === offer.source!.club);
  return `${offer.source.name} · ${source ? clubDivision(w, source) : offer.source.country}`;
}
const lineNames: Record<Line, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
};
const BID_STATUS: Record<TransferBid['status'], string> = {
  pending: '응답 대기',
  accepted: '수락',
  rejected: '거절됨',
  countered: '역제안 받음',
  expired: '기한 만료',
  completed: '이적 완료',
};
const delta = (value: number) => (value > 0 ? `+${value}` : String(value));
const runway = (value: number) => (value >= 999 ? '999라운드 이상' : `${value}라운드`);

function CandidateCard({
  w,
  candidate,
  blocked,
  selected,
  onCompare,
  onRecruit,
  onBid,
  pending,
  actions = true,
}: {
  w: World;
  candidate: Candidate;
  blocked: boolean;
  selected: boolean;
  onCompare: () => void;
  onRecruit: (loan: boolean) => void;
  onBid: () => void;
  pending?: TransferBid;
  actions?: boolean;
}) {
  const { offer, buy, loan } = candidate,
    player = offer.player,
    club = clubOf(w);
  const cash = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const window = transferWindow(w);
  const scout = staffMember(w, 'scout')?.ability;
  return (
    <article
      data-surface="panel"
      className={s.card}
      data-testid={`candidate-${player.id}`}
      data-candidate-id={player.id}
      data-line={lineOf(player.position)}
    >
      <header className={s.cardHead}>
        <OvrBadge value={overall(player)} role={player.position} large />
        <div>
          <h3>{player.name}</h3>
          <span>
            {player.position} · {POSITION_LABEL[player.position]} · {w.year - player.born}세
          </span>
          <small className={s.positions} data-testid="candidate-positions">
            {positionsLabel(player.positions)}
          </small>
        </div>
        <button aria-pressed={selected} onClick={onCompare}>
          비교
        </button>
      </header>
      <div className={s.ability}>
        <span>
          잠재력 <b>{Math.round(player.potential)}</b>
        </span>
        <span>
          성장 여지 <b>+{Math.max(0, Math.round(player.potential) - overall(player))}</b>
        </span>
      </div>
      <p className={s.context}>
        {sourceLabel(w, offer)}
        {offer.own
          ? ' · 우리 선수 · 재영입할 수 없어요'
          : offer.recommended
            ? ' · 스카우트 추천'
            : ' · 직접 발굴'}
      </p>
      <p className={s.traits}>
        {player.traits.length
          ? player.traits.map((trait) => TRAIT_LABEL[trait]).join(' · ')
          : '특성 없음'}
      </p>
      <p className={s.personality} data-testid="candidate-personality">
        {(Object.keys(PERSONALITY_LABEL) as (keyof Personality)[])
          .map(
            (key) =>
              `${PERSONALITY_LABEL[key]} ${gradeLabel(player.personality[key], offer.own, scout)}`,
          )
          .join(' · ')}
      </p>
      {offer.available && (
        <>
          <div className={s.build} aria-label="영입 전력 변화">
            <div data-testid="candidate-slot">
              <span>
                {buy.slot.position} {ROLE_LABEL[buy.slot.role]} 자리 실효 OVR
              </span>
              <b>
                합류 {buy.slot.arrival} → 적응 후 {buy.slot.settled}
              </b>
            </div>
            <div>
              <span>{buy.manual ? '직접 교체 시 전력' : '자동 선발 전력'}</span>
              <b>
                {buy.beforeStrength} → {buy.afterStrength}{' '}
                <small>({delta(buy.strengthDelta)})</small>
              </b>
            </div>
            <div>
              <span>{buy.manual ? '직접 교체 시 적합도' : '전술 적합도'}</span>
              <b>
                {buy.beforeFit} → {buy.afterFit} <small>({delta(buy.fitDelta)})</small>
              </b>
            </div>
          </div>
          <p className={s.context}>
            {offer.foreign
              ? '해외에서 합류 · 적응에 시간이 필요해요. '
              : '국내에서 합류 · 적응에 시간이 필요해요. '}
            {buy.manual
              ? '수동 선발 교체 예시예요. 영입 후 선발을 직접 정해야 적용돼요.'
              : buy.willStart
                ? '현재 능력과 피로 기준의 자동 선발 후보예요.'
                : '현재 선발을 유지하며 로테이션 후보로 합류해요.'}
          </p>
        </>
      )}
      <dl className={s.costs}>
        <div>
          <dt>이적료</dt>
          <dd>{cash(offer.fee)}</dd>
        </div>
        <div>
          <dt>1시즌 임대료</dt>
          <dd>{cash(offer.loanFee)}</dd>
        </div>
        <div>
          <dt>반복 연봉</dt>
          <dd>{cash(player.wage)}</dd>
        </div>
        <div>
          <dt>계약 / 임대 반환</dt>
          <dd>
            {player.until}년 / {w.year + 1}년
          </dd>
        </div>
      </dl>
      {BigInt(offer.fee) === 0n && <p className={s.free}>이적료 없음 · 연봉은 계속 지급해요</p>}
      {offer.available && (
        <>
          <div className={s.budget}>
            <div>
              <span>영입 후 자금</span>
              <b>{cash(buy.cashAfter)}</b>
              <small>고정 지출 {runway(buy.runwayRounds)} 여유</small>
            </div>
            <div>
              <span>임대 후 자금</span>
              <b>{cash(loan.cashAfter)}</b>
              <small>고정 지출 {runway(loan.runwayRounds)} 여유</small>
            </div>
          </div>
          <p className={s.note}>
            연간 고정 지출 {cash(buy.annualAfter)} · 새 연봉 포함, 미래 수입 제외
          </p>
        </>
      )}
      {(!buy.eligible || !buy.affordable) && (
        <p className={s.note}>{offer.own ? '우리 선수는 재영입할 수 없어요.' : buy.reason}</p>
      )}
      {actions &&
        (pending ? (
          <p className={s.pending} data-testid="pending-bid">
            {pending.status === 'countered' ? (
              <>역제안 {cash(pending.counterFee || pending.fee)} · 알림·결정에서 답해 주세요</>
            ) : (
              <>
                협상 중 · 제안 {cash(pending.fee)} ·{' '}
                {Math.max(0, pending.due - (w.calendar?.day ?? 0))}일 안에 답이 와요
              </>
            )}
          </p>
        ) : (
          <div className={s.transactions}>
            <div>
              {offer.freeAgent ? (
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={blocked || !buy.eligible || !buy.affordable}
                  onClick={() => onRecruit(false)}
                >
                  {offer.available ? '자유계약 영입' : '계약 완료'}
                </button>
              ) : (
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={blocked || !offer.available || !window.open || !buy.eligible}
                  onClick={onBid}
                >
                  {offer.available ? '이적 제안' : '계약 완료'}
                </button>
              )}
              {offer.available && !offer.freeAgent && !window.open ? (
                <small>{window.label}</small>
              ) : (
                (!buy.eligible || !buy.affordable) && <small>{buy.reason}</small>
              )}
            </div>
            <div>
              <button
                disabled={
                  offer.freeAgent || blocked || !window.open || !loan.eligible || !loan.affordable
                }
                onClick={() => onRecruit(true)}
              >
                1시즌 임대
              </button>
              {offer.available && !offer.freeAgent && (
                <small>판매 구단이 2–4일 뒤 답해요. 수락 시 임대료와 연봉이 발생해요.</small>
              )}
              {offer.freeAgent ? (
                <small>자유계약 선수는 임대할 수 없어요. 자유계약 영입을 이용해 주세요.</small>
              ) : (
                (!loan.eligible || !loan.affordable) && <small>{loan.reason}</small>
              )}
            </div>
          </div>
        ))}
      {w.players.some((person) => person.id === player.id && person.status === 'active') && (
        <div className={s.transactions} aria-label="합류한 선수 관리">
          <PlayerLink id={player.id} name={player.name} />
          <button type="button" onClick={() => openCoachSheet('assistant', undefined, player.id)}>
            합류 선수 훈련 보기
          </button>
        </div>
      )}
      <details data-ui="disclosure" className={s.details}>
        <summary>능력 자세히</summary>
        <PlayerProfile w={w} player={player} own={offer.own} compact />
      </details>
    </article>
  );
}

export function RecruitmentDesk({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world,
    club = clubOf(w);
  const [query, setQuery] = useTaskState<MarketQuery>(
    w.id,
    'world-market-query',
    DEFAULT_MARKET_QUERY,
  );
  const changeQuery = (patch: Partial<MarketQuery>) =>
    setQuery((current) => changeMarketQuery(current, patch));
  const [comparison, setComparison] = useTaskState<WorldMarketTarget[]>(
    w.id,
    'world-market-comparison',
    [],
  );
  const [comparing, setComparing] = useTaskState(w.id, 'market-comparing', false);
  const [message, setMessage] = useState<{ world: string; text: string }>();
  const [bidding, setBidding] = useTaskState<
    { target: WorldMarketTarget; asking: string } | undefined
  >(w.id, 'world-market-bidding', undefined);
  const activeBid = useRef(bidding);
  activeBid.current = bidding;
  useEffect(() => {
    activeBid.current = bidding;
    return () => {
      activeBid.current = undefined;
    };
  }, [bidding]);
  const [viewing, setViewing] = useTaskState<WorldMarketTarget | undefined>(
    w.id,
    'world-market-viewing',
    undefined,
  );
  const [panel, setPanel] = useTaskState<'filters' | 'info' | 'negotiations' | undefined>(
    w.id,
    'market-panel',
    undefined,
  );
  const [step, setStep] = useTaskState(w.id, 'market-step', 1);
  const [expanded, setExpanded] = useTaskState(w.id, 'market-expanded', false);
  const registered = squadRegistration(w);
  const blocked = useGameState(gameActionsBlocked) || !!w.critical;
  const recommended = recruitmentLineNeed(w);
  const market = useMarketPage(client, w.id, w.revision, query);
  const page = market.value;
  const selectedComparison = comparison.filter((target) => target.world === w.id).slice(0, 2);
  const detail = useMarketDetail(client, w.id, w.revision, viewing);
  const comparisonA = useMarketDetail(
    client,
    w.id,
    w.revision,
    comparing ? selectedComparison[0] : undefined,
  );
  const comparisonB = useMarketDetail(
    client,
    w.id,
    w.revision,
    comparing ? selectedComparison[1] : undefined,
  );
  const asking = BigInt(bidding?.asking ?? '0');
  const steps = [80n, 100n, 115n, 130n];
  const fee = ((asking * steps[step]) / 100n).toString();
  const bidDetail = useMarketDetail(client, w.id, w.revision, bidding?.target, fee);
  const outlook = bidDetail.value?.bid;
  const leagues = marketLeagues(w.clubs);
  const leagueKey = query.league ? marketLeagueKey(query.league) : '';
  const teams = w.clubs.filter((team) => !leagueKey || marketLeagueKey(team) === leagueKey);
  const filtered = !!(
    query.name ||
    query.recommendedOnly ||
    query.league ||
    query.team ||
    query.position ||
    query.line ||
    query.fit === 'improves'
  );
  const toggle = (target: WorldMarketTarget) =>
    setComparison((current) => toggleMarketComparison(current, target));
  const currentWorld = () => client.state.view?.world.id === w.id;
  const currentActionsBlocked = () =>
    blocked || gameActionsBlocked(client.state) || !!client.state.view?.world.critical;
  const recruit = async (candidate: Candidate, loan: boolean) => {
    const preview = loan ? candidate.loan : candidate.buy;
    if (
      currentActionsBlocked() ||
      candidate.world !== w.id ||
      candidate.offer.own ||
      (loan && candidate.offer.freeAgent) ||
      !preview.eligible ||
      !preview.affordable ||
      !currentWorld() ||
      candidate.revision !== client.state.view?.world.revision
    )
      return;
    const reply = await client.command(
      candidate.offer.freeAgent
        ? { type: 'recruit', target: candidate.offer.target, loan: false }
        : {
            type: 'bid',
            target: candidate.offer.target,
            fee: loan ? candidate.offer.loanFee : candidate.offer.fee,
            loan,
          },
      { background: true },
    );
    if (!currentWorld()) return;
    setMessage({
      world: w.id,
      text: reply?.ok
        ? candidate.offer.freeAgent
          ? `${candidate.offer.player.name} 영입을 저장했어요.`
          : `${candidate.offer.player.name} 임대 제안을 보냈어요. 구단이 수락하면 계약이 완료돼요.`
        : client.state.error || '계약을 적용하지 못했어요.',
    });
  };
  const bids = w.bids || [];
  const pendingFor = (id: string) =>
    bids.find(
      (bid) =>
        bid.direction === 'out' &&
        bid.playerId === id &&
        (bid.status === 'pending' || bid.status === 'countered'),
    );
  const window = transferWindow(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />,
    // Inside a control that already answers the tap: the notation, the exact amount as its title.
    plain = (value: string) => <Money value={value} code={club.country} year={w.year} plain />,
    text = (value: string) => compactMoney(value, club.country, w.year);
  const render = (candidate: Candidate, current: boolean, actions = true) => (
    <CandidateCard
      key={candidate.offer.player.id}
      w={w}
      candidate={candidate}
      actions={actions}
      blocked={blocked || !current || candidate.revision !== w.revision || candidate.offer.own}
      selected={selectedComparison.some((target) => target.playerId === candidate.offer.player.id)}
      onCompare={() => toggle(candidate.offer.target)}
      onRecruit={(loan) => {
        if (current) void recruit(candidate, loan);
      }}
      onBid={() => {
        setComparing(false);
        setViewing(undefined);
        setMessage(undefined);
        setStep(1);
        setBidding({ target: candidate.offer.target, asking: candidate.offer.fee });
      }}
      pending={pendingFor(candidate.offer.player.id)}
    />
  );
  const board = bidBoard(w),
    shownBids = visibleBids(board, expanded);
  const outgoing = bids.filter(
    (bid) => bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'),
  );
  return (
    <section className={s.desk} aria-label="선수 영입 데스크">
      <header className={s.toolbar}>
        <h3>
          영입 후보 <span>{page ? `총 ${page.total}명` : '조회 중'}</span>
        </h3>
        <div
          className={`${s.window} ${window.open ? s.windowOpen : ''}`}
          data-testid="transfer-window"
        >
          <span aria-hidden="true" className={s.windowDot} />
          <span>{window.label}</span>
        </div>
        <div className={s.tools}>
          {selectedComparison.length > 0 && (
            <button
              type="button"
              aria-label={`선택한 ${selectedComparison.length}명 비교`}
              disabled={selectedComparison.length !== 2}
              onClick={() => setComparing(true)}
            >
              비교 {selectedComparison.length}/2
            </button>
          )}
          <button
            type="button"
            aria-label="영입 필터"
            aria-haspopup="dialog"
            aria-expanded={panel === 'filters'}
            onClick={() => setPanel('filters')}
          >
            <PixelIcon name="filter" size={16} />
            필터
            {(filtered || query.sort !== 'ovr' || query.direction !== 'desc') && (
              <i className={s.activeDot} aria-label="적용 중" />
            )}
          </button>
          <button
            type="button"
            aria-label={`이적 협상 · ${outgoing.length}건 진행 중${board.some(({ actionable }) => actionable) ? ' · 응답 필요' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={panel === 'negotiations'}
            onClick={() => setPanel('negotiations')}
          >
            협상
            {bids.length > 0 && (
              <span className={s.count}>
                {board.filter(({ actionable }) => actionable).length || outgoing.length}
              </span>
            )}
          </button>
          <button
            type="button"
            className={s.infoTrigger}
            aria-label="영입 정보 · 필요한 영입과 감독 요청"
            aria-haspopup="dialog"
            aria-expanded={panel === 'info'}
            onClick={() => setPanel('info')}
          >
            <span aria-hidden="true">!</span>
          </button>
        </div>
      </header>
      {message?.world === w.id && (
        <p data-surface="inset" className={s.message} role="status">
          {message.text}
        </p>
      )}
      <label className={s.search}>
        <span>선수 이름 검색</span>
        <input
          type="search"
          value={query.name ?? ''}
          maxLength={160}
          onChange={(event) => changeQuery({ name: event.target.value })}
        />
      </label>
      {market.error && (
        <p data-surface="inset" role="alert" className={s.warning}>
          {market.error} <button onClick={market.retry}>목록 다시 조회</button>
        </p>
      )}
      {!page && !market.error && <p role="status">세계 선수 목록을 불러오고 있어요.</p>}
      <table className={s.candidateTable} aria-label="영입 후보 목록">
        <thead>
          <tr>
            <th scope="col">선수</th>
            <th scope="col" className={s.ratingColumn}>
              OVR
            </th>
            <th scope="col" className={s.potentialColumn}>
              POT
            </th>
            <th scope="col" className={s.feeColumn}>
              이적료
            </th>
            <th scope="col" className={s.wageColumn}>
              연봉
            </th>
            <th scope="col" className={s.compareColumn}>
              비교
            </th>
          </tr>
        </thead>
        <tbody>
          {page?.items.map((offer) => {
            const player = offer.player;
            const pending = pendingFor(player.id);
            const source = sourceLabel(w, offer);
            return (
              <tr
                key={player.id}
                data-testid={`market-candidate-${player.id}`}
                data-candidate-id={player.id}
                data-line={lineOf(player.position)}
                data-selected={
                  selectedComparison.some((target) => target.playerId === player.id) || undefined
                }
                onClick={(event) => {
                  if ((event.target as Element).closest('button, input, a')) return;
                  setViewing(offer.target);
                }}
              >
                <td>
                  <button
                    type="button"
                    className={s.playerName}
                    aria-label={`${player.name} 상세 보기`}
                    onClick={() => setViewing(offer.target)}
                  >
                    <b>{player.name}</b>
                    <small title={source}>
                      {player.position} · {w.year - player.born}세
                      {offer.own
                        ? ' · 우리 선수'
                        : !offer.available
                          ? ' · 접근 불가'
                          : pending
                            ? ' · 협상 중'
                            : ''}
                      {offer.recommended ? ' · 스카우트 추천' : ''}
                      {' · '}
                      {source}
                    </small>
                  </button>
                </td>
                <td>
                  <OvrBadge value={overall(player)} />
                </td>
                <td className={s.potentialValue}>{Math.round(player.potential)}</td>
                <td className={s.feeValue}>
                  {offer.freeAgent ? <span className={s.freeTag}>자유계약</span> : plain(offer.fee)}
                </td>
                <td className={s.wageColumn}>{plain(player.wage)}</td>
                <td>
                  <button
                    type="button"
                    className={s.compareToggle}
                    aria-label={`${player.name} 비교`}
                    aria-pressed={selectedComparison.some(
                      (target) => target.playerId === player.id,
                    )}
                    onClick={() => toggle(offer.target)}
                  >
                    <span aria-hidden="true">
                      {selectedComparison.some((target) => target.playerId === player.id)
                        ? '✓'
                        : '+'}
                    </span>
                  </button>
                </td>
              </tr>
            );
          })}
          {page?.total === 0 && (
            <tr>
              <td colSpan={6} className={s.empty}>
                {filtered
                  ? '이 조건에 맞는 선수가 없어요. 필터를 지우고 다시 찾아보세요.'
                  : '현재 조회할 수 있는 현역 선수가 없어요.'}
                <button onClick={() => setQuery(DEFAULT_MARKET_QUERY)}>필터 지우기</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {page && (
        <nav className={s.pagination} aria-label="영입 목록 페이지">
          <button disabled={page.page === 0} onClick={() => changeQuery({ page: page.page - 1 })}>
            이전 페이지
          </button>
          <span role="status">
            총 {page.total}명 · {page.page + 1} /{' '}
            {Math.max(1, Math.ceil(page.total / page.pageSize))} 페이지 · {page.items.length}명 표시
          </span>
          <button
            disabled={(page.page + 1) * page.pageSize >= page.total}
            onClick={() => changeQuery({ page: page.page + 1 })}
          >
            다음 페이지
          </button>
        </nav>
      )}
      {panel === 'filters' && (
        <Dialog
          label="영입 필터"
          onClose={() => setPanel(undefined)}
          actions={
            <div className={s.bidActions}>
              <button
                type="button"
                onClick={() => {
                  setQuery(DEFAULT_MARKET_QUERY);
                }}
              >
                초기화
              </button>
              <button
                data-ui="primary"
                type="button"
                className={s.primary}
                onClick={() => setPanel(undefined)}
              >
                {page ? `${page.total}명 목록 보기` : '목록으로'}
              </button>
            </div>
          }
        >
          <p className={s.note}>
            전 세계 현역 선수·자유계약 선수{query.recommendedOnly ? ' · 스카우트 추천만' : ''}
          </p>
          <div className={s.roles} role="group" aria-label="영입 포지션 선택">
            {(['all', 'GK', 'DF', 'MF', 'FW'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={(query.line ?? 'all') === value && !query.position}
                onClick={() => changeQuery({ line: value === 'all' ? undefined : value })}
              >
                {value === 'all' ? '전체' : value}
              </button>
            ))}
          </div>
          <div className={s.filters}>
            <button className={s.recommendation} onClick={() => changeQuery({ line: recommended })}>
              추천 포지션: {lineNames[recommended]} · {recommended}
            </button>
            <label>
              포지션
              <Select
                aria-label="영입 포지션"
                value={query.position ?? 'all'}
                onValueChange={(value) =>
                  changeQuery({
                    position: value === 'all' ? undefined : (value as MarketQuery['position']),
                  })
                }
              >
                <option value="all">모든 포지션</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position} · {POSITION_LABEL[position]}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              리그
              <Select
                aria-label="영입 리그"
                value={leagueKey || 'all'}
                onValueChange={(value) =>
                  changeQuery({ league: leagues.find(([key]) => key === value)?.[1] })
                }
              >
                <option value="all">모든 리그</option>
                {leagues.map(([key]) => {
                  const team = w.clubs.find((team) => marketLeagueKey(team) === key)!;
                  return (
                    <option key={key} value={key}>
                      {team.country} · {clubDivision(w, team)}
                    </option>
                  );
                })}
              </Select>
            </label>
            <label>
              소속 구단
              <Select
                aria-label="영입 구단"
                value={query.team ?? 'all'}
                onValueChange={(value) =>
                  changeQuery({ team: value === 'all' ? undefined : value })
                }
              >
                <option value="all">모든 구단·자유계약</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              후보 정렬
              <Select
                aria-label="영입 후보 정렬"
                value={query.sort ?? 'ovr'}
                onValueChange={(value) => changeQuery({ sort: value as MarketQuery['sort'] })}
              >
                <option value="name">이름</option>
                <option value="age">나이</option>
                <option value="ovr">OVR</option>
                <option value="potential">잠재력</option>
                <option value="fee">이적료</option>
                <option value="wage">연봉</option>
              </Select>
            </label>
            <label>
              정렬 방향
              <Select
                aria-label="영입 정렬 방향"
                value={query.direction ?? 'desc'}
                onValueChange={(value) =>
                  changeQuery({ direction: value as MarketQuery['direction'] })
                }
              >
                <option value="desc">내림차순</option>
                <option value="asc">오름차순</option>
              </Select>
            </label>
            <button
              aria-pressed={!!query.recommendedOnly}
              onClick={() => changeQuery({ recommendedOnly: !query.recommendedOnly })}
            >
              스카우트 추천만
            </button>
            <button
              aria-pressed={query.fit === 'improves'}
              onClick={() => changeQuery({ fit: query.fit === 'improves' ? 'all' : 'improves' })}
            >
              {w.lineup ? '수동 교체 보강 후보' : '선발 보강 후보'}
            </button>
          </div>
          <p className={s.note}>
            현재 선발의 약한 포지션을 추천해요. 전력·적합도는 선수 구성의 비교이며 경기 승리를
            보장하지 않습니다.
          </p>
        </Dialog>
      )}
      {panel === 'negotiations' && (
        <Dialog label="이적 협상" onClose={() => setPanel(undefined)}>
          {board.length > 0 && (
            <section data-surface="sheet" className={s.negotiations} aria-label="진행 중인 협상">
              <h3>이적 협상</h3>
              {shownBids.map(({ bid, player, club: other, actionable, dueLabel }) => (
                <div
                  data-surface="sheet"
                  key={bid.id}
                  className={s.negotiation}
                  data-status={bid.status}
                >
                  <span>
                    <b>
                      {bidKind(bid)} · {player?.name || '선수'}
                      {/* A player who asked to leave (→CLUB-27) is the one the owner may want to sell. */}
                      {bid.direction === 'in' && player?.transferRequest ? ' · 이적 요청' : ''}
                    </b>
                    <small>
                      {bid.direction === 'in' && other ? `${other.name} · ` : ''}
                      {freeSigning(bid) ? (
                        '자유계약 · 이적료 없음'
                      ) : bid.status === 'countered' ? (
                        <>역제안 {format(bid.counterFee || bid.fee)}</>
                      ) : (
                        format(bid.fee)
                      )}{' '}
                      · {BID_STATUS[bid.status]}
                      {(bid.status === 'pending' || bid.status === 'countered') &&
                        ` · ${dueLabel}까지`}
                      {bid.staff && bid.status === 'countered' && ' · 단장이 답해요'}
                      {bid.direction === 'in' &&
                        w.staff?.some((member) => member.person === bid.playerId) && (
                          <>
                            {' '}
                            · 선수·코치 계약 함께 종료 · 코치 계약 종료 보상{' '}
                            {format(
                              releaseCost(
                                w,
                                w.staff.find((member) => member.person === bid.playerId),
                              ),
                            )}
                          </>
                        )}
                    </small>
                  </span>
                  {actionable && (
                    <span className={s.negotiationActions}>
                      <button
                        data-ui="primary"
                        className={s.primary}
                        disabled={blocked}
                        onClick={() =>
                          void client.command({ type: 'respond-bid', id: bid.id, accept: true })
                        }
                      >
                        {bid.direction === 'in' ? '매각' : '수락'}
                      </button>
                      <button
                        disabled={blocked}
                        onClick={() =>
                          void client.command({ type: 'respond-bid', id: bid.id, accept: false })
                        }
                      >
                        거절
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {shownBids.length < board.length && (
                <button type="button" onClick={() => setExpanded(true)}>
                  {board.length}건 모두 보기
                </button>
              )}
            </section>
          )}
          {board.length === 0 && <p className={s.empty}>진행 중인 이적 협상이 없어요.</p>}
        </Dialog>
      )}
      {panel === 'info' && (
        <Dialog label="영입 정보" onClose={() => setPanel(undefined)}>
          <p className={s.note}>
            {window.open
              ? '이적료 영입·임대·매각이 가능해요. 자유계약 선수는 언제든 영입할 수 있어요.'
              : '지금은 자유계약 선수만 영입할 수 있어요. 이적 제안은 시장이 열리면 보내세요.'}
          </p>
          <RecruitmentNeeds
            w={w}
            offers={state.view!.transfers}
            onRole={(line) => {
              changeQuery({ line });
              setPanel(undefined);
            }}
          />
          {/* The recruitment level lives on the operating board (→WEB-71); here it is a line to it. */}
          <button type="button" className={s.policyLine} onClick={() => openDirection('scouting')}>
            <span>
              영입 기조 · <b>{currentStepName(w, 'recruitment')}</b>
            </span>
            <small>업무 기준에서 바꿔요</small>
          </button>
          <div data-surface="sheet" className={s.summary}>
            <span>
              선수단 정원 <b>{registered.value}</b>
              <small>{registered.detail}</small>
            </span>
            <span>
              협상 중 <b>{outgoing.length}건</b>
            </span>
          </div>
          {registered.full && (
            <p data-surface="inset" className={s.warning}>
              선수단 정원 {registered.value} · 자리가 가득 찼어요. 선수를 정리한 뒤 영입하세요.
            </p>
          )}
          <RecruitmentCommitments w={w} client={client} />
          <ScoutShortlist
            w={w}
            offers={state.view!.transfers}
            disabled={false}
            onOpen={(index) => {
              const offer = state.view!.transfers[index];
              if (!offer) return;
              setPanel(undefined);
              setViewing({ world: w.id, kind: 'offer', playerId: offer.player.id });
            }}
          />
          <OfferAnswers w={w} />
        </Dialog>
      )}
      {comparing && (
        <Dialog
          label="영입 후보 비교"
          onClose={() => setComparing(false)}
          wide
          actions={
            <div className={s.close}>
              <button onClick={() => setComparing(false)}>후보 비교 마치기</button>
            </div>
          }
        >
          <div className={s.cards}>
            {[comparisonA, comparisonB].map((reading, index) => (
              <div key={selectedComparison[index]?.playerId ?? index}>
                {reading.value ? (
                  render(reading.value, reading.current)
                ) : (
                  <p role="status">{reading.error ?? '비교 선수 정보를 불러오고 있어요.'}</p>
                )}
                {reading.error && <button onClick={reading.retry}>선수 다시 조회</button>}
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {bidding && (
        <Dialog
          label="이적 제안"
          onClose={() => setBidding(undefined)}
          actions={
            <div className={s.bidActions}>
              <button onClick={() => setBidding(undefined)}>취소</button>
              <button
                data-ui="primary"
                className={s.primary}
                disabled={
                  blocked ||
                  !bidDetail.current ||
                  !outlook ||
                  !bidDetail.value?.buy.eligible ||
                  bidDetail.value?.offer.own ||
                  bidDetail.value?.revision !== w.revision ||
                  !!pendingFor(bidding.target.playerId) ||
                  !window.open ||
                  BigInt(fee) > BigInt(w.cash) ||
                  BigInt(fee) < 1n
                }
                onClick={async () => {
                  if (
                    !bidDetail.value ||
                    !bidDetail.current ||
                    !outlook ||
                    !bidDetail.value.buy.eligible ||
                    bidDetail.value.offer.own ||
                    !currentWorld() ||
                    bidDetail.value.revision !== client.state.view?.world.revision ||
                    currentActionsBlocked() ||
                    BigInt(fee) > BigInt(w.cash) ||
                    BigInt(fee) < 1n ||
                    !window.open ||
                    pendingFor(bidding.target.playerId)
                  )
                    return;
                  const reply = await client.command(
                    { type: 'bid', target: bidding.target, fee },
                    { background: true },
                  );
                  if (!currentWorld() || activeBid.current !== bidding) return;
                  setMessage({
                    world: w.id,
                    text: reply?.ok
                      ? `${bidDetail.value.offer.player.name}에게 ${text(fee)} 제안을 보냈어요. 며칠 안에 답이 와요.`
                      : client.state.error || '제안을 보내지 못했어요.',
                  });
                  if (reply?.ok) setBidding(undefined);
                }}
              >
                {plain(fee)} 제안 보내기
              </button>
            </div>
          }
        >
          {message?.world === w.id && (
            <p data-surface="inset" className={s.message} role="status">
              {message.text}
            </p>
          )}
          {bidDetail.value ? (
            render(bidDetail.value, bidDetail.current, false)
          ) : (
            <p role="status">{bidDetail.error ?? '제안 조건을 확인하고 있어요.'}</p>
          )}
          {bidDetail.error && <button onClick={bidDetail.retry}>제안 조건 다시 조회</button>}
          <p className={s.note}>
            요구 이적료 {format(outlook?.asking || bidding.asking)} · 상대 구단은 2–4일 뒤
            수락·거절·역제안 중 하나로 답해요. 수락되면 그날 이적료가 나가요.
          </p>
          <div className={s.bidSteps} role="radiogroup" aria-label="제안 이적료">
            {steps.map((percent, i) => (
              <button
                key={String(percent)}
                role="radio"
                aria-checked={step === i}
                className={step === i ? s.bidPicked : undefined}
                onClick={() => setStep(i)}
              >
                <b>{String(percent)}%</b>
                <small>{plain(((asking * percent) / 100n).toString())}</small>
              </button>
            ))}
          </div>
          <dl className={s.costs}>
            <div>
              <dt>수락 가능성</dt>
              <dd>
                {outlook ? `${outlook.label} · 약 ${Math.round(outlook.chance * 100)}%` : '확인 중'}
              </dd>
            </div>
            <div>
              <dt>수락 시 자금</dt>
              <dd>{format((BigInt(w.cash) - BigInt(fee)).toString())}</dd>
            </div>
          </dl>
          {BigInt(fee) > BigInt(w.cash) && (
            <p data-surface="inset" className={s.warning}>
              자금이 부족해요.
            </p>
          )}
        </Dialog>
      )}
      {viewing && (
        <Dialog
          label="영입 후보 상세"
          onClose={() => setViewing(undefined)}
          actions={
            <div className={s.close}>
              <button onClick={() => setViewing(undefined)}>닫기</button>
            </div>
          }
        >
          {message?.world === w.id && (
            <p data-surface="inset" className={s.message} role="status">
              {message.text}
            </p>
          )}
          {detail.value ? (
            render(detail.value, detail.current)
          ) : (
            <p role="status">{detail.error ?? '선수 정보를 불러오고 있어요.'}</p>
          )}
          {detail.error && <button onClick={detail.retry}>선수 다시 조회</button>}
        </Dialog>
      )}
    </section>
  );
}
