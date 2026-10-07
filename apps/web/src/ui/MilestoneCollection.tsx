import type { World } from '../../../../packages/contracts/src/types';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import { Dialog } from './Dialog';
import s from './MilestoneCollection.module.css';

const amount = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export function MilestoneCollection({
  w,
  onClose,
  milestones: suppliedMilestones,
}: {
  w: World;
  onClose: () => void;
  milestones?: ReturnType<typeof clubMilestones>;
}) {
  const milestones = suppliedMilestones ?? clubMilestones(w);
  return (
    <Dialog
      label="클럽 성장 목표"
      onClose={onClose}
      actions={
        <div className={s.actions}>
          <button onClick={onClose}>목표 확인 마치기</button>
        </div>
      }
    >
      <div className={s.intro}>
        <div>
          <span>OUR CLUB, ONE STEP AT A TIME</span>
          <h2>작은 선택이 쌓인 흔적.</h2>
          <p>경기와 준비, 선수와 구장의 성장을 기록에서 확인해요.</p>
        </div>
        <strong aria-label="달성한 성장 목표">
          {milestones.completed}
          <small> / {milestones.total} 달성</small>
        </strong>
      </div>
      {milestones.next && (
        <div className={s.next}>
          <span>지금 이어갈 도전</span>
          <b>{milestones.next.title}</b>
          <small>{milestones.next.action}</small>
        </div>
      )}
      <ul className={s.collection} aria-label="클럽 성장 목표 목록">
        {milestones.goals.map((goal, index) => (
          <li
            key={goal.id}
            data-testid={`milestone-${goal.id}`}
            className={goal.done ? s.complete : ''}
          >
            <div className={s.goalHeading}>
              <span className={s.symbol} aria-hidden="true">
                {goal.done ? '✓' : String(index + 1).padStart(2, '0')}
              </span>
              <h3>{goal.title}</h3>
              <span className={s.badge}>{goal.done ? '달성' : '진행 중'}</span>
            </div>
            <p>{goal.description}</p>
            <div className={s.progressText}>
              <b>
                {amount(goal.current)} / {amount(goal.target)}
              </b>
              <span>{amount(goal.progress)}%</span>
            </div>
            <progress aria-label={`${goal.title} 진행률`} value={goal.progress} max={100} />
            <div className={s.action}>
              <span>{goal.done ? '이어갈 선택' : '다음 행동'}</span>
              <b>{goal.action}</b>
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
