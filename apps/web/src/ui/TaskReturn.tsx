import { returnToTask, useNavigation } from './state';
import { isTaskDestination, taskAddress, useTaskMemory } from './taskMemory';
import s from './App.module.css';

export function TaskReturn({ compact = false }: { compact?: boolean }) {
  const page = useNavigation((state) => state.page);
  const setPage = useNavigation((state) => state.setPage);
  const task = useTaskMemory((state) => state.returning);
  const contextual = task && isTaskDestination(task.target, page) && task.address !== taskAddress();
  if (!contextual && !compact) return null;
  const label = contextual ? task.label : '클럽 홈';
  return (
    <div className={compact ? s.taskReturnInline : s.taskReturn}>
      <button
        type="button"
        data-ui={compact ? 'link' : undefined}
        aria-label={compact ? `돌아가기 · ${label}` : undefined}
        onClick={contextual ? returnToTask : () => setPage('dashboard')}
      >
        {compact ? '← 돌아가기' : `← 돌아가기 · ${label}`}
      </button>
      {!compact && <small>설정을 확인한 뒤 하던 작업을 이어가요</small>}
    </div>
  );
}
