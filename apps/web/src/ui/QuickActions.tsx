import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { RemedyBody } from './RemedySheet';
import { TrainingOrderSheet } from './TrainingOrderSheet';
import { quickGroups, type QuickGroupKey } from './quickActionGroups';
import type { Remedy } from './teamState';
import s from './ClubHub.module.css';

/**
 * The clubhouse's quick actions (→WEB-11): one tile per topic with the figure it moves, opening
 * a sheet of choices that act where they stand — a request, a command or a coach's training
 * sheet over the clubhouse — each with its cost, effect and chances before commit (→WEB-44).
 */
export function QuickActions({ w, client }: { w: World; client: GameClient }) {
  const [open, setOpen] = useState<QuickGroupKey>();
  const [training, setTraining] = useState<NonNullable<Remedy['coach']>>();
  const acting = useGameState(gameActionsBlocked);
  const groups = quickGroups(w);
  const group = groups.find((item) => item.key === open);
  const close = () => setOpen(undefined);
  return (
    <section className={`${s.state} ${s.quick}`} aria-label="퀵 액션" data-testid="quick-actions">
      <ul data-home-part="quick-actions">
        {groups.map((item) => {
          const ready = item.actions.filter((action) => !action.unavailable).length;
          return (
            // The condition's attribute wears the theme's team-state tile.
            <li
              key={item.key}
              className={s[item.tone]}
              data-condition={item.key}
              data-quick={item.key}
            >
              <button
                aria-label={`${item.label} ${item.value} · ${item.status}${item.warning ? ' · 주의' : ''} · 바로 할 수 있는 일 ${ready}개`}
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.currentTarget.focus();
                  setOpen(item.key);
                }}
              >
                <span className={s.stateLabel}>
                  {item.label}
                  {item.warning && (
                    <span
                      className={s.warningBadge}
                      data-testid={`quick-warning-${item.key}`}
                      aria-hidden="true"
                    >
                      !
                    </span>
                  )}
                </span>
                <b>
                  <i key={item.value} className={s.bump}>
                    {item.value}
                  </i>
                </b>
                <small>{item.status}</small>
              </button>
            </li>
          );
        })}
      </ul>
      {group && (
        <Dialog
          label={group.title}
          onClose={close}
          wide
          actions={
            <div className={s.remedyActions}>
              <button data-ui="primary" onClick={close}>
                확인
              </button>
            </div>
          }
        >
          <Card
            as="section"
            surface="ticket"
            className={s.remedyReport}
            aria-label="지금 상태"
            meta={group.facts}
          >
            <p>{group.text}</p>
          </Card>
          <h3 className={s.remedyTitle}>바로 할 수 있는 일</h3>
          <ul className={s.remedies}>
            {group.actions.map((action) => (
              <li
                key={action.id}
                data-surface="tile"
                className={action.unavailable ? s.remedyOff : undefined}
              >
                <RemedyBody remedy={action} />
                <button
                  disabled={!!action.unavailable || (acting && !!action.command)}
                  onClick={() => {
                    if (action.coach) {
                      close();
                      setTraining(action.coach);
                    } else if (action.command) void client.command(action.command);
                  }}
                >
                  {action.coach ? '검토' : action.by ? '요청' : '실행'}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {training && (
        <TrainingOrderSheet
          w={w}
          client={client}
          coach={training.coach}
          ready={training.focus}
          onClose={() => setTraining(undefined)}
        />
      )}
    </section>
  );
}
