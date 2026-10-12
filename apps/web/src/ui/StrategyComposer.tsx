import { useState, type FormEvent } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import {
  BUILD_OPTIONS,
  STRATEGY_NAME_LIMIT,
  type BuildSlot,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import {
  BUILD_CARDS,
  BUILD_SLOT_INFO,
  cardLines,
  cardOf,
  composeBuild,
  effectLines,
  type BuildCard,
} from '../../../../packages/engine/src/build';
import { synergyStates } from '../../../../packages/engine/src/synergy';
import type { SavedStrategy } from '../adapters/profile';
import { Dialog } from './Dialog';
import type { DialKey } from './PolicyBoard';
import { useStrategies } from './strategies';
import s from './StrategyBoard.module.css';
import a from './App.module.css';

/**
 * The club by area (→ECON-25): each pairs its strategy card (how the club goes about it, settled
 * once a season) with the ongoing dials that spend on the same thing (how much it puts in).
 */
export const STRATEGY_AREAS: {
  slot: BuildSlot;
  label: string;
  icon: string;
  question: string;
  dials: readonly DialKey[];
}[] = [
  {
    slot: 'culture',
    label: '선수단',
    icon: '★',
    question: '선수단을 어떤 분위기로 키울까',
    dials: ['support', 'training'],
  },
  {
    slot: 'scouting',
    label: '영입',
    icon: '⇄',
    question: '어떤 선수를 어떻게 찾아 데려올까',
    dials: ['recruitment'],
  },
  {
    slot: 'market',
    label: '매각',
    icon: '↗',
    question: '우리 선수를 원하는 구단에 어떻게 응할까',
    dials: [],
  },
  {
    slot: 'youth',
    label: '유소년',
    icon: '✿',
    question: '아카데미 아이들을 어떻게 키울까',
    dials: ['academy'],
  },
  {
    slot: 'revenue',
    label: '수익',
    icon: '₤',
    question: '구단 살림을 어디서 벌고 아낄까',
    dials: ['marketing'],
  },
  {
    slot: 'fans',
    label: '홈·팬',
    icon: '◎',
    question: '어떤 경기장과 팬층을 만들까',
    dials: ['ticket'],
  },
];

/** Strategy lines in the owner's terms: ▲ what it helps, ▼ what it costs. */
export function Lines({ pros, cons, limit }: { pros: string[]; cons: string[]; limit?: number }) {
  if (!pros.length && !cons.length) return <p className={s.neutral}>효과 없음 · 기본값</p>;
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
 * 나만의 전략 만들기 (→WEB-61): six areas of cards, the combined effects and the synergies they
 * light, a name, and save to this device's library.
 */
export function StrategyComposer({
  w,
  initial,
  onClose,
  onSaved,
}: {
  w: World;
  initial: { id?: string; name: string; build: ClubBuild };
  onClose: () => void;
  onSaved: (strategy: SavedStrategy) => void;
}) {
  const save = useStrategies((state) => state.save);
  const [name, setName] = useState(initial.name);
  const [build, setBuild] = useState<ClubBuild>(initial.build);
  const [error, setError] = useState('');
  const pick = (slot: BuildSlot, option?: string) => {
    const next: ClubBuild = { ...build };
    if (option) (next as Record<string, string>)[slot] = option;
    else delete next[slot];
    setBuild(next);
  };
  const lit = synergyStates({ ...w, build }).filter((synergy) => synergy.active);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    try {
      onSaved(save({ id: initial.id, name, build }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <Dialog
      label={initial.id ? '전략 편집' : '나만의 전략 만들기'}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="strategy-composer" className={a.primary}>
            저장
          </button>
        </>
      }
    >
      <form id="strategy-composer" className={s.composer} onSubmit={submit}>
        <label className={s.nameField}>
          전략 이름
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
          저장한 전략은 이 기기의 모든 게임에서 고를 수 있어요. 다이얼은 전략과 따로 조절해요.
        </p>
        {STRATEGY_AREAS.map((area) => {
          const slot = area.slot,
            info = BUILD_SLOT_INFO[slot],
            chosen = build[slot],
            card: BuildCard = cardOf(build, slot),
            options: (string | undefined)[] = [undefined, ...BUILD_OPTIONS[slot]];
          return (
            <fieldset key={slot} className={s.domain} data-slot={slot}>
              <legend className={s.domainHead}>
                <span className={s.domainIcon} aria-hidden="true">
                  {area.icon}
                </span>
                <span>
                  <b>
                    {area.label} · {info.label}
                  </b>
                  <small>{area.question}</small>
                </span>
              </legend>
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
                      aria-checked={option === chosen}
                      aria-label={`${info.label} ${label}`}
                      className={option === chosen ? s.picked : undefined}
                      onClick={() => pick(slot, option)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className={s.model}>{card.model}</p>
              <Lines {...cardLines(card)} />
            </fieldset>
          );
        })}
        <article className={s.current} aria-live="polite">
          <div className={s.summaryHead}>
            <span>이 전략의 효과</span>
            <b>
              {lit.length
                ? `시너지 ${lit.map((synergy) => synergy.label).join(' · ')}`
                : '발동 시너지 없음'}
            </b>
          </div>
          <Lines {...effectLines(composeBuild(build))} />
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
