import { useEffect, useState } from 'react';
import type { PolicyLevel, World } from '../../../../packages/contracts/src/types';
import {
  BUILD_OPTIONS,
  BUILD_SLOTS,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import {
  BUILD_CARDS,
  BUILD_PRESETS,
  BUILD_SLOT_INFO,
  buildEffects,
  buildOf,
  buildPreset,
  buildTitleName,
  cardLines,
  cardOf,
  composeBuild,
  effectLines,
  sameBuild,
  type BuildCard,
} from '../../../../packages/engine/src/build';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import { academyIntakeOutlook } from '../../../../packages/engine/src/academy';
import { careOffer } from '../../../../packages/engine/src/care';
import { INCOMING_BID_CHANCE } from '../../../../packages/engine/src/transfers';
import { policyOf } from '../../../../packages/engine/src/policy';
import type { SavedStrategy } from '../adapters/profile';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  draftChanges,
  draftCommands,
  draftFromRequest,
  draftWorld,
  withCard,
  withPolicy,
  withStrategy,
  withTicket,
  type BoardDraft,
  type CardChange,
} from './board';
import { Dialog } from './Dialog';
import { DialChange, DialRow, stepIndex, stepValue, type DialKey } from './PolicyBoard';
import { useBoardRequest } from './state';
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
const cardLabel = (change: CardChange) => cardOf({ [change.slot]: change.to }, change.slot).label;

/**
 * The 운영 전략 tab as one operating board (→WEB-60, →ECON-25): the strategy in force, presets and
 * the owner's saved strategies (→WEB-61), six area rows each pairing its card row with its dials,
 * then the synergies and odds. Every tap adds to one draft; the pinned bar's 적용 sends it at once,
 * cards and dials alike changing at any time (→ECON-22).
 */
