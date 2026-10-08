import { Select } from './Select';
import { useState } from 'react';
import type { Role, World } from '../../../../packages/contracts/src/types';
import { clubOf, overall } from '../../../../packages/engine/src/world';
import {
  recruitmentPreview,
  recruitmentRoleNeed,
  type TransferOffer,
} from '../../../../packages/engine/src/recruitment';
import type { ClientState, GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { money } from './format';
import s from './RecruitmentDesk.module.css';

type Preview = ReturnType<typeof recruitmentPreview>;
type Candidate = { index: number; offer: TransferOffer; buy: Preview; loan: Preview };
type Order = 'impact' | 'potential' | 'fee';
const roleNames: Record<Role, string> = {
  GK: '골키퍼',
  DEF: '수비수',
  MID: '미드필더',
  FWD: '공격수',
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
}: {
  w: World;
  candidate: Candidate;
  blocked: boolean;
  selected: boolean;
  onCompare: () => void;
  onRecruit: (loan: boolean) => void;
}) {
  const { offer, buy, loan } = candidate,
    player = offer.player,
    club = clubOf(w);
  const cash = (value: string) => money(value, club.country, w.year);
  return (
    <article
      className={s.card}
      data-testid={`candidate-${player.id}`}
      data-candidate-id={player.id}
      data-role={player.role}
    >
      <header className={s.cardHead}>
        <div>
          <h3>{player.name}</h3>
          <span>
            {player.role} · {roleNames[player.role]} · {w.year - player.born}세
          </span>
        </div>
        <button aria-pressed={selected} onClick={onCompare}>
          비교
        </button>
      </header>
      <div className={s.ability}>
        <span>
          능력 <b>{overall(player)}</b>
        </span>
        <span>
          잠재력 <b>{Math.round(player.potential)}</b>
        </span>
      </div>
      {offer.available && (
        <>
          <div className={s.build} aria-label="영입 빌드 변화">
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
      <div className={s.transactions}>
        <div>
          <button
            className={s.primary}
            disabled={blocked || !buy.eligible || !buy.affordable}
            onClick={() => onRecruit(false)}
          >
            {offer.available ? '선수 영입' : '계약 완료'}
          </button>
          {(!buy.eligible || !buy.affordable) && <small>{buy.reason}</small>}
        </div>
        <div>
          <button
            disabled={blocked || !loan.eligible || !loan.affordable}
            onClick={() => onRecruit(true)}
          >
            1시즌 임대
          </button>
          {(!loan.eligible || !loan.affordable) && <small>{loan.reason}</small>}
        </div>
      </div>
      <details className={s.details}>
        <summary>능력 자세히</summary>
        <div className={s.attributes}>
          {[
            ['공격', player.attack],
            ['패스', player.passing],
            ['수비', player.defense],
            ['골키핑', player.keeper],
            ['체력', player.stamina],
            ['잠재력', player.potential],
          ].map(([label, value]) => (
            <span key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </span>
          ))}
        </div>
      </details>
    </article>
  );
}

export function RecruitmentDesk({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world,
    club = clubOf(w);
  const [role, setRole] = useState<Role | 'all'>('all');
  const [order, setOrder] = useState<Order>('impact');
  const [boostOnly, setBoostOnly] = useState(false);
  const [comparison, setComparison] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [message, setMessage] = useState('');
  const active = w.players.filter((player) => player.status === 'active').length;
  const processing = useGameState((current) => current.processing);
  const readonly = useGameState((current) => current.readonly);
  const error = useGameState((current) => current.error);
  const blocked = processing || readonly || !!error;
  const recommended = recruitmentRoleNeed(w);
  const candidates: Candidate[] = state.view!.transfers.map((offer, index) => ({
    index,
    offer,
    buy: recruitmentPreview(w, offer),
    loan: recruitmentPreview(w, offer, true),
  }));
  const ordered = candidates
    .filter(
      ({ offer, buy }) =>
        (role === 'all' || offer.player.role === role) &&
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
  const toggle = (id: string) =>
    setComparison((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current.slice(-1), id],
    );
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
  const render = (candidate: Candidate) => (
    <CandidateCard
      key={candidate.offer.player.id}
      w={w}
      candidate={candidate}
      blocked={blocked}
      selected={comparison.includes(candidate.offer.player.id)}
      onCompare={() => toggle(candidate.offer.player.id)}
      onRecruit={(loan) => void recruit(candidate, loan)}
    />
  );
  return (
    <section className={s.desk} aria-label="선수 영입 데스크">
      <div className={s.summary}>
        <span>
          운영 자금 <b>{money(w.cash, club.country, w.year)}</b>
        </span>
        <span>
          선수단 정원 <b>{active}/26</b>
        </span>
      </div>
      {active >= 26 && (
        <p className={s.warning}>
          선수단 정원 26/26 · 자리가 가득 찼어요. 선수를 정리한 뒤 영입하세요.
        </p>
      )}
      <div className={s.roles} role="group" aria-label="영입 포지션 선택">
        {(['all', 'GK', 'DEF', 'MID', 'FWD'] as const).map((value) => (
          <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>
            {value === 'all' ? '전체' : value}
          </button>
        ))}
      </div>
      <div className={s.filters}>
        <button className={s.recommendation} onClick={() => setRole(recommended)}>
          추천 포지션: {roleNames[recommended]} · {recommended}
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
          disabled={comparison.length !== 2}
          onClick={(event) => {
            event.currentTarget.focus();
            setComparing(true);
          }}
        >
          선택한 {comparison.length}명 비교
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
            {candidates.filter(({ offer }) => comparison.includes(offer.player.id)).map(render)}
          </div>
        </Dialog>
      )}
    </section>
  );
}
