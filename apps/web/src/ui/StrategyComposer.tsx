import { useRef, useState, type FormEvent } from 'react';
import type { PolicyLevel, World } from '../../../../packages/contracts/src/types';
import {
  BUILD_OPTIONS,
  STRATEGY_NAME_LIMIT,
  type BuildSlot,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import {
  BUILD_SLOT_INFO,
  cardLines,
  cardOf,
  composeBuild,
  effectLines,
  type BuildCard,
} from '../../../../packages/engine/src/build';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import type { SavedRows, SavedStrategy } from '../adapters/profile';
import { Dialog } from './Dialog';
import { DirectionRow } from './DirectionRow';
import { DIRECTION_AREAS, isDirectionRow, type RowKey } from './areas';
import { DIRECTION_DEFAULT, DIRECTION_INFO } from '../../../../packages/engine/src/direction';
import {
  presetBoard,
  worldBoard,
  type DirectionBoard,
} from '../../../../packages/engine/src/presets';
import { dialInfo } from './PolicyBoard';
import { TICKET_LEVELS } from './ticketLevels';
import { boardRows, savedRows, useStrategies } from './strategies';
import s from './StrategyBoard.module.css';
import a from './App.module.css';

/** Strategy lines in the owner's terms: ▲ what it helps, ▼ what it costs. */
export function Lines({ pros, cons, limit }: { pros: string[]; cons: string[]; limit?: number }) {
  if (!pros.length && !cons.length) return <p className={s.neutral}>효과 없음 · 표준</p>;
  const shown = (lines: string[]) => (limit ? lines.slice(0, limit) : lines);
  return (
    <ul className={s.lines}>
      {shown(pros).map((line) => (
        <li key={line} className={s.pro}>
          ▲ {line}
        </li>
      ))}
      {shown(cons).map((line) => (
        <li key={line} className={s.con}>
          ▼ {line}
        </li>
      ))}
    </ul>
  );
}

/**
 * 방향 만들기 (→WEB-61): every area with its rows, starting from the direction in force or the
 * entry being edited, the combined effects and the synergies they light, a name, and save to this
 * device's library. 이 방향으로 적용 saves it too and puts it on the board as a draft; only the
 * board's 적용 changes the club.
 */
export function StrategyComposer({
  w,
  initial,
  title,
  onClose,
  onSaved,
  onApply,
}: {
  w: World;
  initial: { id?: string; name: string; build: ClubBuild; rows?: SavedRows };
  /** The sheet's name; an edit reads 방향 편집 and a new one 방향 만들기. */
  title?: string;
  onClose: () => void;
  onSaved: (strategy: SavedStrategy) => void;
  onApply: (strategy: SavedStrategy) => void;
}) {
  const save = useStrategies((state) => state.save);
  const [name, setName] = useState(initial.name);
  // An entry saved before directions kept rows starts from the rows in force.
  const [board, setBoard] = useState<DirectionBoard>(() =>
    initial.rows
      ? presetBoard({ build: initial.build, rows: savedRows(initial.rows) })
      : { ...worldBoard(w), build: initial.build },
  );
  const [error, setError] = useState('');
  const pick = (slot: BuildSlot, option?: string) => {
    const build: ClubBuild = { ...board.build };
    if (option) (build as Record<string, string>)[slot] = option;
    else delete build[slot];
    setBoard({ ...board, build });
  };
  const pickRow = (row: RowKey, index: number) => {
    if (isDirectionRow(row)) {
      const option = DIRECTION_INFO[row].options[index].id,
        direction = { ...board.direction };
      if (option === DIRECTION_DEFAULT[row]) delete direction[row];
      else (direction as Record<string, string>)[row] = option;
      setBoard({ ...board, direction });
    } else if (row === 'ticket') setBoard({ ...board, ticket: TICKET_LEVELS[index].price });
    else setBoard({ ...board, policy: { ...board.policy, [row]: (index + 1) as PolicyLevel } });
  };
  const lit = synergyStates({ ...w, ...board }).filter((synergy) => synergy.active);
  // Both actions save to the library first; a name is required either way.
  const apply = useRef(false);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    try {
      const saved = save({ id: initial.id, name, build: board.build, rows: boardRows(board) });
      if (apply.current) onApply(saved);
      else onSaved(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <Dialog
      label={title ?? (initial.id ? '방향 편집' : '방향 만들기')}
      onClose={onClose}
      actions={
        <div className={s.composerActions}>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="strategy-composer" onClick={() => (apply.current = false)}>
            저장
          </button>
          <button
            data-ui="primary"
            type="submit"
            form="strategy-composer"
            className={a.primary}
            onClick={() => (apply.current = true)}
          >
            이 방향으로 적용
          </button>
        </div>
      }
    >
      <form id="strategy-composer" className={s.composer} onSubmit={submit}>
        <label className={s.nameField}>
          방향 이름
          <input
            value={name}
            maxLength={STRATEGY_NAME_LIMIT}
            placeholder="예: 우리 동네 축구"
            autoComplete="off"
            required
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
        </label>
        <p className={s.neutral}>
          저장한 방향은 이 기기의 모든 게임에서 고를 수 있어요. 이 방향으로 적용을 누르면 방향
          보드의 초안에 올라가고, 보드에서 적용하면 바로 반영돼요.
        </p>
        {DIRECTION_AREAS.map((area) => {
          const slot = area.card;
          return (
            <fieldset key={area.key} className={s.domain} data-area={area.key}>
              <legend className={s.domainHead}>
                <span data-surface="tile" className={s.domainIcon} aria-hidden="true">
                  {area.icon}
                </span>
                <span>
                  <b>{area.label}</b>
                  <small>{area.question}</small>
                </span>
              </legend>
              {slot && <CardRow slot={slot} area={area.question} build={board.build} pick={pick} />}
              {area.rows.map((row) => (
                <RowChoice key={row} w={w} row={row} board={board} onPick={pickRow} />
              ))}
            </fieldset>
          );
        })}
        <article data-surface="panel" className={s.current} aria-live="polite">
          <div className={s.summaryHead}>
            <span>이 방향의 효과</span>
            <b>
              {lit.length
                ? `시너지 ${lit.map((synergy) => synergy.label).join(' · ')}`
                : '발동 시너지 없음'}
            </b>
          </div>
          <Lines {...effectLines(composeBuild(board.build))} />
        </article>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** One card row of the composer (→WEB-61), drawn like the board's. */
function CardRow({
  slot,
  area,
  build,
  pick,
}: {
  slot: BuildSlot;
  area: string;
  build: ClubBuild;
  pick: (slot: BuildSlot, option?: string) => void;
}) {
  const info = BUILD_SLOT_INFO[slot],
    card: BuildCard = cardOf(build, slot),
    options: (string | undefined)[] = [undefined, ...BUILD_OPTIONS[slot]];
  return (
    <DirectionRow
      row={slot}
      label={info.label}
      question={info.question === area ? undefined : info.question}
      options={options.map((option) => cardOf({ [slot]: option }, slot).label)}
      inForce={options.indexOf(build[slot])}
      detail={
        <>
          <p className={s.model}>{card.model}</p>
          <Lines {...cardLines(card)} />
        </>
      }
      onPick={(index) => pick(slot, options[index])}
    />
  );
}

/** One dial or direction row of the composer, its option in the board being composed. */
function RowChoice({
  w,
  row,
  board,
  onPick,
}: {
  w: World;
  row: RowKey;
  board: DirectionBoard;
  onPick: (row: RowKey, index: number) => void;
}) {
  if (isDirectionRow(row)) {
    const info = DIRECTION_INFO[row],
      chosen = board.direction[row] ?? DIRECTION_DEFAULT[row],
      inForce = info.options.findIndex((option) => option.id === chosen);
    return (
      <DirectionRow
        row={row}
        label={info.label}
        question={info.question}
        options={info.options.map((option) => option.name)}
        inForce={inForce}
        detail={<p>{info.options[inForce].summary}</p>}
        onPick={(index) => onPick(row, index)}
      />
    );
  }
  const dial = dialInfo({ ...w, policy: board.policy, ticket: board.ticket }, row);
  return (
    <DirectionRow
      row={row}
      label={dial.label}
      question={dial.question}
      options={dial.levels.map((level) => level.name)}
      inForce={dial.current}
      detail={dial.current >= 0 && <p>{dial.levels[dial.current].summary}</p>}
      onPick={(index) => onPick(row, index)}
    />
  );
}
