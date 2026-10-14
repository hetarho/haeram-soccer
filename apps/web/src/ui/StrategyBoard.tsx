import { useEffect, useState } from 'react';
import type { DirectionKey, PolicyLevel, World } from '../../../../packages/contracts/src/types';
import {
  BUILD_OPTIONS,
  BUILD_SLOTS,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import {
  BUILD_PRESETS,
  BUILD_SLOT_INFO,
  buildEffects,
  buildOf,
  buildTitleName,
  cardLines,
  cardOf,
  composeBuild,
  effectLines,
  type BuildCard,
} from '../../../../packages/engine/src/build';
import { delegated } from '../../../../packages/engine/src/intervention';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import { academyIntakeOutlook } from '../../../../packages/engine/src/academy';
import { careOffer } from '../../../../packages/engine/src/care';
import { INCOMING_BID_CHANCE } from '../../../../packages/engine/src/transfers';
import { policyOf } from '../../../../packages/engine/src/policy';
import type { SavedRows, SavedStrategy } from '../adapters/profile';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  areaBase,
  areaSummary,
  draftChanges,
  draftCommands,
  draftFromRequest,
  draftWorld,
  withCard,
  withDirection,
  withPolicy,
  withStrategy,
  withTicket,
  type BoardDraft,
  type CardChange,
  type DirectionChange,
  type PolicyChange,
  type TicketChange,
} from './board';
import { Dialog } from './Dialog';
import {
  DialChange,
  DirectionChangeLine,
  dialInfo,
  DialLines,
  stepIndex,
  stepValue,
  type DialKey,
} from './PolicyBoard';
import { DirectionRow } from './DirectionRow';
import { useBoardRequest } from './state';
import { Lines, StrategyComposer } from './StrategyComposer';
import { areaOf, DIRECTION_AREAS, isDirectionRow, type AreaKey } from './areas';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import { boardRows, savedMatches, savedRows, strategyName, useStrategies } from './strategies';
import { presetBoard, sameBoard, worldBoard } from '../../../../packages/engine/src/presets';
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
  return cards.join(' · ') || '모든 부문 표준';
}
const cardLabel = (change: CardChange) => cardOf({ [change.slot]: change.to }, change.slot).label;

