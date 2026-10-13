import { useEffect, useState } from 'react';
import type { TrainingFocus, World } from '../../../../packages/contracts/src/types';
import { activeTrainingFocus, trainingFocusInfo } from '../../../../packages/engine/src/training';
import { autoTrainingAdvice } from '../../../../packages/engine/src/staff';
import type { ClientState, GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { AcademyPanel } from './AcademyPanel';
import { PageTabs, TabPanel } from './PageTabs';
import { routeOf, TRAINING_TABS, useTrainingView, type TrainingTab } from './state';
import s from './App.module.css';

type Props = { state: ClientState; client: GameClient };

const FOCUSES: readonly [TrainingFocus, string][] = [
  ['balanced', '균형'],
  ['youth', '유망주 집중'],
  ['recovery', '회복 집중'],
];
const focusName = (focus: TrainingFocus) => FOCUSES.find(([id]) => id === focus)![1];

/** The 훈련 tab a request or the address asks for. */
function trainingStart(request: TrainingTab | undefined): TrainingTab {
  if (request) return request;
  const route = routeOf(location.pathname, location.search);
  return TRAINING_TABS.find(([id]) => id === route.view)?.[0] ?? 'training';
}

/**
 * 훈련 (→WEB-70): how the club develops its players, as one tab bar — the training focus and the
 * academy. A request from elsewhere is taken once; otherwise the tab comes from the address.
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
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <div className={s.eyebrow}>TRAINING</div>
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
          <TrainingFocusPanel w={w} client={client} />
        ) : (
          <AcademyPanel w={w} client={client} />
        )}
      </TabPanel>
    </>
  );
}

/**
 * The training focus in force, chosen on tap, or left to the assistant coach, who picks it each
 * round (→CLUB-13). Choosing a focus takes the decision back from him.
 */
function TrainingFocusPanel({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly || !!state.error);
  const delegated = !!w.delegation?.training,
    active = activeTrainingFocus(w),
    advice = delegated ? autoTrainingAdvice(w) : undefined;
  return (
    <section className={s.panel} aria-label="훈련 방향">
      <div className={s.panelHead}>
        <h3>훈련 방향</h3>
        <span data-testid="training-focus">
          지금 {focusName(active)}
          {delegated ? ' · 수석코치가 정함' : ''}
        </span>
      </div>
      <div className={s.panelBody}>
        <div className={s.segments} role="radiogroup" aria-label="훈련 방향">
          {FOCUSES.map(([focus, label]) => (
            <button
              key={focus}
              type="button"
              role="radio"
              aria-checked={active === focus}
              className={active === focus ? s.selected : undefined}
              disabled={acting}
              onClick={() => {
                if (!delegated && active === focus) return;
                void client.command({ type: 'training', focus });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={s.muted}>{trainingFocusInfo[active].description}</p>
        <div className={s.toggles}>
          <label>
            <input
              type="checkbox"
              checked={delegated}
              disabled={acting}
              onChange={(event) =>
                void client.command({
                  type: 'delegate',
                  key: 'training',
                  value: event.target.checked,
                })
              }
            />
            코치에게 맡기기
          </label>
        </div>
        {advice && (
          <p className={s.muted} data-testid="training-advice">
            수석코치의 이번 라운드 선택 · {focusName(advice.focus)} · {advice.reason}
          </p>
        )}
      </div>
    </section>
  );
}
