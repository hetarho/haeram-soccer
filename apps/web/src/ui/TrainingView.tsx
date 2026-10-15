import { useEffect, useState } from 'react';
import { FacilityArt } from './FacilityArt';
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
import { activePlayers, ownMultiplier } from '../../../../packages/engine/src/world';
import {
  ADAPTATION_NEUTRAL,
  MATCH_GAIN,
  TRAINING_GAIN,
} from '../../../../packages/engine/src/player';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { OvrBadge } from './OvrBadge';
import { PageTabs, TabPanel } from './PageTabs';
import { PlayerLink } from './PlayerSheet';
import {
  openHome,
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
import a from './App.module.css';
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
            <figure className={`${s.trainingScene} ${s.wide}`}>
              <FacilityArt kind="training" world={w} className={s.trainingArt} />
              <figcaption>
                <span>TRAINING GROUND</span>
                <strong>
                  {w.trainingGround ? `${w.trainingGround}단계 훈련장` : '기본 훈련장'}
                </strong>
                <small>지금 {focusName(outlook.focus.focus)}</small>
              </figcaption>
            </figure>
            <TrainingFocusPanel w={w} outlook={outlook} onSheet={setSheet} />
            <PlayerTraining w={w} onSheet={setSheet} />
            <AdaptationPanel w={w} />
            <DevelopmentDrivers outlook={outlook} />
            <GrowingPlayers outlook={outlook} />
          </div>
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
      <button type="button" className={s.homeLine} onClick={() => onSheet({ coach: 'assistant' })}>
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

/**
 * 개별 훈련 (→CLUB-11, STAFF-19): who trains on a focus of his own and who set it, then every
 * first-team player with his focus this round and the sheet to suggest or force one for him.
 */
function PlayerTraining({ w, onSheet }: { w: World; onSheet: (sheet: Sheet) => void }) {
  // The squad's focus is read once: each row only adds his own order or rule to it.
  const squadFocus = activeTrainingFocus(w);
  const squad = [...activePlayers(w)]
    .sort((a, b) => b.fatigue - a.fatigue)
    .map((player) => ({ player, call: playerCallLine(w, player, squadFocus) }));
  const own = squad.filter(({ call }) => call.by !== '팀 훈련').length;
  return (
    <section className={s.card} aria-label="개별 훈련">
      <header className={s.head}>
        <h3>개별 훈련</h3>
        <span data-testid="own-focus-count">따로 훈련 {own}명</span>
      </header>
      <p className={s.note}>
        선수마다 팀과 다른 훈련을 제안하거나 강행할 수 있어요. 제안은 선수마다 2라운드에 한 번이고,
        강행은 수석코치의 사임 위험을 올려요.
      </p>
      <ul className={s.players}>
        {squad.map(({ player, call }) => {
          const wait = playerSuggestionWait(w, player.id),
            own = call.by !== '팀 훈련';
          return (
            <li key={player.id} data-own={own || undefined}>
              <span className={s.playerName}>
                <PlayerLink id={player.id} name={player.name} />
                <small>
                  {player.position} · 피로 {Math.round(player.fatigue)}
                </small>
              </span>
              <span className={s.playerFocus} data-testid={`player-focus-${player.id}`}>
                <b>{focusName(focusFor(w, player, squadFocus))}</b>
                <small>
                  {call.by}
                  {call.rounds ? ` · ${call.rounds}라운드 남음` : ''}
                  {wait > 0 ? ` · 제안 ${wait}라운드 뒤` : ''}
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
    </section>
  );
}

/**
 * 적응 (→PLAYER-10, PLAYER-12, PLAYER-14): every first-team player's adaptation, the multiplier it
 * puts on his ability, an 적응 실패 flag, and how fast he settles under this manager.
 */
function AdaptationPanel({ w }: { w: World }) {
  const squad = [...activePlayers(w)].sort((a, b) => a.adaptation - b.adaptation);
  return (
    <section className={s.card} aria-label="적응">
      <header className={s.head}>
        <h3>적응</h3>
        <span>낮은 순</span>
      </header>
      <p className={s.note}>
        적응도 {ADAPTATION_NEUTRAL.toFixed(2)}에서 능력 그대로 뛰고, 높으면 조금 더, 낮으면 크게 덜
        뛰어요. 선발 출전이 가장 크게 올려요(경기당 +{MATCH_GAIN.start.toFixed(3)} × 그 자리 숙련도:
        최상 1 · 준수 0.8 · 어색 0.5 · 미숙 0.2). 훈련은 라운드마다 +
        {TRAINING_GAIN.recovery.toFixed(3)}–{TRAINING_GAIN.hard.toFixed(3)}. 적응 속도는 선수의
        적응력과 감독 학파가 좋아하는 유형인지에 따라 달라요.
      </p>
      <ul className={s.players} data-testid="adaptation-list">
        {squad.map((player) => (
          <li key={player.id}>
            <span className={s.playerName}>
              <PlayerLink id={player.id} name={player.name} />
              <small>{player.position}</small>
            </span>
            <span className={s.playerFocus}>
              <b>
                {player.adaptation.toFixed(2)} · {multiplierLabel(ownMultiplier(player))}
              </b>
              <small>적응 속도 ×{Number(settleRate(w, player).toFixed(2))}</small>
            </span>
            {player.unsettled !== undefined && <em className={s.flag}>적응 실패</em>}
          </li>
        ))}
      </ul>
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
              <OvrBadge value={ability} role={player.position} potential={potential} />
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
