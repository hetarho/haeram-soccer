import { displayMessage, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { ClubGoal } from '../../../../../../packages/engine/src/goals';
import { Dialog } from '../../../shared/ui/Dialog';
import s from './PlayGuide.module.css';
export function PlayGuide({ goals, onClose }: { goals: ClubGoal[]; onClose: () => void }) {
  useTextLocale();
  const done = (id: string) => goals.some((goal) => goal.id === id && goal.done);
  return (
    <Dialog
      label={displayMessage('shell.guide')}
      onClose={onClose}
      actions={
        <button data-ui="primary" className={s.close} onClick={onClose}>
          {richMessage('copy.PlayGuide.22d7fe45cb')}
        </button>
      }
    >
      <div className={s.intro}>
        <span>{richMessage('copy.PlayGuide.9c10f26482')}</span>
        <h2>{richMessage('copy.PlayGuide.6569e91b3e')}</h2>
        <p>{richMessage('copy.PlayGuide.5843e2d3b3')}</p>
      </div>
      <ol className={s.steps}>
        <li>
          <b>01</b>
          <div>
            <h3>
              {richMessage('copy.PlayGuide.d6619eb2fb', {
                p0: done('preparation') && <span>{richMessage('copy.PlayGuide.11b5ab8eb3')}</span>,
              })}
            </h3>
            <p>{richMessage('copy.PlayGuide.703b11909e')}</p>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <h3>
              {richMessage('copy.PlayGuide.7efdf1935b', {
                p0: done('debut') && <span>{richMessage('copy.PlayGuide.11b5ab8eb3')}</span>,
              })}
            </h3>
            <p>{richMessage('copy.PlayGuide.f4e9df43a5')}</p>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <h3>
              {richMessage('copy.PlayGuide.5865b44e97', {
                p0: done('player-growth') && (
                  <span>{richMessage('copy.PlayGuide.11b5ab8eb3')}</span>
                ),
              })}
            </h3>
            <p>{richMessage('copy.PlayGuide.79cff096ac')}</p>
          </div>
        </li>
      </ol>
      <p data-surface="inset" className={s.note}>
        {richMessage('copy.PlayGuide.680d5e9edd')}
      </p>
    </Dialog>
  );
}
