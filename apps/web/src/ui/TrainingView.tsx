import { useEffect, useState } from 'react';
import type { TrainingFocus, World } from '../../../../packages/contracts/src/types';
import {
  developmentOutlook,
  trainingFocusInfo,
  type DevelopmentFactor,
  type DevelopmentHome,
} from '../../../../packages/engine/src/training';
import { AUTO_RECOVERY_FATIGUE } from '../../../../packages/engine/src/staff';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { OvrBadge } from './OvrBadge';
import { PageTabs, TabPanel } from './PageTabs';
import { PlayerLink } from './PlayerSheet';
import {
  openCoachSheet,
  openHome,
  routeOf,
  TRAINING_TABS,
  useTrainingView,
  type Home,
  type TrainingTab,
} from './state';
import { callLine } from './TrainingOrderSheet';
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

/** The 훈련 tab a request or the address asks for. */
function trainingStart(request: TrainingTab | undefined): TrainingTab {
  if (request) return request;
  const route = routeOf(location.pathname, location.search);
  return TRAINING_TABS.find(([id]) => id === route.view)?.[0] ?? 'training';
}

/**
 * 훈련 (→WEB-70): how the club develops its players, as one tab bar — the focus the coaches set,
 * what drives growth and who is still growing, then the academy. It changes nothing itself: the
 * owner reaches training through the coaches' cards in 코치진 (→STAFF-19). A tab asked for from
 * elsewhere is taken once; otherwise the tab comes from the address.
 */
export function TrainingView({ state, client }: Props) {
  const w = state.view!.world;
  const request = useTrainingView((view) => view.request);
  const [tab, setTab] = useState<TrainingTab>(() => trainingStart(request));
  useEffect(() => {
    if (!request) return;
    setTab(request);
    useTrainingView.getState().take();
  }, [request]);
  const outlook = developmentOutlook(w);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <div className={a.eyebrow}>TRAINING</div>
          <h2>훈련·육성</h2>
          <p>
            선수들이 어떻게 자라고 있는지 봐요. 훈련 방향은 코치들이 정하고, 구단주는 코치진에서
            제안하거나 강행할 수 있어요.
          </p>
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
            <TrainingFocusPanel w={w} outlook={outlook} />
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
 * The first team's focus in force (→CLUB-13): who set it — the assistant's rule, a suggestion he
 * accepted or the owner's order, with the rounds left — and why, each focus's effect read only,
 * and a line opening the assistant's card to suggest or force (→STAFF-19).
 */
function TrainingFocusPanel({ w, outlook: { focus } }: { w: World; outlook: Outlook }) {
  const call = callLine(w, 'assistant');
  return (
    <section className={s.card} id="training-focus" aria-label="훈련 방향">
      <header className={s.head}>
        <h3>훈련 방향</h3>
        <span data-testid="training-focus">
          지금 {focusName(focus.focus)} · {call.by}
          {focus.rounds ? ` · ${focus.rounds}라운드 남음` : ''}
        </span>
      </header>
      <p className={s.advice} data-testid="training-advice">
        {call.reason}
      </p>
      <ul className={s.focuses} aria-label="훈련 방향별 효과">
        {FOCUSES.map(([id, label]) => {
          const effect = focusEffect(id, focus.recoveryBonus);
          return (
            <li key={id} aria-current={focus.focus === id || undefined}>
              <b>{label}</b>
              <span>
                <small>{effect.recovery}</small>
                <small>{effect.growth}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={s.note}>
        라운드마다 한 번 적용돼요. 성장 배수는 27세 미만에게만 붙어요.
        {focus.recoveryBonus !== 0 &&
          ` 피로 회복에는 선수단 투자와 피지컬 코치의 ${focus.recoveryBonus > 0 ? '+' : ''}${focus.recoveryBonus}이 들어 있어요.`}
      </p>
      <div className={s.delegate}>
        <p>수석코치는 라운드마다 이 기준으로 골라요.</p>
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
      </div>
      <button type="button" className={s.homeLine} onClick={() => openCoachSheet('assistant')}>
        <span>
          <b>수석코치에게 훈련 제안·강행</b>
          <small>받아들이면 4라운드 · 강행하면 사임 위험이 있어요</small>
        </span>
        <span className={s.chevron} aria-hidden="true">
          ›
        </span>
      </button>
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
  'business/strategy': '방향',
  'people/manager': '감독',
  'people/coaches': '코치진',
  'business/facility': '증축',
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

/** Opens where a term is set (→WEB-71); the focus is shown above, on this tab. */
function openDriver(home: DevelopmentHome) {
  if (home === 'training/training') {
    document
      .getElementById('training-focus')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    <section className={s.card} aria-label="성장 배수">
      <header className={s.head}>
        <h3>성장 배수</h3>
        <span>라운드마다 곱해져요</span>
      </header>
      <p className={s.total} data-testid="development-total">
        <b>{times(total(true))}</b>
        <small>21세 이하 · 22–26세 {times(total(false))}</small>
      </p>
      <p className={s.note}>
        27세 미만 선수는 라운드마다 잠재력까지 남은 차이에 이 배수를 모두 곱한 만큼 자라요. 어릴수록
        더 빨리 자라요. 아래 항목을 누르면 정하는 곳으로 가요.
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
