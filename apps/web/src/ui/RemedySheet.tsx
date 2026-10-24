import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import {
  openCoachSheet,
  openPeople,
  openTraining,
  useDepartmentPolicy,
  useNavigation,
  type PeopleRequest,
  type TrainingTab,
} from './state';
import {
  cashState,
  remedies,
  STATE_TITLES,
  teamStates,
  type StateAction,
  type StateKey,
} from './teamState';
import s from './ClubHub.module.css';

/**
 * Runs one remedy: an engine command, the preparation sheet, or another view. A remedy for a
 * setting opens its home with the choice ready to apply — 훈련 with the focus suggested, the
 * operating board with the dial as its draft — and changes nothing itself (→WEB-44, WEB-71).
 */
export function useRemedyRunner(client: GameClient, onPrepare?: () => void) {
  const setPage = useNavigation((state) => state.setPage);
  return (action: StateAction) => {
    if (action.command) void client.command(action.command);
    else if (action.prepare) onPrepare?.();
    else if (action.coach) openCoachSheet(action.coach.coach, action.coach.focus);
    else if (action.board) {
      useDepartmentPolicy.getState().open(action.board);
    } else if (action.page === 'people') openPeople((action.tab as PeopleRequest) ?? 'players');
    else if (action.page === 'training') openTraining((action.tab as TrainingTab) ?? 'training');
    else if (action.page) setPage(action.page);
  };
}

/**
 * Every choice for one club state with its cost, effect, chances and cooldown before commit
 * (→WEB-44). Navigation choices close the sheet.
 */
export function RemedySheet({
  w,
  client,
  state: key,
  onClose,
  onPrepare,
}: {
  w: World;
  client: GameClient;
  state: StateKey;
  onClose: () => void;
  onPrepare?: () => void;
}) {
  const acting = useGameState(gameActionsBlocked);
  const run = useRemedyRunner(client, () => {
    onClose();
    onPrepare?.();
  });
  const current = key === 'cash' ? cashState(w) : teamStates(w).find((item) => item.key === key)!;
  return (
    <Dialog label={STATE_TITLES[key]} onClose={onClose}>
      <header className={s.remedyHead}>
        <span className={s[current.tone]}>
          {current.label} {current.value} · {current.status}
        </span>
      </header>
      {current.advice && <p className={s.remedyAdvice}>{current.advice.text}</p>}
      <ul className={s.remedies}>
        {remedies(w, key).map((remedy) => (
          <li key={remedy.id} className={remedy.unavailable ? s.remedyOff : undefined}>
            <div>
              <b>
                {remedy.label}
                {remedy.by && <small className={s.remedyBy}>{remedy.by}</small>}
              </b>
              <small>{remedy.effect}</small>
              {remedy.chances && (
                <ul className={s.chances} aria-label={`${remedy.label} 결과 확률`}>
                  {remedy.chances.map((chance) => (
                    <li key={chance.text}>
                      <b>{chance.chance}%</b> {chance.text}
                    </li>
                  ))}
                </ul>
              )}
              {(remedy.cost || remedy.unavailable) && (
                <em>{remedy.unavailable || `비용 ${remedy.cost}`}</em>
              )}
            </div>
            <button
              disabled={!!remedy.unavailable || (acting && !!remedy.command)}
              onClick={() => {
                if (!remedy.command) onClose();
                run(remedy);
              }}
            >
              {remedy.command ? (remedy.by ? '요청' : '실행') : '열기'}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
