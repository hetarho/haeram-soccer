import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { BUILD_SLOTS, type ClubBuild } from '../../../../packages/contracts/src/build';
import {
  BUILD_PRESETS,
  buildEffects,
  buildLock,
  buildOf,
  cardOf,
  composeBuild,
  effectLines,
  sameBuild,
} from '../../../../packages/engine/src/build';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import { academyIntakeOutlook } from '../../../../packages/engine/src/academy';
import { careOffer } from '../../../../packages/engine/src/care';
import { INCOMING_BID_CHANCE } from '../../../../packages/engine/src/transfers';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import type { SavedStrategy } from '../adapters/profile';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { PolicyDials } from './PolicyBoard';
import { Lines, StrategyComposer, STRATEGY_AREAS } from './StrategyComposer';
import { strategyName, useStrategies } from './strategies';
import s from './StrategyBoard.module.css';
import a from './App.module.css';

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** The odds a strategy sets, stated as football outcomes the owner can watch for. */
function strategyOdds(w: World) {
  const intake = academyIntakeOutlook(w),
    meeting = careOffer(w, 'meeting').outcomes[0].chance,
    offers = 1 - (1 - INCOMING_BID_CHANCE * buildEffects(w).incomingBids) ** 30;
  return [
    { label: '다음 유스 입단에서 잠재력 80+ 유망주', value: pct(intake.golden) },
    { label: '감독 주재 선수단 미팅이 분위기를 바꿀 확률', value: `${meeting}%` },
    { label: '이적시장 한 달 동안 다른 구단 제안이 올 확률', value: pct(offers) },
  ];
}

/** The cards a strategy changes from standard, in the owner's words. */
export function cardSummary(build: ClubBuild) {
  const cards = BUILD_SLOTS.filter((slot) => build[slot]).map((slot) => cardOf(build, slot).label);
  return cards.join(' · ') || '모든 부문 기본';
}

/**
 * The club's operating strategy (→WEB-60, →ECON-22): the one in force, ready-made presets, the
 * owner's saved strategies (→WEB-61), the dials that spend on each area, then the synergies and
 * odds the strategy sets. Choosing opens a draft that commits once a season.
 */
