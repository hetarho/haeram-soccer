import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import {
  BUILD_OPTIONS,
  type BuildSlot,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import {
  BUILD_CARDS,
  BUILD_COMBINATIONS,
  BUILD_PRESETS,
  BUILD_SLOT_INFO,
  buildEffects,
  buildLabel,
  buildLock,
  buildOf,
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
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { number } from './format';
import { PolicyDials, type DialKey } from './PolicyBoard';
import s from './BuildBoard.module.css';

const pct = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The build by area of the club: each pairs its strategy card (one slot, settled once a season)
 * with the ongoing dials that spend on the same thing (→ECON-22). The card says how the club
 * goes about it, the dial how much it puts in.
 */
const DOMAINS: {
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
    question: '선수단을 어떤 분위기로, 얼마나 투자해 키울까',
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
    question: '아카데미 아이들을 어떻게, 얼마나 키울까',
    dials: ['academy'],
  },
  {
    slot: 'revenue',
    label: '수익',
    icon: '₤',
    question: '구단 살림을 어디서 벌고 얼마나 알릴까',
    dials: ['marketing'],
  },
  {
    slot: 'fans',
    label: '홈·팬',
    icon: '◎',
    question: '어떤 경기장과 팬층을 만들고 입장권은 얼마에 팔까',
    dials: ['ticket'],
  },
];

/** The odds a build sets, stated as football outcomes the owner can watch for. */
function buildOdds(w: World) {
  const intake = academyIntakeOutlook(w),
    meeting = careOffer(w, 'meeting').outcomes[0].chance,
    offers = 1 - (1 - INCOMING_BID_CHANCE * buildEffects(w).incomingBids) ** 30;
  return [
    { label: '다음 유스 입단에서 잠재력 80+ 유망주', value: pct(intake.golden) },
    { label: '감독 주재 선수단 미팅이 분위기를 바꿀 확률', value: `${meeting}%` },
    { label: '이적시장 한 달 동안 다른 구단 제안이 올 확률', value: pct(offers) },
  ];
}

function Lines({ pros, cons }: { pros: string[]; cons: string[] }) {
  if (!pros.length && !cons.length) return <p className={s.neutral}>효과 없음 · 기본값</p>;
  return (
    <ul className={s.lines}>
      {pros.map((line) => (
        <li key={line} className={s.pro}>
          ▲ {line}
        </li>
      ))}
      {cons.map((line) => (
        <li key={line} className={s.con}>
          ▼ {line}
        </li>
      ))}
    </ul>
  );
}

/**
 * The club build (→ECON-22, →CLUB-21): six slots of cards the owner combines freely, presets as a
 * shortcut, the manager's school, and the synergies that light up when the cards point one way.
 */
export function BuildBoard({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const current = buildOf(w);
  // Edits stay a draft until the owner confirms; a newly saved build clears them.
  const [edits, setEdits] = useState<{ base: ClubBuild; build: ClubBuild }>();
  const draft = edits && sameBuild(edits.base, current) ? edits.build : current;
  const changed = !sameBuild(draft, current);
  const lock = buildLock(w);
  const choose = (build: ClubBuild) => setEdits({ base: current, build });
  const pick = (slot: BuildSlot, option?: string) => {
    const next: ClubBuild = { ...draft };
    if (option) (next as Record<string, string>)[slot] = option;
    else delete next[slot];
    choose(next);
  };
  // Synergies and odds follow the draft, so the owner sees what a build would do before it counts.
  const preview = changed ? { ...w, build: draft } : w;
  const now = synergyStates(w);
  const synergies = changed ? synergyStates(preview) : now;
  const active = synergies.filter((synergy) => synergy.active).length;
  const met = (synergy: (typeof synergies)[number]) =>
    synergy.conditions.filter((condition) => condition.met).length;
  const ordered = [...synergies].sort((a, b) => met(b) - met(a));
  const card = (synergy: (typeof synergies)[number]) => {
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
  const oddsNow = buildOdds(w),
    oddsDraft = changed ? buildOdds(preview) : oddsNow;
  return (
    <section className={s.board} aria-label="구단 빌드" data-testid="build-board">
      <header className={s.head}>
        <h2>
          구단 빌드 <small>{number(BUILD_COMBINATIONS)}가지 조합</small>
        </h2>
        <p>
          여섯 부문마다 전략 카드 한 장(시즌마다 한 번 확정)과 운영 다이얼(언제든)을 함께 정해 우리
          구단만의 빌드를 짜요. 카드는 어떻게 할지, 다이얼은 얼마나 쓸지예요. 감독 성향·스태프와
          같은 방향을 가리키면 시너지가 켜지고, 결과는 확률이라 시즌마다 달라질 수 있어요. 추천
          빌드는 카드 여섯 장을 한 번에 채우는 지름길이에요.
        </p>
      </header>

      <div className={s.presets} role="group" aria-label="추천 빌드">
        {BUILD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            aria-pressed={sameBuild(preset.build, draft)}
            className={sameBuild(preset.build, draft) ? s.presetOn : undefined}
            disabled={acting}
            onClick={() => choose(preset.build)}
          >
            <b>{preset.label}</b>
            <small>{preset.model}</small>
          </button>
        ))}
      </div>

      <div className={s.domains}>
        {DOMAINS.map((domain) => {
          const slot = domain.slot,
            info = BUILD_SLOT_INFO[slot],
            chosen = draft[slot],
            card: BuildCard = cardOf(draft, slot),
            options: (string | undefined)[] = [undefined, ...BUILD_OPTIONS[slot]];
          return (
            <article
              key={slot}
              className={`${s.domain} ${chosen !== current[slot] ? s.slotChanged : ''}`}
              data-slot={slot}
              aria-label={`${domain.label} 부문`}
            >
              <header className={s.domainHead}>
                <span className={s.domainIcon} aria-hidden="true">
                  {domain.icon}
                </span>
                <div>
                  <h3>{domain.label}</h3>
                  <small>{domain.question}</small>
                </div>
              </header>
              <div className={s.part}>
                <span className={s.partLabel}>
                  전략 카드 · {info.label} <em>시즌마다 한 번 확정</em>
                </span>
                <div className={s.options} role="radiogroup" aria-label={info.label}>
                  {options.map((option) => {
                    const label = option
                      ? (BUILD_CARDS[slot] as Record<string, BuildCard>)[option].label
                      : '기본';
                    return (
                      <button
                        key={option ?? 'standard'}
                        role="radio"
                        aria-checked={option === chosen}
                        aria-label={`${info.label} ${label}`}
                        className={`${option === chosen ? s.picked : ''} ${option === current[slot] ? s.current : ''}`}
                        disabled={acting}
                        onClick={() => pick(slot, option)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className={s.model}>{card.model}</p>
                <Lines {...cardLines(card)} />
              </div>
              {domain.dials.length > 0 && (
                <div className={s.part}>
                  <span className={s.partLabel}>
                    운영 다이얼 <em>언제든 · 다음 정산부터</em>
                  </span>
                  <PolicyDials w={w} client={client} keys={domain.dials} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <article className={s.summary} aria-live="polite">
        <div className={s.summaryHead}>
          <span>{changed ? '확정하면' : '지금 빌드'}</span>
          <b>{buildLabel(draft)}</b>
        </div>
        <Lines {...effectLines(composeBuild(draft))} />
        {changed && (
          <div className={s.confirm}>
            <button disabled={acting} onClick={() => setEdits(undefined)}>
              되돌리기
            </button>
            <button
              className={s.apply}
              disabled={acting || !!lock}
              onClick={() => {
                void client.command({ type: 'build', build: draft });
                setEdits(undefined);
              }}
            >
              {lock ?? '이 빌드로 확정'}
            </button>
          </div>
        )}
        {!changed && lock && <p className={s.neutral}>{lock}</p>}
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
            {active}/{synergies.length} 발동{changed ? ' · 확정 시' : ''}
          </small>
        </h3>
        <ul>{ordered.slice(0, 3).map(card)}</ul>
        <details className={s.more}>
          <summary>나머지 시너지 {ordered.length - 3}개 조건 보기</summary>
          <ul>{ordered.slice(3).map(card)}</ul>
        </details>
      </section>

      <section className={s.odds} aria-label="빌드 확률">
        <h3>{changed ? '확정하면 바뀌는 확률' : '지금 빌드의 확률'}</h3>
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
    </section>
  );
}
