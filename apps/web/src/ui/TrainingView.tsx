import { useEffect, useState } from 'react';
import type { TrainingFocus, World } from '../../../../packages/contracts/src/types';
import {
  developmentOutlook,
  trainingFocusInfo,
  type DevelopmentFactor,
  type DevelopmentHome,
} from '../../../../packages/engine/src/training';
import { AUTO_RECOVERY_FATIGUE, autoTrainingAdvice } from '../../../../packages/engine/src/staff';
import type { ClientState, GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { AcademyPanel } from './AcademyPanel';
import { DecisionOwner } from './DecisionOwner';
import { OvrBadge } from './OvrBadge';
import { PageTabs, TabPanel } from './PageTabs';
import { PlayerLink } from './PlayerSheet';
import {
  openHome,
  routeOf,
  TRAINING_TABS,
  useTrainingRequest,
  useTrainingView,
  type Home,
  type TrainingTab,
} from './state';
import a from './App.module.css';
import s from './TrainingView.module.css';

type Props = { state: ClientState; client: GameClient };
type Outlook = ReturnType<typeof developmentOutlook>;

const FOCUSES: readonly [TrainingFocus, string][] = [
  ['balanced', '균형'],
  ['youth', '유망주 집중'],
  ['recovery', '회복 집중'],
];
const focusName = (focus: TrainingFocus) => FOCUSES.find(([id]) => id === focus)![1];
/** A multiplier as ×1.12: two decimals at most, trailing zeros dropped. */
const times = (value: number) => `×${Math.round(value * 100) / 100}`;
/** What a focus does each settled round (→CLUB-11), its recovery with the standing bonuses. */
function focusEffect(focus: TrainingFocus, recoveryBonus: number) {
  const info = trainingFocusInfo[focus];
  return {
    recovery: `피로 회복 ${Math.max(0, info.recovery + recoveryBonus)}`,
    growth: info.developmentMultiplier
      ? `성장 ${times(info.developmentMultiplier)}`
      : '라운드 성장 쉼',
  };
}

function useActing() {
  return useGameState((state) => !!state.pendingActions || state.readonly || !!state.error);
}

/** The 훈련 tab a request or the address asks for. */
function trainingStart(request: TrainingTab | undefined): TrainingTab {
  if (request) return request;
  const route = routeOf(location.pathname, location.search);
  return TRAINING_TABS.find(([id]) => id === route.view)?.[0] ?? 'training';
}

/**
 * 훈련 (→WEB-70): how the club develops its players, as one tab bar — the training focus, what
 * drives growth and who is still growing, then the academy. A tab or a focus asked for from
 * elsewhere is taken once; otherwise the tab comes from the address.
 */
export function TrainingView({ state, client }: Props) {
  const w = state.view!.world;
  const request = useTrainingView((view) => view.request);
  const focusRequest = useTrainingRequest((view) => view.request);
  const [tab, setTab] = useState<TrainingTab>(() => trainingStart(request));
  const [suggested, setSuggested] = useState<TrainingFocus>();
  useEffect(() => {
    if (!request) return;
    setTab(request);
    useTrainingView.getState().take();
  }, [request]);
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.focus) {
      setSuggested(focusRequest.focus);
      setTab('training');
    }
    useTrainingRequest.getState().take();
  }, [focusRequest]);
  const outlook = developmentOutlook(w);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <div className={a.eyebrow}>TRAINING</div>
          <h2>훈련·육성</h2>
          <p>선수들이 어떻게 자랄지 정해요. 1군의 훈련 방향과 아카데미의 유망주를 여기서 다뤄요.</p>
        </div>
      </div>
      <PageTabs
        tabs={TRAINING_TABS}
        value={tab}
        onChange={setTab}
        label="훈련·육성 보기"
        idPrefix="training"
      />
      <TabPanel idPrefix="training" value={tab}>
        {tab === 'training' ? (
          <div className={`${s.stack} ${s.pair}`}>
            <TrainingFocusPanel
              w={w}
              client={client}
              outlook={outlook}
              suggested={suggested}
              onSuggestionDone={() => setSuggested(undefined)}
            />
            <DevelopmentDrivers outlook={outlook} />
            <GrowingPlayers outlook={outlook} />
          </div>
        ) : (
          <AcademyPanel w={w} client={client} />
        )}
      </TabPanel>
    </>
  );
}

