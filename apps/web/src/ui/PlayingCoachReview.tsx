import { useState } from 'react';
import type { ContractTerm, Player, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { DecisionOwner } from './DecisionOwner';
import { Money } from './Money';
import { Select } from './Select';
import s from './PlayerProfile.module.css';

/** One proposal and one answer cover both contracts; the engine owns every quote and eligibility. */
export function PlayingCoachReview({
  w,
  player,
  client,
}: {
  w: World;
  player: Player;
  client: GameClient;
}) {
  const assessment = useGameState((state) => state.view?.careers[player.id]);
  const disabled = useGameState(gameActionsBlocked);
  const readonly = useGameState((state) => state.readonly);
  const [term, setTerm] = useState<ContractTerm>(2);
  const [years, setYears] = useState<1 | 2>(1);
  if (!assessment) return null;
  const proposal = assessment.playingCoach;
  const money = (value: string) => (
    <Money value={value} code={w.clubs.find((c) => c.id === w.playerClub)!.country} year={w.year} />
  );
  return (
    <section data-surface="sheet" className={s.career} aria-label="지도자 진로">
      <h3>지도자 진로</h3>
      {disabled && (
        <p role="status">
          {readonly
            ? '읽기 전용 경력에서는 계약을 변경할 수 없어요.'
            : '다른 처리를 마친 뒤 결정할 수 있어요.'}
        </p>
      )}
      <p>진로 권유는 선수마다 한 번만 할 수 있어요. 지도자 진입이나 채용을 보장하지 않아요.</p>
      {assessment.encourage && (
        <button
          disabled={disabled}
          onClick={() => void client.command({ type: 'encourage-coaching', player: player.id })}
        >
          지도자 진로 권유
        </button>
      )}
      {assessment.encouragement && (
        <p role="status">
          {assessment.encouragement.willing
            ? '지도자의 길을 준비해요.'
            : '지도자의 길은 선택하지 않았어요.'}{' '}
          · 진로 권유 사용 완료
        </p>
      )}
      {proposal?.status === 'accepted' ? (
        <p role="status">플레잉 코치 계약 승인 완료 · {STAFF_INFO[proposal.role].label}</p>
      ) : (
        <>
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
          {assessment.playingCoachYears.length ? (
            <>
              <label>
                선수 생활 연장 기간{' '}
                <Select
                  aria-label="선수 생활 연장 기간"
                  value={
                    assessment.playingCoachYears.includes(years)
                      ? years
                      : assessment.playingCoachYears[0]
                  }
                  disabled={disabled}
                  onValueChange={(value) => setYears(Number(value) as 1 | 2)}
                >
                  {assessment.playingCoachYears.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                코치 계약 기간{' '}
                <Select
                  aria-label="코치 계약 기간"
                  value={term}
                  disabled={disabled}
                  onValueChange={(value) => setTerm(Number(value) as ContractTerm)}
                >
                  {([1, 2, 3, 4, 5] as const).map((value) => (
                    <option key={value} value={value}>
                      {value}시즌
                    </option>
                  ))}
                </Select>
              </label>
              <button
                disabled={disabled}
                onClick={() =>
                  void client.command({
                    type: 'propose-playing-coach',
                    player: player.id,
                    years: assessment.playingCoachYears.includes(years)
                      ? years
                      : (assessment.playingCoachYears[0] as 1 | 2),
                    term,
                  })
                }
              >
                플레잉 코치 계약안 보기
              </button>
            </>
          ) : (
            <p>
              현재 제안 가능한 플레잉 코치 기간이 없어요. 은퇴 발표·본인 의향·만 41세 이내 기간을
              충족해야 해요.
            </p>
          )}
          {proposal?.status === 'pending' && (
            <div aria-label="선수·코치 통합 계약 검토">
              <h4>선수·코치 계약을 함께 검토</h4>
              <p>
                {STAFF_INFO[proposal.role].label} · 선수 연장 {proposal.years}년 · 코치 계약{' '}
                {proposal.term}시즌
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
                한 번 승인하면 선수 계약과 코치 자리가 함께 적용돼요. 조건이 바뀌면 계약안을 다시
                확인해 주세요.
              </p>
              {BigInt(w.cash) < BigInt(proposal.upfront) && (
                <p role="alert">즉시 지출을 감당할 자금이 부족해요.</p>
              )}
              <button
                disabled={disabled || BigInt(w.cash) < BigInt(proposal.upfront)}
                onClick={() =>
                  void client.command({
                    type: 'answer-playing-coach',
                    player: player.id,
                    accept: true,
                  })
                }
              >
                선수·코치 계약 함께 승인
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  void client.command({
                    type: 'answer-playing-coach',
                    player: player.id,
                    accept: false,
                  })
                }
              >
                통합 계약 거절
              </button>
            </div>
          )}
          {proposal?.status === 'declined' && (
            <p role="status">통합 계약을 거절했어요. 선수와 코치 계약은 유지돼요.</p>
          )}
        </>
      )}
    </section>
  );
}
