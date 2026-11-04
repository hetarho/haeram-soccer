import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { returnToTask, useNavigation } from './state';
import { isTaskDestination, taskAddress, useTaskMemory } from './taskMemory';
import s from './App.module.css';

export function TaskReturn({ compact = false }: { compact?: boolean }) {
  useTextLocale();
  const page = useNavigation((state) => state.page);
  const setPage = useNavigation((state) => state.setPage);
  const task = useTaskMemory((state) => state.returning);
  const contextual = task && isTaskDestination(task.target, page) && task.address !== taskAddress();
  if (!contextual && !compact) return null;
  const label = contextual ? task.label : sourceMessage('copy.TaskReturn.eb3de82bf1');
  return (
    <div className={compact ? s.taskReturnInline : s.taskReturn}>
      <button
        type="button"
        data-ui={compact ? 'link' : undefined}
        aria-label={localizeValue(
          compact ? sourceMessage('copy.TaskReturn.70f7423593', { p0: label }) : undefined,
        )}
        onClick={contextual ? returnToTask : () => setPage('dashboard')}
      >
        {localizeValue(
          compact
            ? sourceMessage('copy.TaskReturn.0e78c9db86')
            : sourceMessage('copy.TaskReturn.46e8554e62', { p0: label }),
        )}
      </button>
      {localizeValue(!compact && <small>{richMessage('copy.TaskReturn.3191d3cea0')}</small>)}
    </div>
  );
}
