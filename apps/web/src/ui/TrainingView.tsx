import { useTaskState } from './taskMemory';
import { useEffect, useState } from 'react';
import { FacilityOverview } from './FacilityOverview';
import type {
  TrainingCoach,
  TrainingFocus,
  World,
  YouthFocus,
} from '../../../../packages/contracts/src/types';
import {
  activeTrainingFocus,
  developmentOutlook,
  focusFor,
  trainingFocusInfo,
  type DevelopmentFactor,
  type DevelopmentHome,
} from '../../../../packages/engine/src/training';
import {
  AUTO_HARD_FATIGUE,
  AUTO_HARD_MORALE,
  AUTO_PLAYER_RECOVERY,
  AUTO_RECOVERY_FATIGUE,
} from '../../../../packages/engine/src/staff';
import { playerSuggestionWait } from '../../../../packages/engine/src/coach-training';
import { settleRate } from '../../../../packages/engine/src/adaptation';
import { TRAINING_INJURY } from '../../../../packages/engine/src/careers';
import { HARD_STREAK } from '../../../../packages/engine/src/morale';
import { activePlayers, ownMultiplier, overall } from '../../../../packages/engine/src/world';
import {
  ADAPTATION_NEUTRAL,
  MATCH_GAIN,
  TRAINING_GAIN,
} from '../../../../packages/engine/src/player';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { PageTabs, TabPanel } from './PageTabs';
import { PlayerLink } from './PlayerSheet';
import {
  openHome,
  openStaff,
  openDirection,
  routeOf,
  TRAINING_TABS,
  useCoachRequest,
  useTrainingView,
  type Home,
  type TrainingTab,
} from './state';
import { callLine, playerCallLine, TrainingOrderSheet } from './TrainingOrderSheet';
import { multiplierLabel } from './PlayerProfile';
import { ATTRIBUTES } from '../../../../packages/contracts/src/player';
import { ATTRIBUTE_LABEL } from '../../../../packages/engine/src/player';
import s from './TrainingView.module.css';

type Props = { state: ClientState; client: GameClient };
type Outlook = ReturnType<typeof developmentOutlook>;