/**
 * The 방향 page tab as one board (→WEB-60, →ECON-25): the direction in force, presets and the
 * owner's saved directions (→WEB-61), six areas folded behind headers whose cards and dials are
 * rows of one kind (→DirectionRow), then the synergies and odds. Every tap adds to one draft; the
 * pinned bar's 적용 sends it at once, cards and dials alike changing at any time (→ECON-22).
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
    rows?: SavedRows;
    title?: string;
  }>();
  const [removing, setRemoving] = useState<SavedStrategy>();
  // Areas start folded behind headers naming their options in force; the owner opens the ones he
  // works on, and a request from elsewhere opens its own (→WEB-60).
  const [opened, setOpened] = useState<ReadonlySet<AreaKey>>(() => new Set());
  const toggle = (key: AreaKey) =>
    setOpened((open) => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A dial change asked for elsewhere (a cash remedy) opens as the draft, its area in view; a line
  // naming a row elsewhere (사람's decision panels) only unfolds its area.
  const request = useBoardRequest((store) => store.request);
  useEffect(() => {
    if (!request) return;
    useBoardRequest.getState().take();
    const area = request.area
      ? DIRECTION_AREAS.find((item) => item.key === request.area)
      : areaOf(request.policy?.key ?? 'ticket');
    if (!request.area) setDraft(draftFromRequest(w, request));
    if (area) setOpened((open) => new Set(open).add(area.key));
    requestAnimationFrame(() =>
      document
        .getElementById(`board-area-${area?.key}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  }, [request]);

  const current = buildOf(w),
    changes = draftChanges(w, draft),
    changed = changes.length > 0,
    cards = changes.filter((change) => change.kind === 'card'),
    dials = changes.filter(
      (change): change is PolicyChange | TicketChange =>
        change.kind === 'policy' || change.kind === 'ticket',
    ),
    rows = changes.filter((change): change is DirectionChange => change.kind === 'direction'),
    draftBuild = cards.length ? draft.build! : current;
  // The history names what was applied; a preset or saved match reads better when there is one.
  const last = w.events.findLast((event) => event.kind === 'build'),
    applied = last && buildTitleName(last.title);
  // Names read whole boards (→ECON-25): a preset or a saved direction is in force only when every
  // row it fills is.
  const currentBoard = worldBoard(w),
    draftBoard = worldBoard(draftWorld(w, draft));
  const currentName =
    strategyName(currentBoard, saved) === '맞춤 방향' && applied
      ? applied
      : strategyName(currentBoard, saved);
  const draftName = cards.length
    ? (draft.name ?? strategyName(draftBoard, saved))
    : `줄 ${dials.length + rows.length}개`;
  // The direction in force can join the library unless it is 기본 방향 or already there.
  const savable =
    !sameBoard(currentBoard, presetBoard({ build: {}, rows: {} })) &&
    !saved.some((item) => savedMatches(item, currentBoard));

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

  const pickDirection = (key: DirectionKey, index: number) => {
    const option = DIRECTION_INFO[key].options[index].id,
      drafted = rows.find((change) => change.key === key);
    // Tapping the drafted option again, or the option in force, takes the row out of the draft.
    setDraft(withDirection(w, draft, key, drafted?.to === option ? directionOf(w, key) : option));
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
            const board = presetBoard(preset),
              drafted = changed && sameBoard(board, draftBoard);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={drafted}
                className={`${s.preset} ${drafted ? s.presetOn : ''}`}
                disabled={blocked}
                onClick={() =>
                  setDraft(
                    // Tapping the drafted preset again clears the draft.
                    drafted ? {} : withStrategy(w, draft, preset.build, preset.label, preset.rows),
                  )
                }
              >
                <span className={s.presetHead}>
                  <b>{preset.label}</b>
                  {sameBoard(board, currentBoard) && <em>지금 방향</em>}
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
              const drafted = changed && savedMatches(item, draftBoard);
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
                          ? {}
                          : withStrategy(
                              w,
                              draft,
                              item.build,
                              item.name,
                              item.rows && savedRows(item.rows),
                            ),
                      )
                    }
                  >
                    <span className={s.presetHead}>
                      <b>{item.name}</b>
                      {savedMatches(item, currentBoard) && <em>지금 방향</em>}
                    </span>
                    <small>{cardSummary(item.build)}</small>
                  </button>
                  <div className={s.savedTools}>
                    <button
                      type="button"
                      aria-label={`${item.name} 편집`}
                      onClick={() =>
                        setComposer({
                          id: item.id,
                          name: item.name,
                          build: item.build,
                          rows: item.rows,
                        })
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
            onClick={() =>
              setComposer({ name: '', build: draftBuild, rows: boardRows(draftBoard) })
            }
          >
            ＋ 방향 만들기
          </button>
          {savable && (
            <button
              type="button"
              className={s.make}
              onClick={() =>
                setComposer({
                  name:
                    BUILD_PRESETS.some((preset) => sameBoard(presetBoard(preset), currentBoard)) ||
                    currentName === '맞춤 방향'
                      ? ''
                      : currentName,
                  build: current,
                  rows: boardRows(currentBoard),
                  title: '지금 방향 저장',
                })
              }
            >
              지금 방향 저장
            </button>
          )}
        </div>
      </section>

      <section className={s.areas} aria-label="부문별 방향">
        <h3>
          일곱 부문 <small>부문을 열어 줄마다 하나씩 골라요</small>
        </h3>
        {DIRECTION_AREAS.map((area) => {
          const key = area.key,
            open = opened.has(key),
            slot = area.card,
            cardMoved = !!slot && cards.some((change) => change.slot === slot),
            rowMoved = [...dials, ...rows].some((change) =>
              area.rows.includes(change.kind === 'ticket' ? 'ticket' : change.key),
            ),
            card: BuildCard | undefined = slot && cardOf(draftBuild, slot),
            options: (string | undefined)[] = slot ? [undefined, ...BUILD_OPTIONS[slot]] : [],
            drafted = slot && cardMoved ? options.indexOf(draftBuild[slot]) : undefined;
          return (
            <section
              key={key}
              id={`board-area-${key}`}
              className={s.area}
              aria-label={area.label}
              data-area={key}
            >
              <button
                type="button"
                className={s.areaHead}
                aria-expanded={open}
                aria-controls={`board-area-body-${key}`}
                onClick={() => toggle(key)}
              >
                <span className={s.domainIcon} aria-hidden="true">
                  {area.icon}
                </span>
                <span>
                  <b>
                    {area.label}
                    {(cardMoved || rowMoved) && <em className={s.areaDraft}>초안</em>}
                  </b>
                  <small>{area.question}</small>
                  <span className={s.areaSummary} data-testid={`area-summary-${key}`}>
                    {areaSummary(w, area)}
                  </span>
                  {area.base && (
                    <span className={s.areaBase} data-testid={`area-base-${key}`}>
                      {areaBase(w, area)}
                    </span>
                  )}
                </span>
                <i aria-hidden="true">{open ? '▴' : '▾'}</i>
              </button>
              {open && (
                <div id={`board-area-body-${key}`} className={s.areaBody}>
                  {key === 'scouting' && delegated(w, 'transfers') && (
                    <p className={s.areaNote}>
                      개입 4단계라 단장이 이 부문의 줄과 재정 기조에 따라 선수를 영입해요.
                    </p>
                  )}
                  {slot && card && (
                    <DirectionRow
                      row={slot}
                      label={BUILD_SLOT_INFO[slot].label}
                      // The header already asks the area's question; a card row asks only its own.
                      question={
                        BUILD_SLOT_INFO[slot].question === area.question
                          ? undefined
                          : BUILD_SLOT_INFO[slot].question
                      }
                      options={options.map((option) => cardOf({ [slot]: option }, slot).label)}
                      inForce={options.indexOf(current[slot])}
                      drafted={drafted}
                      disabled={blocked}
                      detail={
                        <>
                          <p className={s.model}>
                            <b>
                              {cardMoved ? '적용하면 · ' : ''}
                              {card.label}
                            </b>{' '}
                            {card.model}
                          </p>
                          <Lines {...cardLines(card)} />
                        </>
                      }
                      onPick={(index) =>
                        setDraft(
                          withCard(
                            w,
                            draft,
                            slot,
                            // Tapping the drafted card again takes the row out of the draft.
                            index === drafted ? current[slot] : options[index],
                          ),
                        )
                      }
                    />
                  )}
                  {area.rows.map((row) => {
                    if (isDirectionRow(row)) {
                      const info = DIRECTION_INFO[row],
                        change = rows.find((item) => item.key === row),
                        inForce = info.options.findIndex(
                          (option) => option.id === directionOf(w, row),
                        ),
                        step = change
                          ? info.options.findIndex((option) => option.id === change.to)
                          : undefined,
                        shown = info.options[step ?? inForce];
                      return (
                        <DirectionRow
                          key={row}
                          row={row}
                          label={info.label}
                          question={info.question}
                          options={info.options.map((option) => option.name)}
                          inForce={inForce}
                          drafted={step}
                          disabled={blocked}
                          detail={
                            <p>
                              {step !== undefined && <b>적용하면 · </b>}
                              {shown.summary}
                            </p>
                          }
                          onPick={(index) => pickDirection(row, index)}
                        />
                      );
                    }
                    const dial = dialInfo(w, row),
                      change = dials.find((item) =>
                        item.kind === 'ticket' ? row === 'ticket' : item.key === row,
                      ),
                      step = change ? stepIndex(row, change.to) : undefined,
                      shown = step ?? dial.current;
                    return (
                      <DirectionRow
                        key={row}
                        row={row}
                        label={dial.label}
                        question={dial.question}
                        options={dial.levels.map((level) => level.name)}
                        inForce={dial.current}
                        drafted={step}
                        disabled={blocked}
                        detail={
                          shown >= 0 && (
                            <>
                              <p>
                                {step !== undefined && <b>적용하면 · </b>}
                                {dial.levels[shown].summary}
                              </p>
                              <DialLines w={w} dialKey={row} index={shown} />
                            </>
                          )
                        }
                        onPick={(index) => pickDial(row, index)}
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
            {dials.length + rows.length > 0 && (
              <ul className={s.draftDials}>
                {dials.map((change) => (
                  <DialChange
                    key={change.kind === 'ticket' ? 'ticket' : change.key}
                    w={w}
                    change={change}
                  />
                ))}
                {rows.map((change) => (
                  <DirectionChangeLine key={change.key} change={change} />
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
            setDraft(
              withStrategy(w, draft, item.build, item.name, item.rows && savedRows(item.rows)),
            );
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
