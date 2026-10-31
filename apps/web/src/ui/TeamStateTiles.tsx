import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { RemedySheet } from './RemedySheet';
import { cashState, teamStates, type StateKey } from './teamState';
import s from './ClubHub.module.css';

/**
 * The team's current conditions in the owner's office (→WEB-39/44): each tile opens its
 * explanation, its remedies and the places that deal with it.
 */
export function TeamState({
  w,
  client,
  onPrepare,
}: {
  w: World;
  client: GameClient;
  onPrepare: () => void;
}) {
  const [sheet, setSheet] = useState<StateKey>();
  const states = teamStates(w);
  return (
    <section className={s.state} aria-label="팀 상태" data-testid="team-state">
      <ul data-home-part="conditions">
        {states.map((state) => (
          <li key={state.key} className={s[state.tone]} data-condition={state.key}>
            <button
              aria-label={`${state.label} ${state.value} · ${state.status}${state.advice ? ' · 주의' : ''} · 대처 방법 보기`}
              aria-haspopup="dialog"
              onClick={(event) => {
                event.currentTarget.focus();
                setSheet(state.key);
              }}
            >
              <span className={s.stateLabel}>
                {state.label}
                {state.advice && (
                  <span
                    className={s.warningBadge}
                    data-testid={`state-warning-${state.key}`}
                    aria-hidden="true"
                  >
                    !
                  </span>
                )}
              </span>
              <b>
                <i key={state.value} className={s.bump}>
                  {state.value}
                </i>
              </b>
              <small>
                {state.status
                  .split(/(\d+)/)
                  .map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part))}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {!states.some((state) => state.advice) && !cashState(w).advice && (
        <p className={s.calm}>팀이 안정적이에요. 상태를 누르면 미리 챙길 방법을 볼 수 있어요.</p>
      )}
      {sheet && (
        <RemedySheet
          w={w}
          client={client}
          state={sheet}
          onClose={() => setSheet(undefined)}
          onPrepare={onPrepare}
        />
      )}
    </section>
  );
}