export function StrategyBoard({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions);
  const readonly = useGameState((state) => state.readonly);
  const blocked = acting || readonly || !!w.critical;
  const saved = useStrategies((state) => state.items);
  const removeSaved = useStrategies((state) => state.remove);
  const [draft, setDraftState] = useState<BoardDraft>({});
  const [failure, setFailure] = useState('');
  // The bar's details fold away on a small screen; the head and 적용 stay.
  const [folded, setFolded] = useState(false);
  const setDraft = (next: BoardDraft) => {
    setDraftState(next);
    setFailure('');
  };
  const [composer, setComposer] = useState<{
    id?: string;
    name: string;
    build: ClubBuild;
    title?: string;
  }>();
  const [removing, setRemoving] = useState<SavedStrategy>();

  // A dial change asked for elsewhere (a cash remedy) opens as the draft, its area in view.
  const request = useBoardRequest((store) => store.request);
  useEffect(() => {
    if (!request) return;
    useBoardRequest.getState().take();
    setDraft(draftFromRequest(w, request));
    const key: DialKey = request.policy?.key ?? 'ticket';
    const area = STRATEGY_AREAS.find((item) => item.dials.includes(key));
    requestAnimationFrame(() =>
      document
        .getElementById(`board-area-${area?.slot}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  }, [request]);

  const current = buildOf(w),
    changes = draftChanges(w, draft),
    changed = changes.length > 0,
    cards = changes.filter((change) => change.kind === 'card'),
    dials = changes.filter((change) => change.kind !== 'card'),
    draftBuild = cards.length ? draft.build! : current;
  // The history names what was applied; a preset or saved match reads better when there is one.
  const last = w.events.findLast((event) => event.kind === 'build'),
    applied = last && buildTitleName(last.title);
  const currentName =
    strategyName(current, saved) === '맞춤 방향' && applied
      ? applied
      : strategyName(current, saved);
  const draftName = cards.length
    ? (draft.name ?? strategyName(draftBuild, saved))
    : `다이얼 ${dials.length}개`;
  // The strategy in force can join the library unless it is standard or already there.
  const savable =
    BUILD_SLOTS.some((slot) => current[slot]) &&
    !saved.some((item) => sameBuild(item.build, current));

  // Synergies and odds follow the draft, so the owner sees what it would do before it counts.
  const preview = changed ? draftWorld(w, draft) : w;
  const now = synergyStates(w);
  const synergies = changed ? synergyStates(preview) : now;
  const wasActive = (id: string) => now.find((state) => state.id === id)!.active;
  const active = synergies.filter((synergy) => synergy.active).length;
  const met = (synergy: (typeof synergies)[number]) =>
    synergy.conditions.filter((condition) => condition.met).length;
  const ordered = [...synergies].sort((x, y) => met(y) - met(x));
  const lighting = synergies.filter((synergy) => synergy.active && !wasActive(synergy.id));
  const dropping = synergies.filter((synergy) => !synergy.active && wasActive(synergy.id));
  const synergyCard = (synergy: (typeof synergies)[number]) => {
    const was = wasActive(synergy.id);
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
              ? '적용하면 발동'
              : !synergy.active && was
                ? '적용하면 꺼짐'
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
    oddsDraft = changed ? strategyOdds(preview) : oddsNow,
    moving = oddsDraft.filter((odd, index) => odd.value !== oddsNow[index].value);

  // 적용 sends the strategy, then each dial, then the ticket, and stops at the first refusal.
  const apply = async () => {
    for (const command of draftCommands(w, draft)) {
      const reply = await client.command(command, { background: true });
      if (!reply?.ok) {
        setFailure((client.state.error || '방향을 적용하지 못했어요.').replace(/^Error: /, ''));
        return;
      }
    }
    setDraft({});
  };
  const pickDial = (key: DialKey, index: number) => {
    const drafted = dials.find((change) =>
      change.kind === 'ticket' ? key === 'ticket' : change.key === key,
    );
    const shown = drafted ? stepIndex(key, drafted.to) : undefined;
    // Tapping the drafted step again, or the step in force, takes the dial out of the draft.
    const value =
      index === shown ? (key === 'ticket' ? w.ticket : policyOf(w)[key]) : stepValue(key, index);
    setDraft(
      key === 'ticket'
        ? withTicket(w, draft, value)
        : withPolicy(w, draft, key, value as PolicyLevel),
    );
  };

  return (
    <section className={s.board} aria-label="방향" data-testid="strategy-board">
      <header className={s.head}>
        <p>
          줄마다 하나씩 골라요. 카드 줄은 구단이 어떻게 할지, 투자 줄은 얼마나 쓸지예요. 누른 것은
          화면 아래 초안에 모이고, 적용하면 한 번에 반영돼요. 언제든 다시 바꿀 수 있어요.
        </p>
      </header>

      <article className={s.current} aria-label="지금 방향">
        <div className={s.summaryHead}>
          <span>지금 방향</span>
          <b data-testid="current-strategy">{currentName}</b>
        </div>
        <small className={s.cards}>{cardSummary(current)}</small>
        <Lines {...effectLines(composeBuild(current))} />
      </article>

      <section className={s.group} aria-label="추천 방향">
        <h3>추천 방향</h3>
        <div className={s.presets}>
          {BUILD_PRESETS.map((preset) => {
            const lines = effectLines(composeBuild(preset.build));
            const drafted = cards.length > 0 && sameBuild(preset.build, draftBuild);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={drafted}
                className={`${s.preset} ${drafted ? s.presetOn : ''}`}
                disabled={blocked}
                onClick={() =>
                  setDraft(
                    drafted
                      ? withStrategy(w, draft, current)
                      : withStrategy(w, draft, preset.build, preset.label),
                  )
                }
              >
                <span className={s.presetHead}>
                  <b>{preset.label}</b>
                  {sameBuild(preset.build, current) && <em>지금 방향</em>}
                </span>
                <small>{preset.model}</small>
                <Lines {...lines} limit={2} />
                <span className={s.aim}>{preset.aim}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={s.group} aria-label="내 방향">
        <h3>
          내 방향 <small>이 기기의 모든 게임에서 쓸 수 있어요</small>
        </h3>
        {saved.length ? (
          <ul className={s.saved}>
            {saved.map((item) => {
              const drafted = cards.length > 0 && sameBuild(item.build, draftBuild);
              return (
                <li key={item.id} className={drafted ? s.presetOn : ''}>
                  <button
                    type="button"
                    className={s.savedPick}
                    aria-pressed={drafted}
                    disabled={blocked}
                    onClick={() =>
                      setDraft(
                        drafted
                          ? withStrategy(w, draft, current)
                          : withStrategy(w, draft, item.build, item.name),
                      )
                    }
                  >
                    <span className={s.presetHead}>
                      <b>{item.name}</b>
                      {sameBuild(item.build, current) && <em>지금 방향</em>}
                    </span>
                    <small>{cardSummary(item.build)}</small>
                  </button>
                  <div className={s.savedTools}>
                    <button
                      type="button"
                      aria-label={`${item.name} 편집`}
                      onClick={() =>
                        setComposer({ id: item.id, name: item.name, build: item.build })
                      }
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
              );
            })}
          </ul>
        ) : (
          <p className={s.neutral}>
            아직 저장한 방향이 없어요. 여섯 부문의 카드를 골라 우리 구단만의 방향을 만들어 보세요.
          </p>
        )}
        <div className={s.makeRow}>
          <button
            type="button"
            className={s.make}
            onClick={() => setComposer({ name: '', build: draftBuild })}
          >
            ＋ 방향 만들기
          </button>
          {savable && (
            <button
              type="button"
              className={s.make}
              onClick={() =>
                setComposer({
                  name: buildPreset(current) || currentName === '맞춤 방향' ? '' : currentName,
                  build: current,
                  title: '지금 방향 저장',
                })
              }
            >
              지금 방향 저장
            </button>
          )}
        </div>
      </section>

      <section className={s.areas} aria-label="부문별 카드와 다이얼">
        <h3>
          여섯 부문 <small>카드는 어떻게 · 다이얼은 얼마나</small>
        </h3>
        {STRATEGY_AREAS.map((area) => {
          const slot = area.slot,
            info = BUILD_SLOT_INFO[slot],
            chosen = draftBuild[slot],
            moved = cards.some((change) => change.slot === slot),
            card: BuildCard = cardOf(draftBuild, slot),
            options: (string | undefined)[] = [undefined, ...BUILD_OPTIONS[slot]];
          return (
            <section
              key={slot}
              id={`board-area-${slot}`}
              className={`${s.area} ${area.dials.length ? '' : s.cardOnly}`}
              aria-label={area.label}
              data-area={slot}
            >
              <div className={s.areaCard}>
                <header className={s.areaHead}>
                  <span className={s.domainIcon} aria-hidden="true">
                    {area.icon}
                  </span>
                  <span>
                    <b>{area.label}</b>
                    <small>
                      {info.label} 카드 · {area.question}
                    </small>
                  </span>
                </header>
                <div className={s.options} role="radiogroup" aria-label={info.label}>
                  {options.map((option) => {
                    const label = option
                      ? (BUILD_CARDS[slot] as Record<string, BuildCard>)[option].label
                      : '기본';
                    return (
                      <button
                        key={option ?? 'standard'}
                        type="button"
                        role="radio"
                        aria-checked={option === current[slot]}
                        aria-label={`${info.label} ${label}`}
                        className={moved && option === chosen ? s.drafted : undefined}
                        disabled={blocked}
                        onClick={() =>
                          setDraft(
                            withCard(
                              w,
                              draft,
                              slot,
                              moved && option === chosen ? current[slot] : option,
                            ),
                          )
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className={`${s.cardNote} ${moved ? s.cardDrafted : ''}`}>
                  <p className={s.model}>
                    <b>
                      {moved ? '적용하면 · ' : ''}
                      {card.label}
                    </b>{' '}
                    {card.model}
                  </p>
                  <Lines {...cardLines(card)} />
                </div>
              </div>
              {area.dials.length > 0 && (
                <div className={s.areaDials}>
                  {area.dials.map((key) => {
                    const drafted = dials.find((change) =>
                      change.kind === 'ticket' ? key === 'ticket' : change.key === key,
                    );
                    return (
                      <DialRow
                        key={key}
                        w={w}
                        dialKey={key}
                        drafted={drafted ? stepIndex(key, drafted.to) : undefined}
                        disabled={blocked}
                        onPick={(index) => pickDial(key, index)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </section>

      <section className={s.synergies} aria-label="방향 시너지">
        <h3>
          시너지{' '}
          <small>
            {active}/{synergies.length} 발동{changed ? ' · 적용 시' : ''}
          </small>
        </h3>
        <ul>{ordered.slice(0, 3).map(synergyCard)}</ul>
        <details className={s.more}>
          <summary>나머지 시너지 {ordered.length - 3}개 조건 보기</summary>
          <ul>{ordered.slice(3).map(synergyCard)}</ul>
        </details>
      </section>

      <section className={s.odds} aria-label="방향 확률">
        <h3>{changed ? '적용하면 바뀌는 확률' : '지금 방향의 확률'}</h3>
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

      {changed && (
        <aside className={s.draft} aria-label="적용 대기" data-testid="strategy-draft">
          <div className={s.draftHead}>
            <span>적용하면</span>
            <b>{draftName}</b>
            <button
              type="button"
              className={s.fold}
              aria-expanded={!folded}
              aria-controls="strategy-draft-body"
              onClick={() => setFolded(!folded)}
            >
              {changes.length}건 변경 <i aria-hidden="true">{folded ? '▴' : '▾'}</i>
            </button>
          </div>
          <div className={s.draftBody} id="strategy-draft-body" hidden={folded} aria-live="polite">
            {(lighting.length > 0 || dropping.length > 0) && (
              <p className={s.shift}>
                {[
                  ...lighting.map((synergy) => `시너지 ${synergy.label} 발동`),
                  ...dropping.map((synergy) => `시너지 ${synergy.label} 꺼짐`),
                ].join(' · ')}
              </p>
            )}
            {cards.length > 0 && (
              <>
                <p className={s.draftCards}>
                  카드 {cards.map((change) => cardLabel(change)).join(' · ')}
                </p>
                <Lines {...effectLines(composeBuild(draftBuild))} />
              </>
            )}
            {dials.length > 0 && (
              <ul className={s.draftDials}>
                {dials.map((change) => (
                  <DialChange
                    key={change.kind === 'ticket' ? 'ticket' : change.key}
                    w={w}
                    change={change}
                  />
                ))}
              </ul>
            )}
            {moving.length > 0 && (
              <p className={s.moving}>
                {moving
                  .map(
                    (odd) => `${odd.label} ${oddsNow[oddsDraft.indexOf(odd)].value} → ${odd.value}`,
                  )
                  .join(' · ')}
              </p>
            )}
          </div>
          {failure && (
            <p className={s.failure} role="alert">
              {failure}
            </p>
          )}
          <div className={s.confirm}>
            <button type="button" disabled={acting} onClick={() => setDraft({})}>
              되돌리기
            </button>
            <button
              type="button"
              className={s.apply}
              disabled={blocked}
              onClick={() => void apply()}
            >
              적용
            </button>
          </div>
        </aside>
      )}

      {composer && (
        <StrategyComposer
          w={w}
          initial={composer}
          title={composer.title}
          onClose={() => setComposer(undefined)}
          onSaved={() => setComposer(undefined)}
          onApply={(item) => {
            setComposer(undefined);
            setDraft(withStrategy(w, draft, item.build, item.name));
          }}
        />
      )}
      {removing && (
        <Dialog label="방향 삭제" onClose={() => setRemoving(undefined)}>
          <p>
            ‘{removing.name}’ 방향을 이 기기에서 지울까요? 이미 적용해 쓰고 있는 방향은 그대로
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