export function StrategyBoard({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const saved = useStrategies((state) => state.items);
  const removeSaved = useStrategies((state) => state.remove);
  const current = buildOf(w);
  // A draft stays until the owner confirms; a newly committed strategy clears it.
  const [edits, setEdits] = useState<{ base: ClubBuild; build: ClubBuild; name?: string }>();
  const draft = edits && sameBuild(edits.base, current) ? edits : undefined;
  const draftBuild = draft?.build ?? current;
  const changed = !sameBuild(draftBuild, current);
  const lock = buildLock(w);
  const [composer, setComposer] = useState<{ id?: string; name: string; build: ClubBuild }>();
  const [removing, setRemoving] = useState<SavedStrategy>();
  const choose = (build: ClubBuild, name?: string) =>
    setEdits(sameBuild(build, current) ? undefined : { base: current, build, name });
  // The history names what was committed; a preset or saved match reads better when there is one.
  const committed = w.events.findLast((event) => event.kind === 'build')?.title.split(' · ')[1];
  const currentName =
    strategyName(current, saved) === '맞춤 전략' && committed
      ? committed
      : strategyName(current, saved);
  const draftName = draft?.name ?? strategyName(draftBuild, saved);
  // Synergies and odds follow the draft, so the owner sees what a strategy would do before it counts.
  const preview = changed ? { ...w, build: draftBuild } : w;
  const now = synergyStates(w);
  const synergies = changed ? synergyStates(preview) : now;
  const active = synergies.filter((synergy) => synergy.active).length;
  const met = (synergy: (typeof synergies)[number]) =>
    synergy.conditions.filter((condition) => condition.met).length;
  const ordered = [...synergies].sort((x, y) => met(y) - met(x));
  const lighting = synergies.filter(
    (synergy) => synergy.active && !now.find((state) => state.id === synergy.id)!.active,
  );
  const dropping = synergies.filter(
    (synergy) => !synergy.active && now.find((state) => state.id === synergy.id)!.active,
  );
  const synergyCard = (synergy: (typeof synergies)[number]) => {
    const was = now.find((state) => state.id === synergy.id)!.active;
    return (
      <li
        key={synergy.id}
        className={synergy.active ? s.on : undefined}
        data-testid={`synergy-${synergy.id}`}
      >
        <div className={s.synergyHead}>
          <b>{synergy.label}</b>
          <em>
            {synergy.active && !was
              ? '확정하면 발동'
              : !synergy.active && was
                ? '확정하면 꺼짐'
                : synergy.active
                  ? '발동 중'
                  : `${met(synergy)}/${synergy.conditions.length}`}
          </em>
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
  };
  const oddsNow = strategyOdds(w),
    oddsDraft = changed ? strategyOdds(preview) : oddsNow;
  return (
    <section className={s.board} aria-label="운영 전략" data-testid="strategy-board">
      <header className={s.head}>
        <h2>운영 전략</h2>
        <p>
          구단이 어떤 방식으로 굴러갈지 정해요. 추천 전략을 고르거나 나만의 전략을 만들어 저장해
          두고, 시즌마다 한 번 확정해요. 결과는 확률이라 시즌마다 달라질 수 있어요.
        </p>
      </header>

      <article className={s.current} aria-label="지금 전략">
        <div className={s.summaryHead}>
          <span>지금 전략</span>
          <b data-testid="current-strategy">{currentName}</b>
        </div>
        <small className={s.cards}>{cardSummary(current)}</small>
        <Lines {...effectLines(composeBuild(current))} />
        {lock && <p className={s.neutral}>{lock}</p>}
      </article>

      <section className={s.group} aria-label="추천 전략">
        <h3>추천 전략</h3>
        <div className={s.presets}>
          {BUILD_PRESETS.map((preset) => {
            const lines = effectLines(composeBuild(preset.build));
            const isCurrent = sameBuild(preset.build, current);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={sameBuild(preset.build, draftBuild)}
                className={`${s.preset} ${sameBuild(preset.build, draftBuild) ? s.presetOn : ''}`}
                disabled={acting}
                onClick={() => choose(preset.build)}
              >
                <span className={s.presetHead}>
                  <b>{preset.label}</b>
                  {isCurrent && <em>지금 전략</em>}
                </span>
                <small>{preset.model}</small>
                <Lines {...lines} limit={2} />
                <span className={s.aim}>{preset.aim}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={s.group} aria-label="내 전략">
        <h3>
          내 전략 <small>이 기기의 모든 게임에서 쓸 수 있어요</small>
        </h3>
        {saved.length ? (
          <ul className={s.saved}>
            {saved.map((item) => (
              <li key={item.id} className={sameBuild(item.build, draftBuild) ? s.presetOn : ''}>
                <button
                  type="button"
                  className={s.savedPick}
                  aria-pressed={sameBuild(item.build, draftBuild)}
                  disabled={acting}
                  onClick={() => choose(item.build, item.name)}
                >
                  <span className={s.presetHead}>
                    <b>{item.name}</b>
                    {sameBuild(item.build, current) && <em>지금 전략</em>}
                  </span>
                  <small>{cardSummary(item.build)}</small>
                </button>
                <div className={s.savedTools}>
                  <button
                    type="button"
                    aria-label={`${item.name} 편집`}
                    onClick={() => setComposer({ id: item.id, name: item.name, build: item.build })}
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    aria-label={`${item.name} 삭제`}
                    onClick={() => setRemoving(item)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.neutral}>
            아직 저장한 전략이 없어요. 여섯 부문의 카드를 골라 우리 구단만의 전략을 만들어 보세요.
          </p>
        )}
        <button
          type="button"
          className={s.make}
          onClick={() => setComposer({ name: '', build: draftBuild })}
        >
          ＋ 나만의 전략 만들기
        </button>
      </section>

      {changed && (
        <article className={s.summary} aria-live="polite" data-testid="strategy-draft">
          <div className={s.summaryHead}>
            <span>확정하면</span>
            <b>{draftName}</b>
          </div>
          <Lines {...effectLines(composeBuild(draftBuild))} />
          {(lighting.length > 0 || dropping.length > 0) && (
            <p className={s.shift}>
              {lighting.map((synergy) => `시너지 ${synergy.label} 발동`).join(' · ')}
              {lighting.length > 0 && dropping.length > 0 ? ' · ' : ''}
              {dropping.map((synergy) => `시너지 ${synergy.label} 꺼짐`).join(' · ')}
            </p>
          )}
          <div className={s.confirm}>
            <button disabled={acting} onClick={() => setEdits(undefined)}>
              되돌리기
            </button>
            <button
              className={s.apply}
              disabled={acting || !!lock}
              onClick={() => {
                void client.command({
                  type: 'build',
                  build: draftBuild,
                  ...(draft?.name ? { name: draft.name } : {}),
                });
                setEdits(undefined);
              }}
            >
              {lock ?? '이 전략으로 확정'}
            </button>
          </div>
        </article>
      )}

      <section className={s.group} aria-label="운영 다이얼">
        <h3>
          운영 다이얼 <small>언제든 · 다음 정산부터</small>
        </h3>
        <p className={s.neutral}>
          전략이 어떻게 할지라면, 다이얼은 얼마나 쓸지예요. 전략을 바꿔도 다이얼은 그대로예요.
        </p>
        <div className={s.dials}>
          {STRATEGY_AREAS.filter((area) => area.dials.length).map((area) => (
            <article key={area.slot} className={s.domain} aria-label={`${area.label} 다이얼`}>
              <h4 className={s.areaLabel}>{area.label}</h4>
              <PolicyDials w={w} client={client} keys={area.dials} />
            </article>
          ))}
        </div>
      </section>

      <section className={s.synergies} aria-label="전략 시너지">
        <h3>
          시너지{' '}
          <small>
            {active}/{synergies.length} 발동{changed ? ' · 확정 시' : ''}
          </small>
        </h3>
        <ul>{ordered.slice(0, 3).map(synergyCard)}</ul>
        <details className={s.more}>
          <summary>나머지 시너지 {ordered.length - 3}개 조건 보기</summary>
          <ul>{ordered.slice(3).map(synergyCard)}</ul>
        </details>
      </section>

      <section className={s.odds} aria-label="전략 확률">
        <h3>{changed ? '확정하면 바뀌는 확률' : '지금 전략의 확률'}</h3>
        <ul>
          {oddsDraft.map((odd, index) => (
            <li key={odd.label}>
              <span>{odd.label}</span>
              <b>
                {changed && oddsNow[index].value !== odd.value
                  ? `${oddsNow[index].value} → ${odd.value}`
                  : odd.value}
              </b>
            </li>
          ))}
        </ul>
      </section>

      <article className={s.manager}>
        <span>감독 성향</span>
        <b>
          {w.manager.style && !w.manager.interim ? STYLE_INFO[w.manager.style].label : '기본형'}
        </b>
        <small>감독실에서 성향이 다른 후보를 비교하고 선임할 수 있어요.</small>
      </article>

      {composer && (
        <StrategyComposer
          w={w}
          initial={composer}
          onClose={() => setComposer(undefined)}
          onSaved={(item) => {
            setComposer(undefined);
            choose(item.build, item.name);
          }}
        />
      )}
      {removing && (
        <Dialog label="전략 삭제" onClose={() => setRemoving(undefined)}>
          <p>
            ‘{removing.name}’ 전략을 이 기기에서 지울까요? 이미 확정해 쓰고 있는 전략은 그대로
            유지돼요.
          </p>
          <div className={a.actions}>
            <button onClick={() => setRemoving(undefined)}>취소</button>
            <button
              className={a.primary}
              onClick={() => {
                removeSaved(removing.id);
                setRemoving(undefined);
              }}
            >
              삭제
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
