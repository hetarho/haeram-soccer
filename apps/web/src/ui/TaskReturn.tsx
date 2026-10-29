import { returnToTask, useNavigation } from './state';
import { isTaskDestination, taskAddress, useTaskMemory } from './taskMemory';
import s from './App.module.css';

export function TaskReturn() {
  const page = useNavigation((state) => state.page);
  const task = useTaskMemory((state) => state.returning);
  if (!task || !isTaskDestination(task.target, page) || task.address === taskAddress()) return null;
  return (
    <div className={s.taskReturn}>
      <button type="button" onClick={returnToTask}>
        ← 돌아가기 · {task.label}
      </button>
      <small>설정을 확인한 뒤 하던 작업을 이어가요</small>
    </div>
  );
}
