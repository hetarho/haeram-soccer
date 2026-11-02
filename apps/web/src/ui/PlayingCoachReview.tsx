import type { Player, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { DecisionOwner } from './DecisionOwner';
import { Money } from './Money';
import s from './PlayerProfile.module.css';

/**
 * Staff's combined playing-coach proposal waiting in the 결재함 (→STAFF-32): one answer covers both
 * contracts; the engine owns the quote and its eligibility.
 */
export function PlayingCoachReview({
  w,
  player,
  client,
}: {
  w: World;
  player: Player;
  client: GameClient;
}) {
  const disabled = useGameState(gameActionsBlocked);
  const readonly = useGameState((state) => state.readonly);
  const proposal = w.playingCoachProposals?.[player.id];
  if (proposal?.status !== 'pending') return null;
  const money = (value: string) => (
    <Money value={value} code={w.clubs.find((c) => c.id === w.playerClub)!.country} year={w.year} />
  );
  const short = BigInt(w.cash) < BigInt(proposal.upfront);
  const answer = (accept: boolean) =>
    void client.command({ type: 'answer-playing-coach', player: player.id, accept });
  return (
    <section data-surface="sheet" className={s.career} aria-label="선수·코치 통합 계약 검토">
      <h3>선수·코치 계약을 함께 검토</h3>
      {disabled && (
        <p role="status">
          {readonly
            ? '읽기 전용 경력에서는 계약을 변경할 수 없어요.'
            : '다른 처리를 마친 뒤 결정할 수 있어요.'}
        </p>
      )}
      <DecisionOwner
        w={w}
        decision="contracts"
        auto="선수 계약을 위임 중이에요."
        owner="선수 계약은 직접 결정해요."
      />
      <DecisionOwner
        w={w}
        decision="staff"
        auto="코치 계약을 위임 중이에요."
        owner="코치 계약은 직접 결정해요."
      />
      <p>
        {STAFF_INFO[proposal.role].label} · 선수 연장 {proposal.years}년 · 코치 계약 {proposal.term}
        시즌
      </p>
      <dl>
        <dt>선수 연봉</dt>
        <dd>{money(proposal.playerWage)}</dd>
        <dt>코치 연봉</dt>
        <dd>{money(proposal.coachWage)}</dd>
        <dt>합산 연봉</dt>
        <dd>{money(proposal.totalWage)}</dd>
        <dt>즉시 지출</dt>
        <dd>
          {money(proposal.upfront)} · 계약금 {money(proposal.fee)} · 기존 코치 보상{' '}
          {money(proposal.replacement)}
        </dd>
      </dl>
      <p>
        한 번 승인하면 선수 계약과 코치 자리가 함께 적용돼요. 그사이 조건이 바뀌었다면 승인할 수
        없으니 거절해 주세요.
      </p>
      {short && <p role="alert">즉시 지출을 감당할 자금이 부족해요.</p>}
      <button disabled={disabled || short} onClick={() => answer(true)}>
        선수·코치 계약 함께 승인
      </button>
      <button disabled={disabled} onClick={() => answer(false)}>
        통합 계약 거절
      </button>
    </section>
  );
}