/**
 * The training focus in force, chosen on tap, or left to the assistant coach, who picks it each
 * round by his rule (→CLUB-13), and the choices stay read-only until the intervention level
 * hands the focus back (→WEB-45). A focus suggested from elsewhere waits in a banner until it is
 * applied or closed.
 */
function TrainingFocusPanel({
  w,
  client,
  outlook: { focus },
  suggested,
  onSuggestionDone,
}: {
  w: World;
  client: GameClient;
  outlook: Outlook;
  suggested?: TrainingFocus;
  onSuggestionDone: () => void;
}) {
  const acting = useActing();
  const advice = autoTrainingAdvice(w),
    choose = (next: TrainingFocus) => void client.command({ type: 'training', focus: next });
  return (
    <section className={s.card} id="training-focus" aria-label="훈련 방향">
      {suggested && !focus.delegated && (
        <div className={s.suggestion} role="region" aria-label="훈련 방향 제안">
          <p>
            <b>{focusName(suggested)}</b>을 권해요
            <small>
              라운드마다 {Object.values(focusEffect(suggested, focus.recoveryBonus)).join(' · ')}
            </small>
          </p>
          <div>
            <button
              type="button"
              className={s.primary}
              disabled={acting}
              onClick={() => {
                choose(suggested);
                onSuggestionDone();
              }}
            >
              적용
            </button>
            <button type="button" onClick={onSuggestionDone}>
              닫기
            </button>
          </div>
        </div>
      )}
      <header className={s.head}>
        <h3>훈련 방향</h3>
        <span data-testid="training-focus">
          지금 {focusName(focus.focus)}
          {focus.delegated ? ' · 수석코치가 정함' : ''}
        </span>
      </header>
      <div className={s.focuses} role="radiogroup" aria-label="훈련 방향">
        {FOCUSES.map(([id, label]) => {
          const effect = focusEffect(id, focus.recoveryBonus);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={focus.focus === id}
              aria-label={label}
              aria-describedby={`training-focus-${id}`}
              disabled={acting || focus.delegated}
              onClick={() => {
                if (focus.focus === id) return;
                choose(id);
              }}
            >
              <b>{label}</b>
              <span id={`training-focus-${id}`}>
                <small>{effect.recovery}</small>
                <small>{effect.growth}</small>
              </span>
            </button>
          );
        })}
      </div>
      <p className={s.note}>
        라운드마다 한 번 적용돼요. 성장 배수는 27세 미만에게만 붙어요.
        {focus.recoveryBonus !== 0 &&
          ` 피로 회복에는 선수단 투자와 피지컬 코치의 ${focus.recoveryBonus > 0 ? '+' : ''}${focus.recoveryBonus}이 들어 있어요.`}
      </p>
      <div className={s.delegate}>
        <DecisionOwner
          w={w}
          decision="training"
          plain
          auto="수석코치가 라운드마다 아래 기준으로 골라요. 직접 고르려면 개입 1단계로 바꾸세요."
          owner="훈련 방향을 직접 골라요. 개입 2단계부터는 수석코치가 아래 기준으로 골라요."
        />
        <ul className={s.rule}>
          <li>
            <b>회복 집중</b>
            <span>선발 평균 피로 {AUTO_RECOVERY_FATIGUE} 이상</span>
          </li>
          <li>
            <b>유망주 집중</b>
            <span>육성형 수석코치, 또는 21세 이하 선발 3명 이상</span>
          </li>
          <li>
            <b>균형</b>
            <span>그 밖에</span>
          </li>
        </ul>
        <p className={s.advice} data-testid="training-advice">
          {focus.delegated ? '' : '맡기면 '}이번 라운드: {focusName(advice.focus)} · {advice.reason}
        </p>
      </div>
    </section>
  );
}

