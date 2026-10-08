import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { recordedGoals } from './moments';
import s from './Analysis.module.css';

export function MatchMoments({
  record,
  onSeek,
}: {
  record: MatchRecord;
  onSeek: (minute: number) => void;
}) {
  const goals = recordedGoals(record);
  return (
    <details className={s.disclosure}>
      <summary>주요 장면 탐색</summary>
      <section className={s.content} aria-label="주요 장면 탐색">
        <div className={s.controls}>
          <button onClick={() => onSeek(1)}>킥오프 · 1분</button>
          <button onClick={() => onSeek(45)}>전반 종료 · 45분</button>
          <button onClick={() => onSeek(90)}>경기 종료 · 90분</button>
        </div>
        <ol className={s.momentList}>
          {goals.map((goal, i) => (
            <li key={i}>
              <button data-testid="recorded-goal" onClick={() => onSeek(goal.minute)}>
                <b>
                  {goal.minute}′ · {goal.player}
                </b>
                <span>
                  {goal.side === 0 ? '홈' : '원정'} 득점 · {goal.home}–{goal.away}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {!goals.length && <p className={s.note}>득점 장면이 없는 경기예요.</p>}
        {record.highlights
          .filter((h) => h.action !== '골')
          .map((h, i) => (
            <p className={s.note} key={i}>
              {h.minute}′ · {h.action}
            </p>
          ))}
        <p className={s.note}>
          장면 선택은 재생만 이동하고 일시정지해요. 경기 결과와 날짜는 그대로예요.
        </p>
      </section>
    </details>
  );
}
