import { useState } from 'react';
import type { TrainingFocus, World } from '../../../../packages/contracts/src/types';
import { clubOf, overall } from '../../../../packages/engine/src/world';
import { trainingSummary, trainingFocusInfo } from '../../../../packages/engine/src/training';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import s from './TrainingStudio.module.css';

const plans: Record<
  TrainingFocus,
  { name: string; benefit: string; cost: string; symbol: string }
> = {
  balanced: {
    name: '균형 훈련',
    benefit: '기본 회복과 꾸준한 유망주 성장',
    cost: '성장과 회복 모두 전문 훈련보다 느려요',
    symbol: '◈',
  },
  youth: {
    name: '유망주 집중',
    benefit: '젊은 선수의 잠재력을 더 빠르게 키워요',
    cost: '회복이 줄어요. 연전에는 선발 교체가 필요해요',
    symbol: '↗',
  },
  recovery: {
    name: '회복 집중',
    benefit: '다음 경기를 위해 피로를 더 많이 줄여요',
    cost: '이번 라운드의 추가 육성 기회를 양보해요',
    symbol: '☾',
  },
};
const roleName = { GK: '골키퍼', DEF: '수비수', MID: '미드필더', FWD: '공격수' };
export function TrainingStudio({
  w,
  client,
  onClose,
  onMarket,
}: {
  w: World;
  client: GameClient;
  onClose: () => void;
  onMarket: () => void;
}) {
  const processing = useGameState((state) => state.processing),
    readonly = useGameState((state) => state.readonly),
    error = useGameState((state) => state.error);
  const [message, setMessage] = useState('');
  const summary = trainingSummary(w);
  const focus = summary.focus;
  const prospects = summary.players.slice(0, 4).map((row) => row.player);
  const select = async (value: TrainingFocus) => {
    const reply = await client.command({ type: 'training', focus: value }, { background: true });
    setMessage(
      reply?.ok
        ? `${plans[value].name}을 저장했어요. 다음 라운드 정산부터 적용됩니다.`
        : client.state.error || '훈련 계획을 저장하지 못했어요.',
    );
  };
  return (
    <Dialog
      label="선수 성장과 훈련"
      onClose={onClose}
      actions={
        <div className={s.actions}>
          <button onClick={onMarket}>선수단·이적 시장</button>
          <button onClick={onClose}>훈련 준비 마치기</button>
        </div>
      }
    >
      <div className={s.heading}>
        <span>GROW TOGETHER</span>
        <h2>오늘의 준비가, 내일의 전력.</h2>
        <p>
          시설 Lv.{w.facilities} · 감독 육성 {Math.round(w.manager.youth)} · {clubOf(w).name}
        </p>
      </div>
      <div className={s.focus} role="group" aria-label="훈련 집중 선택">
        {(Object.keys(plans) as TrainingFocus[]).map((value) => (
          <button
            key={value}
            aria-pressed={focus === value}
            disabled={processing || readonly || !!error || !!w.critical || focus === value}
            onClick={() => void select(value)}
          >
            <span className={s.symbol} aria-hidden="true">
              {plans[value].symbol}
            </span>
            <div>
              <b>
                {plans[value].name}
                {focus === value && ' · 적용 중'}
              </b>
              <span>{plans[value].benefit}</span>
              <small>{plans[value].cost}</small>
              <small>
                라운드 피로 회복 {trainingFocusInfo[value].recovery} ·{' '}
                {value === 'recovery'
                  ? '라운드 육성 없음'
                  : `성장 속도 ${trainingFocusInfo[value].developmentMultiplier}배`}
              </small>
            </div>
          </button>
        ))}
      </div>
      <p className={s.note}>
        훈련은 라운드가 끝날 때 한 번 적용돼요. 계획 변경이나 휴식일 진행으로 성장 보상을 중복
        획득하지 않습니다.
      </p>
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
      <section className={s.prospects} aria-label="성장하는 유망주">
        <h3>우리의 다음 주인공</h3>
        {prospects.length ? (
          prospects.map((p) => (
            <article key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>
                  {roleName[p.role]} · {w.year - p.born}세
                </small>
              </div>
              <div>
                <span>
                  능력 {overall(p)} / 잠재력 {Math.round(p.potential)}
                </span>
                <progress
                  aria-label={`${p.name} 잠재력 성장`}
                  value={overall(p)}
                  max={Math.max(overall(p), p.potential)}
                />
              </div>
              <strong>
                주요 능력 성장 +{(p.developed || 0).toFixed(2)}
                <small>실제 주요 능력의 평균 증가</small>
              </strong>
            </article>
          ))
        ) : (
          <p>지금은 27세 미만 유망주가 없어요. 이적 시장에서 다음 세대를 찾아보세요.</p>
        )}
      </section>
    </Dialog>
  );
}
