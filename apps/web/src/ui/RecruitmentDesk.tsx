import { PlayerLink } from './PlayerSheet';
import { useTaskState } from './taskMemory';
import { Select } from './Select';
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
import { staffMember } from '../../../../packages/engine/src/staff';
import { positionsLabel } from './FormationPitch';
import { gradeLabel, PlayerProfile } from './PlayerProfile';
import { bidBoard, bidOutlook, transferWindow } from '../../../../packages/engine/src/transfers';
import { bidKind, freeSigning } from './bids';
import { clubOf, overall } from '../../../../packages/engine/src/world';
import {
  recruitmentPreview,
  recruitmentLineNeed,
  type TransferOffer,
} from '../../../../packages/engine/src/recruitment';
import type { ClientState, GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { compactMoney } from './format';
import { Money } from './Money';
import { OvrBadge } from './OvrBadge';
import { OfferAnswers } from './ClubStaff';
import { RecruitmentNeeds, ScoutShortlist } from './ScoutShortlist';
import { openCoachSheet, openDirection } from './state';
import { policyOf, POLICY_INFO } from '../../../../packages/engine/src/policy';
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
                className={s.primary}
                disabled={blocked || !buy.eligible || !buy.affordable}
                onClick={() => onRecruit(false)}
              >
                {offer.available ? '자유계약 영입' : '계약 완료'}
              </button>
            ) : (
              <button
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
  const [bidding, setBidding] = useState<Candidate>();
  // A shortlisted candidate opened from 스카우트 명단 without a bid to make (→CLUB-33).
  const [viewing, setViewing] = useState<Candidate>();
  const [step, setStep] = useState(1);
  const active = w.players.filter((player) => player.status === 'active').length;
  const acting = useGameState((current) => !!current.pendingActions);
  const readonly = useGameState((current) => current.readonly);
  const error = useGameState((current) => current.error);
  const blocked = acting || readonly || !!error;
  const recommended = recruitmentLineNeed(w);
  const candidates: Candidate[] = state.view!.transfers.map((offer, index) => ({
    index,
    offer,
    buy: recruitmentPreview(w, offer),
    loan: recruitmentPreview(w, offer, true),
  }));
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
        setViewing(undefined);
        void recruit(candidate, loan);
      }}
      onBid={() => {
        setViewing(undefined);
        setStep(1);
        setBidding(candidate);
      }}
      pending={pendingFor(candidate.offer.player.id)}
    />
  );
  const board = bidBoard(w);
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
        <b>{window.label}</b>
        <small>
          {window.open
            ? '이적료 영입·임대·매각이 가능해요. 자유계약 선수는 언제든 영입할 수 있어요.'
            : '지금은 자유계약 선수만 영입할 수 있어요. 이적 제안은 시장이 열리면 보내세요.'}
        </small>
      </div>
      <RecruitmentNeeds w={w} offers={state.view!.transfers} onRole={setRole} />
      {/* The recruitment level lives on the operating board (→WEB-71); here it is a line to it. */}
      <button type="button" className={s.policyLine} onClick={() => openDirection('scouting')}>
        <span>
          영입 기조 · <b>{POLICY_INFO.recruitment.levels[policyOf(w).recruitment - 1].name}</b>
        </span>
        <small>운영 방침에서 바꿔요</small>
      </button>
      <div className={s.summary}>
        <span>
          선수단 정원 <b>{active}/26</b>
        </span>
        <span>
          협상 중 <b>{outgoing.length}건</b>
        </span>
      </div>
      {board.length > 0 && (
        <section className={s.negotiations} aria-label="진행 중인 협상">
          <h3>이적 협상</h3>
          {board.slice(0, 8).map(({ bid, player, club: other, actionable, dueLabel }) => (
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
                  {(bid.status === 'pending' || bid.status === 'countered') && ` · ${dueLabel}까지`}
                  {bid.staff && bid.status === 'countered' && ' · 단장이 답해요'}
                </small>
              </span>
              {actionable && (
                <span className={s.negotiationActions}>
                  <button
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
        </section>
      )}
      {active >= 26 && (
        <p className={s.warning}>
          선수단 정원 26/26 · 자리가 가득 찼어요. 선수를 정리한 뒤 영입하세요.
        </p>
      )}
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
      <div className={s.comparisonBar}>
        <span>최근 선택한 두 명을 비교해요</span>
        <button
          disabled={selectedComparison.length !== 2}
          onClick={(event) => {
            event.currentTarget.focus();
            setComparing(true);
          }}
        >
          선택한 {selectedComparison.length}명 비교
        </button>
      </div>
      <p className={s.note}>
        현재 선발의 약한 포지션을 추천해요. 전력·적합도는 선수 구성의 비교이며 경기 승리를 보장하지
        않습니다.
      </p>
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
      <div className={s.cards} aria-label="영입 후보 목록">
        {ordered.map(render)}
      </div>
      {!ordered.length && (
        <p className={s.empty}>이 조건에 맞는 후보가 없어요. 포지션이나 보강 조건을 바꿔보세요.</p>
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
          onClose={() => setBidding(undefined)}
          actions={
            <div className={s.bidActions}>
              <button onClick={() => setBidding(undefined)}>취소</button>
              <button
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
                  setBidding(undefined);
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
      <OfferAnswers w={w} />
      <ScoutShortlist
        w={w}
        offers={state.view!.transfers}
        disabled={blocked}
        onOpen={(index) => {
          const candidate = candidates[index];
          if (!candidate) return;
          // A fee-bearing player in an open window opens the bid sheet, as his card's 이적 제안 does.
          if (
            window.open &&
            !candidate.offer.freeAgent &&
            candidate.offer.available &&
            candidate.buy.eligible &&
            !pendingFor(candidate.offer.player.id)
          ) {
            setStep(1);
            setBidding(candidate);
          } else setViewing(candidate);
        }}
      />
      {viewing && (
        <Dialog
          label="스카우트 명단 후보"
          onClose={() => setViewing(undefined)}
          actions={
            <div className={s.close}>
              <button onClick={() => setViewing(undefined)}>닫기</button>
            </div>
          }
        >
          {render(viewing)}
        </Dialog>
      )}
    </section>
  );
}