/** Factors that share a label read as one row: its values and where it is set. */
interface DriverRow {
  label: string;
  detail: string;
  home: DevelopmentHome;
  terms: DevelopmentFactor[];
}
const homeName: Record<DevelopmentHome, string> = {
  'training/training': '훈련 방향',
  'business/strategy': '운영 전략',
  'people/manager': '감독',
  'people/coaches': '코치진',
  'business/facility': '시설',
};
const skillName = {
  attack: '공격',
  passing: '패스',
  defense: '수비',
  keeper: '골키핑',
  stamina: '체력',
} as const;
const toneOf = (value: number) => (value > 1 ? 'up' : value < 1 ? 'down' : 'flat');
/** Terms that change something; a row whose terms all multiply by 1 shows its first one. */
const shownTerms = (terms: DevelopmentFactor[]) => {
  const changing = terms.filter((term) => term.value !== 1);
  return changing.length ? changing : terms.slice(0, 1);
};
const termText = (term: DevelopmentFactor) =>
  `${term.applies === 'u21' ? '21세 이하 ' : ''}${times(term.value)}`;

/** Opens where a term is set (→WEB-71); the focus is set above, on this tab. */
function openDriver(home: DevelopmentHome) {
  if (home === 'training/training') {
    const section = document.getElementById('training-focus');
    section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    section
      ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?.focus({ preventScroll: true });
    return;
  }
  const [page, view] = home.split('/');
  openHome({ page, view } as Home);
}

/**
 * What drives development now (→WEB-70): every term a settled round multiplies a young player's
 * growth by, with its value, each opening the place it is set.
 */
function DevelopmentDrivers({ outlook: { factors, skills } }: { outlook: Outlook }) {
  const rows: DriverRow[] = [];
  for (const factor of factors) {
    const row = rows.find((existing) => existing.label === factor.label);
    if (row) row.terms.push(factor);
    else
      rows.push({ label: factor.label, detail: factor.detail, home: factor.home, terms: [factor] });
  }
  const total = (young: boolean) =>
    factors
      .filter((factor) => young || factor.applies === 'all')
      .reduce((product, factor) => product * factor.value, 1);
  const coaching = (Object.keys(skillName) as (keyof typeof skillName)[])
    .filter((skill) => skills[skill] !== 1)
    .map((skill) => `${skillName[skill]} ${times(skills[skill])}`);
  return (
    <section className={s.card} aria-label="성장을 좌우하는 것">
      <header className={s.head}>
        <h3>성장을 좌우하는 것</h3>
        <span data-testid="development-total">
          22–26세 {times(total(false))} · 21세 이하 {times(total(true))}
        </span>
      </header>
      <p className={s.note}>
        27세 미만 선수는 라운드마다 잠재력까지 남은 차이에 이 배수를 모두 곱한 만큼 자라요. 어릴수록
        더 빨리 자라요.
      </p>
      <ul className={s.drivers}>
        {rows.map((row) => {
          const shown = shownTerms(row.terms);
          return (
            <li key={row.label}>
              <button
                type="button"
                aria-label={`${row.label} ${shown.map(termText).join(' · ')} · ${homeName[row.home]}에서 보기`}
                onClick={() => openDriver(row.home)}
              >
                <span className={s.driverText}>
                  <b>{row.label}</b>
                  <small>
                    {row.detail}
                    {row.home === 'people/coaches' &&
                      ` · ${coaching.length ? coaching.join(' · ') : '담당 능력 성장 ×1'}`}
                  </small>
                </span>
                <span className={s.driverValues}>
                  {shown.map((term) => (
                    <span key={term.key} data-tone={toneOf(term.value)}>
                      {termText(term)}
                    </span>
                  ))}
                </span>
                <span className={s.chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Players aged 23 or under with room left, largest gap first, with the growth they earned. */
function GrowingPlayers({ outlook: { growing } }: { outlook: Outlook }) {
  return (
    <section className={`${s.card} ${s.wide}`} aria-label="성장 중인 선수">
      <header className={s.head}>
        <h3>성장 중인 선수</h3>
        <span>23세 이하 · {growing.length}명</span>
      </header>
      {growing.length ? (
        <ol className={s.growing}>
          {growing.map(({ player, age, ability, potential, gap, developed }) => (
            <li key={player.id}>
              <OvrBadge value={ability} role={player.role} potential={potential} />
              <span className={s.growingName}>
                <PlayerLink id={player.id} name={player.name} />
                <small>
                  {age}세 · 잠재력까지 {gap}
                </small>
              </span>
              <span className={s.earned}>
                <b>+{developed.toFixed(2)}</b>
                <small>쌓은 성장</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.note}>23세 이하에 더 자랄 여지가 있는 선수가 없어요.</p>
      )}
    </section>
  );
}
