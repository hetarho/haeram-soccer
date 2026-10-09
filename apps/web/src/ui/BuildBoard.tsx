import { useState } from 'react';
import type { ClubVision, World } from '../../../../packages/contracts/src/types';
import {
  CLUB_VISIONS,
  VISION_INFO,
  visionEffects,
  visionLock,
  visionOf,
} from '../../../../packages/engine/src/vision';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import { academyIntakeOutlook } from '../../../../packages/engine/src/academy';
import { careOffer } from '../../../../packages/engine/src/care';
import { INCOMING_BID_CHANCE } from '../../../../packages/engine/src/transfers';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import s from './BuildBoard.module.css';

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** The odds this build sets, stated as football outcomes the owner can watch for. */
function buildOdds(w: World) {
  const intake = academyIntakeOutlook(w),
    meeting = careOffer(w, 'meeting').outcomes[0].chance,
    offers = 1 - (1 - INCOMING_BID_CHANCE * visionEffects(w).incomingBids) ** 30;
  return [
    { label: '다음 유스 입단에서 잠재력 80+ 유망주', value: pct(intake.golden) },
    { label: '감독 주재 선수단 미팅이 분위기를 바꿀 확률', value: `${meeting}%` },
    { label: '이적시장 한 달 동안 다른 구단 제안이 올 확률', value: pct(offers) },
  ];
}

/**
 * The club build (→ECON-22, →CLUB-21): one vision card for the season, the manager's school,
 * and the synergies that light up when the cards point the same way.
 */
export function BuildBoard({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const [choosing, setChoosing] = useState<ClubVision>();
  const current = visionOf(w),
    lock = visionLock(w),
    info = VISION_INFO[current];
  const synergies = synergyStates(w);
  const active = synergies.filter((synergy) => synergy.active).length;
  // Lit and nearly lit synergies first; the rest wait behind one disclosure on small screens.
  const met = (synergy: (typeof synergies)[number]) =>
    synergy.conditions.filter((condition) => condition.met).length;
  const ordered = [...synergies].sort((a, b) => met(b) - met(a));
  const card = (synergy: (typeof synergies)[number]) => (
    <li
      key={synergy.id}
      className={synergy.active ? s.on : undefined}
      data-testid={`synergy-${synergy.id}`}
    >
      <div className={s.synergyHead}>
        <b>{synergy.label}</b>
        <em>{synergy.active ? '발동 중' : `${met(synergy)}/${synergy.conditions.length}`}</em>
      </div>
      <small>{synergy.idea}</small>
      <ul>
        {synergy.conditions.map((condition) => (
          <li key={condition.label} className={condition.met ? s.met : s.unmet}>
            {condition.met ? '✓' : '·'} {condition.label}
          </li>
        ))}
      </ul>
      <p>보너스 · {synergy.bonus}</p>
    </li>
  );
  const preview = choosing && VISION_INFO[choosing];
  return (
    <section className={s.board} aria-label="구단 빌드" data-testid="build-board">
      <header className={s.head}>
        <h2>구단 빌드</h2>
        <p>
          비전 · 감독 성향 · 스태프 · 운영 방침이 같은 방향을 가리키면 시너지가 켜져요. 결과는
          확률이라 매 시즌 달라질 수 있어요.
        </p>
      </header>

      <article className={s.vision}>
        <div className={s.visionHead}>
          <span>구단 비전</span>
          <b>{info.label}</b>
          <small>{info.model}</small>
        </div>
        <ul>
          {info.pros.map((line) => (
            <li key={line} className={s.pro}>
              ▲ {line}
            </li>
          ))}
          {info.cons.map((line) => (
            <li key={line} className={s.con}>
              ▼ {line}
            </li>
          ))}
        </ul>
        <div className={s.cards} role="radiogroup" aria-label="구단 비전 선택">
          {CLUB_VISIONS.map((vision) => (
            <button
              key={vision}
              role="radio"
              aria-checked={vision === current}
              className={`${vision === current ? s.current : ''} ${vision === choosing ? s.choosing : ''}`}
              disabled={acting}
              onClick={() =>
                setChoosing(vision === current || vision === choosing ? undefined : vision)
              }
            >
              {VISION_INFO[vision].label}
            </button>
          ))}
        </div>
        {preview && choosing && (
          <div className={s.preview}>
            <p>
              <b>바꾸면 · {preview.label}</b> — {preview.model}
            </p>
            <ul>
              {[
                ...preview.pros.map((line) => `▲ ${line}`),
                ...preview.cons.map((line) => `▼ ${line}`),
              ].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className={s.confirm}>
              <button onClick={() => setChoosing(undefined)}>그대로 두기</button>
              <button
                className={s.apply}
                disabled={acting || !!lock}
                onClick={() => {
                  void client.command({ type: 'vision', vision: choosing });
                  setChoosing(undefined);
                }}
              >
                {lock ?? `‘${preview.label}’로 정하기`}
              </button>
            </div>
          </div>
        )}
      </article>

      <article className={s.manager}>
        <span>감독 성향</span>
        <b>
          {w.manager.style && !w.manager.interim ? STYLE_INFO[w.manager.style].label : '기본형'}
        </b>
        <small>감독실에서 성향이 다른 후보를 비교하고 선임할 수 있어요.</small>
      </article>

      <section className={s.synergies} aria-label="빌드 시너지">
        <h3>
          시너지{' '}
          <small>
            {active}/{synergies.length} 발동
          </small>
        </h3>
        <ul>{ordered.slice(0, 3).map(card)}</ul>
        <details className={s.more}>
          <summary>나머지 시너지 {ordered.length - 3}개 조건 보기</summary>
          <ul>{ordered.slice(3).map(card)}</ul>
        </details>
      </section>

      <section className={s.odds} aria-label="빌드 확률">
        <h3>지금 빌드의 확률</h3>
        <ul>
          {buildOdds(w).map((odd) => (
            <li key={odd.label}>
              <span>{odd.label}</span>
              <b>{odd.value}</b>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