const FOCUSES: readonly [TrainingFocus, string][] = [
  ['balanced', '균형'],
  ['recovery', '회복'],
  ['hard', '하드 트레이닝'],
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

/** A coach's training sheet: for the squad, the academy, or one first-team player. */
type Sheet = { coach: TrainingCoach; focus?: TrainingFocus | YouthFocus; player?: string };

/**
 * 훈련 (→WEB-70): how the club develops its players, as one tab bar — the focus the coaches set and
 * the owner's suggestions and orders to them (→STAFF-19), each player's own focus and adaptation,
 * what drives growth and who is still growing, then the academy. A tab asked for from elsewhere is
 * taken once; otherwise the tab comes from the address.
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
  // A coach's sheet asked for from a remedy or the academy's line opens once (→WEB-44).
  const coachRequest = useCoachRequest((view) => view.request);
  const [sheet, setSheet] = useState<Sheet>();
  useEffect(() => {
    if (!coachRequest) return;
    setSheet(coachRequest);
    useCoachRequest.getState().take();
  }, [coachRequest]);
  const sheetPlayer = sheet?.player
    ? activePlayers(w).find((player) => player.id === sheet.player)
    : undefined;
  const outlook = developmentOutlook(w);
  return (
    <>
      <PageTabs
        tabs={TRAINING_TABS}
        value={tab}
        onChange={setTab}
        label="훈련·육성 보기"
        idPrefix="training"
      />
      <TabPanel idPrefix="training" value={tab}>
        {tab === 'training' ? (
          <>
            <FacilityOverview
              w={w}
              kind="training"
              title={w.trainingGround ? `${w.trainingGround}단계 훈련장` : '기본 훈련장'}
            >
              {focusName(outlook.focus.focus)} · 수석코치{' '}
              {w.staff?.find((person) => person.role === 'assistant')?.name ?? '공석'}
            </FacilityOverview>
            <div className={`${s.stack} ${s.pair}`}>
              <TrainingFocusPanel w={w} outlook={outlook} onSheet={setSheet} />
              <DevelopmentDrivers outlook={outlook} />
              <PlayerTraining w={w} onSheet={setSheet} />
            </div>
          </>
        ) : (
          <AcademyPanel w={w} client={client} />
        )}
      </TabPanel>
      {sheet && (!sheet.player || sheetPlayer) && (
        <TrainingOrderSheet
          w={w}
          client={client}
          coach={sheet.coach}
          ready={sheet.focus}
          player={sheetPlayer}
          onClose={() => setSheet(undefined)}
        />
      )}
    </>
  );
}

/** A focus's settling per round, before 적응력 and the school (→PLAYER-12). */
const adaptationGain = (focus: TrainingFocus) => `적응 +${TRAINING_GAIN[focus].toFixed(3)}`;
const injuryChance = `부상 ${(TRAINING_INJURY * 100).toFixed(1)}%~/라운드`;

/**
 * The first team's focus in force (→CLUB-13): who set it — the assistant's rule, a suggestion he
 * accepted or the owner's order, with the rounds left — and why; each focus's growth, recovery,
 * adaptation and costs; the assistant's rules; and the sheet to suggest or force (→STAFF-19).
 */
function TrainingFocusPanel({
  w,
  outlook: { focus },
  onSheet,
}: {
  w: World;
  outlook: Outlook;
  onSheet: (sheet: Sheet) => void;
}) {
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
      <p className={s.actor}>
        담당 수석코치{' '}
        <button type="button" onClick={() => openStaff('assistant')}>
          {w.staff?.find((person) => person.role === 'assistant')?.name ?? '공석'} · 보기
        </button>
      </p>
      <button
        type="button"
        className={`${s.homeLine} ${s.primary}`}
        onClick={() => onSheet({ coach: 'assistant' })}
      >
        <span>
          <b>수석코치에게 훈련 제안·강행</b>
          <small>다음 라운드부터 4라운드 · 강행 시 사임 위험</small>
        </span>
        <span className={s.chevron} aria-hidden="true">
          ›
        </span>
      </button>
      <details className={s.reference}>
        <summary>훈련 효과·자동 판단 기준</summary>
        <ul className={s.focuses} aria-label="훈련 방향별 효과">
          {FOCUSES.map(([id, label]) => {
            const effect = focusEffect(id, focus.recoveryBonus);
            return (
              <li key={id} aria-current={focus.focus === id || undefined}>
                <b>{label}</b>
                <span>
                  <small>{effect.recovery}</small>
                  <small>{effect.growth}</small>
                  <small>{adaptationGain(id)}</small>
                  {id === 'hard' && (
                    <small className={s.cost}>
                      {injuryChance} · {HARD_STREAK.from}라운드 연속부터 분위기 −{HARD_STREAK.cost}
                    </small>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={s.note}>
          라운드마다 한 번 적용돼요. 성장 배수는 27세 미만에게만 붙고, 훈련만으로는 적응도가{' '}
          {ADAPTATION_NEUTRAL.toFixed(2)}까지만 올라요.
          {focus.recoveryBonus !== 0 &&
            ` 피로 회복에는 선수단 투자와 피지컬 코치의 ${focus.recoveryBonus > 0 ? '+' : ''}${focus.recoveryBonus}이 들어 있어요.`}
        </p>
        <div className={s.delegate}>
          <p>수석코치는 라운드마다 이 기준으로 골라요.</p>
          <ul className={s.rule}>
            <li>
              <b>회복</b>
              <span>선발 평균 피로 {AUTO_RECOVERY_FATIGUE} 이상</span>
            </li>
            <li>
              <b>하드 트레이닝</b>
              <span>
                선발 평균 피로 {AUTO_HARD_FATIGUE} 미만 · 분위기 {AUTO_HARD_MORALE} 이상 · 육성형
                수석코치, 또는 21세 이하 선발 3명 이상
              </span>
            </li>
            <li>
              <b>균형</b>
              <span>그 밖에</span>
            </li>
            <li>
              <b>개별 회복</b>
              <span>피로 {AUTO_PLAYER_RECOVERY} 이상인 선수는 팀과 따로 회복</span>
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}

/**
 * 개별 훈련 (→CLUB-11, STAFF-19): who trains on a focus of his own and who set it, then every
 * first-team player with his focus this round and the sheet to suggest or force one for him.
 */
function PlayerTraining({ w, onSheet }: { w: World; onSheet: (sheet: Sheet) => void }) {
  const [filter, setFilter] = useTaskState<'all' | 'attention' | 'growth'>(
    w.id,
    'development-filter',
    'all',
  );
  const squadFocus = activeTrainingFocus(w);
  const all = [...activePlayers(w)].sort(
    (a, b) => b.fatigue - a.fatigue || a.adaptation - b.adaptation,
  );
  const squad = all.filter((player) =>
    filter === 'attention'
      ? player.fatigue >= AUTO_PLAYER_RECOVERY ||
        player.adaptation < ADAPTATION_NEUTRAL ||
        player.unsettled !== undefined
      : filter === 'growth'
        ? w.year - player.born < 27 && player.potential > overall(player)
        : true,
  );
  const own = all.filter((player) => playerCallLine(w, player, squadFocus).by !== '팀 훈련').length;
  return (
    <section className={`${s.card} ${s.wide}`} aria-label="개별 훈련">
      <header className={s.head}>
        <h3>선수별 육성</h3>
        <span data-testid="own-focus-count">따로 훈련 {own}명</span>
      </header>
      <div className={s.filters} role="group" aria-label="선수 육성 보기">
        {(
          [
            ['all', '전체'],
            ['attention', '관리 필요'],
            ['growth', '성장 중'],
          ] as const
        ).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <ul className={s.players} data-testid="adaptation-list">
        {squad.map((player) => {
          const call = playerCallLine(w, player, squadFocus),
            wait = playerSuggestionWait(w, player.id);
          return (
            <li key={player.id} data-own={call.by !== '팀 훈련' || undefined}>
              <span className={s.playerName}>
                <PlayerLink id={player.id} name={player.name} />
                <small>
                  {player.position} · {w.year - player.born}세 · 피로 {Math.round(player.fatigue)}
                </small>
                <small>
                  OVR {overall(player)} · POT {Math.round(player.potential)} · 성장 +
                  {(player.developed || 0).toFixed(2)}
                </small>
              </span>
              <span className={s.playerFocus} data-testid={`player-focus-${player.id}`}>
                <b>{focusName(focusFor(w, player, squadFocus))}</b>
                <small>
                  {call.by}
                  {call.rounds ? ` · ${call.rounds}라운드 남음` : ''}
                  {wait > 0 ? ` · 제안 ${wait}라운드 뒤` : ''}
                </small>
                <small>
                  적응 {player.adaptation.toFixed(2)} · {multiplierLabel(ownMultiplier(player))}
                </small>
                <small>
                  적응 속도 ×{Number(settleRate(w, player).toFixed(2))}
                  {player.unsettled !== undefined && ' · 적응 실패'}
                </small>
              </span>
              <button
                type="button"
                aria-label={`${player.name} 개별 훈련`}
                onClick={() => onSheet({ coach: 'assistant', player: player.id })}
              >
                개별 훈련
              </button>
            </li>
          );
        })}
      </ul>
      {!squad.length && (
        <p className={s.note}>
          {filter === 'attention'
            ? '지금은 피로·적응 문제로 따로 관리할 선수가 없어요. 코치가 현재 훈련을 맡고 있어요.'
            : '이 조건에 맞는 선수가 없어요.'}
        </p>
      )}
      <details className={s.reference}>
        <summary>개별 훈련·적응·성장 설명</summary>
        <p className={s.note}>
          제안은 선수마다 2라운드에 한 번이고, 강행은 수석코치의 사임 위험을 올려요. 받아들인 변경은
          4라운드 동안 적용해요.
        </p>
        <p className={s.note}>
          적응도 {ADAPTATION_NEUTRAL.toFixed(2)}에서 능력 그대로 뛰어요. 선발 출전은 경기당 +
          {MATCH_GAIN.start.toFixed(3)} × 그 자리 숙련도, 훈련은 라운드마다 +
          {TRAINING_GAIN.recovery.toFixed(3)}–{TRAINING_GAIN.hard.toFixed(3)}예요. 적응력과 감독
          학파에 따라 달라져요. 성장 값은 이 선수가 쌓은 성장이고 최근 한 경기의 변화가 아니에요.
        </p>
      </details>
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
  'training/training': '1군 훈련',
  'business/strategy': '운영 방침',
  'people/manager': '감독',
  'people/coaches': '스태프',
  'business/facility': '시설',
};
const toneOf = (value: number) => (value > 1 ? 'up' : value < 1 ? 'down' : 'flat');
/** Terms that change something; a row whose terms all multiply by 1 shows its first one. */
const shownTerms = (terms: DevelopmentFactor[]) => {
  const changing = terms.filter((term) => term.value !== 1);
  return changing.length ? changing : terms.slice(0, 1);
};
const termText = (term: DevelopmentFactor) =>
  `${term.applies === 'u21' ? '21세 이하 ' : ''}${times(term.value)}`;

/** Opens where a term is set (→WEB-71); the focus is shown above, on this tab. */
function openDriver(home: DevelopmentHome, label: string) {
  if (home === 'training/training') {
    document
      .getElementById('training-focus')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  if (home === 'business/strategy') {
    openDirection(label === '선수단 투자' ? 'squad' : 'youth');
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
  const coaching = ATTRIBUTES.filter((skill) => skills[skill] !== 1).map(
    (skill) => `${ATTRIBUTE_LABEL[skill]} ${times(skills[skill])}`,
  );
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
      <details className={s.reference}>
        <summary>성장 요인·투자·스태프 자세히</summary>
        <p className={s.note}>
          27세 미만 선수는 라운드마다 잠재력까지 남은 차이에 이 배수를 모두 곱한 만큼 자라요.
          어릴수록 더 빨리 자라요. 아래 항목을 누르면 정하는 곳으로 가요.
        </p>
        <ul className={s.drivers}>
          {rows.map((row) => {
            const shown = shownTerms(row.terms);
            return (
              <li key={row.label}>
                <button
                  type="button"
                  aria-label={`${row.label} ${shown.map(termText).join(' · ')} · ${homeName[row.home]}에서 보기`}
                  onClick={() => openDriver(row.home, row.label)}
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
      </details>
    </section>
  );
}
