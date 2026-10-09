import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { useNavigation, useSquadView } from './state';
import {
  cashState,
  remedies,
  STATE_TITLES,
  teamStates,
  type StateAction,
  type StateKey,
} from './teamState';
import s from './ClubHub.module.css';

/** Runs one remedy: an engine command, the preparation sheet, or another view. */
export function useRemedyRunner(client: GameClient, onPrepare?: () => void) {
  const { setPage } = useNavigation();
  const setSquadTab = useSquadView((state) => state.setTab);
  return (action: StateAction) => {
    if (action.command) void client.command(action.command);
    else if (action.prepare) onPrepare?.();
    else if (action.page) {
      if (action.tab) setSquadTab(action.tab);
      setPage(action.page);
    }
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
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
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
