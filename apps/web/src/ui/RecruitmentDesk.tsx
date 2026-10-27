import { squadRegistration } from './squadRegistration';
import { RecruitmentCommitments } from './MediationReview';
import { PlayerLink } from './PlayerSheet';
import { useTaskState } from './taskMemory';
import { Select } from './Select';
import { PixelIcon } from './PixelIcon';
import { useState } from 'react';
import type { Line, TransferBid, World } from '../../../../packages/contracts/src/types';
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
import { bidBoard, bidOutlook } from '../../../../packages/engine/src/transfers';
import { transferWindow } from '../../../../packages/engine/src/transfer-window';
import { bidKind, freeSigning, visibleBids } from './bids';
import { clubOf, overall } from '../../../../packages/engine/src/player-state';
import {
  recruitmentPreview,
  recruitmentLineNeed,
  type TransferOffer,
} from '../../../../packages/engine/src/recruitment';
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
import s from './RecruitmentDesk.module.css';

type Preview = ReturnType<typeof recruitmentPreview>;
type Candidate = { index: number; offer: TransferOffer; buy: Preview; loan: Preview };
type Order = 'impact' | 'potential' | 'fee';
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
}: {
  w: World;
  candidate: Candidate;
  blocked: boolean;
  selected: boolean;
  onCompare: () => void;
  onRecruit: (loan: boolean) => void;
  onBid: () => void;
  pending?: TransferBid;
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
      <p className={s.traits}>
        {player.traits.length
          ? player.traits.map((trait) => TRAIT_LABEL[trait]).join(' · ')
          : '특성 없음'}
      </p>
      <p className={s.personality} data-testid="candidate-personality">
        {(Object.keys(PERSONALITY_LABEL) as (keyof Personality)[])
          .map(
            (key) =>
              `${PERSONALITY_LABEL[key]} ${gradeLabel(player.personality[key], false, scout)}`,
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
      {pending ? (
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
              disabled={blocked || !window.open || !loan.eligible || !loan.affordable}
              onClick={() => onRecruit(true)}
            >
              1시즌 임대
            </button>
            {(!loan.eligible || !loan.affordable) && <small>{loan.reason}</small>}
          </div>
        </div>
      )}
      {w.players.some((person) => person.id === player.id && person.status === 'active') && (
        <div className={s.transactions} aria-label="합류한 선수 관리">
          <PlayerLink id={player.id} name={player.name} />
          <button type="button" onClick={() => openCoachSheet('assistant', undefined, player.id)}>
            합류 선수 훈련 보기
          </button>
        </div>
      )}
      <details className={s.details}>
        <summary>능력 자세히</summary>
        <PlayerProfile w={w} player={player} own={false} compact />
      </details>
    </article>
  );
}

export function RecruitmentDesk({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world,
    club = clubOf(w);
  const [role, setRole] = useTaskState<Line | 'all'>(w.id, 'market-role', 'all');
  const [order, setOrder] = useTaskState<Order>(w.id, 'market-order', 'impact');
  const [boostOnly, setBoostOnly] = useTaskState(w.id, 'market-boost', false);
  const [comparison, setComparison] = useTaskState<string[]>(w.id, 'market-comparison', []);
  const [comparisonOffers, setComparisonOffers] = useTaskState<Record<string, TransferOffer>>(
    w.id,
    'market-comparison-offers',
    {},
  );
  const [comparing, setComparing] = useState(false);
  const [message, setMessage] = useState('');
  const [biddingId, setBiddingId] = useState<string>();
  const [viewingId, setViewingId] = useState<string>();
  const [panel, setPanel] = useState<'filters' | 'info' | 'negotiations'>();
  const [step, setStep] = useState(1);
  // 모두 보기 on the 이적 협상 list: closed bids past the first rows.
  const [expanded, setExpanded] = useState(false);
  const registered = squadRegistration(w);
  const blocked = useGameState(gameActionsBlocked);
  const recommended = recruitmentLineNeed(w);
  const candidates: Candidate[] = state.view!.transfers.map((offer, index) => ({
    index,
    offer,
    buy: recruitmentPreview(w, offer),
    loan: recruitmentPreview(w, offer, true),
  }));
  const viewing = candidates.find((candidate) => candidate.offer.player.id === viewingId);
  const bidding = candidates.find((candidate) => candidate.offer.player.id === biddingId);
  const ordered = candidates
    .filter(
      ({ offer, buy }) =>
        (role === 'all' || lineOf(offer.player.position) === role) &&
        (!boostOnly || buy.strengthDelta > 0 || buy.fitDelta > 0),
    )
    .sort((a, b) => {
      if (order === 'potential')
        return (
          b.offer.player.potential - a.offer.player.potential ||
          a.offer.player.id.localeCompare(b.offer.player.id)
        );
      if (order === 'fee')
        return BigInt(a.offer.fee) < BigInt(b.offer.fee)
          ? -1
          : BigInt(a.offer.fee) > BigInt(b.offer.fee)
            ? 1
            : a.offer.player.id.localeCompare(b.offer.player.id);
      return (
        b.buy.strengthDelta - a.buy.strengthDelta ||
        b.buy.fitDelta - a.buy.fitDelta ||
        overall(b.offer.player) - overall(a.offer.player) ||
        a.offer.player.id.localeCompare(b.offer.player.id)
      );
    });
  const compared = comparison.flatMap((id) => {
    const current = candidates.find((candidate) => candidate.offer.player.id === id);
    if (current) return [current];
    const offer = comparisonOffers[id];
    return offer
      ? [
          {
            index: -1,
            offer,
            buy: recruitmentPreview(w, offer),
            loan: recruitmentPreview(w, offer, true),
          },
        ]
      : [];
  });
  const selectedComparison = compared.map((candidate) => candidate.offer.player.id);
  const toggle = (id: string) => {
    const offer = candidates.find((candidate) => candidate.offer.player.id === id)?.offer;
    if (offer) setComparisonOffers((current) => ({ ...current, [id]: offer }));
    setComparison((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current.slice(-1), id],
    );
  };
  const recruit = async (candidate: Candidate, loan: boolean) => {
    const preview = loan ? candidate.loan : candidate.buy;
    if (blocked || !preview.eligible || !preview.affordable) return;
    const reply = await client.command(
      { type: 'recruit', candidate: candidate.index, loan },
      { background: true },
    );
    setMessage(
      reply?.ok
        ? `${candidate.offer.player.name} ${loan ? '임대를' : '영입을'} 저장했어요.`
        : client.state.error || '계약을 적용하지 못했어요.',
    );
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
  const render = (candidate: Candidate) => (
    <CandidateCard
      key={candidate.offer.player.id}
      w={w}
      candidate={candidate}
      blocked={blocked || candidate.index < 0}
      selected={comparison.includes(candidate.offer.player.id)}
      onCompare={() => toggle(candidate.offer.player.id)}
      onRecruit={(loan) => {
        void recruit(candidate, loan);
      }}
      onBid={() => {
        setViewingId(undefined);
        setStep(1);
        setBiddingId(candidate.offer.player.id);
      }}
      pending={pendingFor(candidate.offer.player.id)}
    />
  );
  const board = bidBoard(w),
    shownBids = visibleBids(board, expanded);
  const outgoing = bids.filter(
    (bid) => bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'),
  );
  const asking = bidding ? BigInt(bidding.offer.fee) : 0n;
  const steps = [80n, 100n, 115n, 130n];
  const fee = bidding ? ((asking * steps[step]) / 100n).toString() : '0';
  const outlook = bidding ? bidOutlook(w, bidding.index, fee) : undefined;
  return (
    <section className={s.desk} aria-label="선수 영입 데스크">
      <div
        className={`${s.window} ${window.open ? s.windowOpen : ''}`}
        data-testid="transfer-window"
      >
        <span aria-hidden="true" className={s.windowDot} />
        <span>{window.label}</span>
      </div>
      <header className={s.toolbar}>
        <h3>
          영입 후보{' '}
          <span>
            {ordered.length}
            {ordered.length !== candidates.length ? ` / ${candidates.length}` : ''}명
          </span>
        </h3>
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
            {(role !== 'all' || boostOnly || order !== 'impact') && (
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
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
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
          {ordered.map(({ offer }) => {
            const player = offer.player;
            const pending = pendingFor(player.id);
            return (
              <tr
                key={player.id}
                data-testid={`market-candidate-${player.id}`}
                data-candidate-id={player.id}
                data-line={lineOf(player.position)}
                data-selected={selectedComparison.includes(player.id) || undefined}
                onClick={(event) => {
                  if ((event.target as Element).closest('button, input, a')) return;
                  setViewingId(player.id);
                }}
              >
                <td>
                  <button
                    type="button"
                    className={s.playerName}
                    aria-label={`${player.name} 상세 보기`}
                    onClick={() => setViewingId(player.id)}
                  >
                    <b>{player.name}</b>
                    <small>
                      {player.position} · {w.year - player.born}세
                      {!offer.available ? ' · 계약 완료' : pending ? ' · 협상 중' : ''}
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
                    aria-pressed={selectedComparison.includes(player.id)}
                    onClick={() => toggle(player.id)}
                  >
                    <span aria-hidden="true">
                      {selectedComparison.includes(player.id) ? '✓' : '+'}
                    </span>
                  </button>
                </td>
              </tr>
            );
          })}
          {!ordered.length && (
            <tr>
              <td colSpan={6} className={s.empty}>
                이 조건에 맞는 후보가 없어요. 필터를 바꿔보세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {panel === 'filters' && (
        <Dialog
          label="영입 필터"
          onClose={() => setPanel(undefined)}
          actions={
            <div className={s.bidActions}>
              <button
                type="button"
                onClick={() => {
                  setRole('all');
                  setOrder('impact');
                  setBoostOnly(false);
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
                {ordered.length}명 목록 보기
              </button>
            </div>
          }
        >
          <div className={s.roles} role="group" aria-label="영입 포지션 선택">
            {(['all', 'GK', 'DF', 'MF', 'FW'] as const).map((value) => (
              <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>
                {value === 'all' ? '전체' : value}
              </button>
            ))}
          </div>
          <div className={s.filters}>
            <button className={s.recommendation} onClick={() => setRole(recommended)}>
              추천 포지션: {lineNames[recommended]} · {recommended}
            </button>
            <label>
              후보 정렬{' '}
              <Select
                aria-label="영입 후보 정렬"
                value={order}
                onValueChange={(value) => setOrder(value as Order)}
              >
                <option value="impact">즉시 전력</option>
                <option value="potential">잠재력</option>
                <option value="fee">낮은 이적료</option>
              </Select>
            </label>
            <button aria-pressed={boostOnly} onClick={() => setBoostOnly(!boostOnly)}>
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
            <section className={s.negotiations} aria-label="진행 중인 협상">
              <h3>이적 협상</h3>
              {shownBids.map(({ bid, player, club: other, actionable, dueLabel }) => (
                <div key={bid.id} className={s.negotiation} data-status={bid.status}>
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
              setRole(line);
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
          <div className={s.summary}>
            <span>
              선수단 정원 <b>{registered.value}</b>
              <small>{registered.detail}</small>
            </span>
            <span>
              협상 중 <b>{outgoing.length}건</b>
            </span>
          </div>
          {registered.full && (
            <p className={s.warning}>
              선수단 정원 {registered.value} · 자리가 가득 찼어요. 선수를 정리한 뒤 영입하세요.
            </p>
          )}
          <RecruitmentCommitments w={w} client={client} />
          <ScoutShortlist
            w={w}
            offers={state.view!.transfers}
            disabled={false}
            onOpen={(index) => {
              const candidate = candidates[index];
              if (!candidate) return;
              setPanel(undefined);
              setViewingId(candidate.offer.player.id);
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
            {compared.some((candidate) => candidate.index < 0) && (
              <p role="status">
                현재 후보 목록에서 빠진 선수는 선택 당시 정보로 비교해요. 영입하려면 현재 후보
                목록에서 다시 선택해 주세요.
              </p>
            )}
            {compared.map(render)}
          </div>
        </Dialog>
      )}
      {bidding && outlook && (
        <Dialog
          label="이적 제안"
          onClose={() => setBiddingId(undefined)}
          actions={
            <div className={s.bidActions}>
              <button onClick={() => setBiddingId(undefined)}>취소</button>
              <button
                data-ui="primary"
                className={s.primary}
                disabled={blocked || BigInt(fee) > BigInt(w.cash) || BigInt(fee) < 1n}
                onClick={async () => {
                  const reply = await client.command(
                    { type: 'bid', candidate: bidding.index, fee },
                    { background: true },
                  );
                  setMessage(
                    reply?.ok
                      ? `${bidding.offer.player.name}에게 ${text(fee)} 제안을 보냈어요. 며칠 안에 답이 와요.`
                      : client.state.error || '제안을 보내지 못했어요.',
                  );
                  setBiddingId(undefined);
                }}
              >
                {plain(fee)} 제안 보내기
              </button>
            </div>
          }
        >
          <h3>{bidding.offer.player.name}</h3>
          <p className={s.note}>
            요구 이적료 {format(outlook.asking || bidding.offer.fee)} · 상대 구단은 2–4일 뒤
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
                {outlook.label} · 약 {Math.round(outlook.chance * 100)}%
              </dd>
            </div>
            <div>
              <dt>수락 시 자금</dt>
              <dd>{format((BigInt(w.cash) - BigInt(fee)).toString())}</dd>
            </div>
          </dl>
          {BigInt(fee) > BigInt(w.cash) && <p className={s.warning}>자금이 부족해요.</p>}
        </Dialog>
      )}
      {viewingId && (
        <Dialog
          label="영입 후보 상세"
          onClose={() => setViewingId(undefined)}
          actions={
            <div className={s.close}>
              <button onClick={() => setViewingId(undefined)}>닫기</button>
            </div>
          }
        >
          {message && (
            <p className={s.message} role="status">
              {message}
            </p>
          )}
          {viewing ? (
            render(viewing)
          ) : (
            <p role="status">
              이 선수는 현재 이적시장 목록에서 빠졌어요. 다른 후보를 선택해 주세요.
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
