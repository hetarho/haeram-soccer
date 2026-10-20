import type { MatchFrame, MatchRecord } from '../../../../packages/contracts/src/types';
import { goalFrame, incidentFrame, recordedGoals, recordedIncidents, type Moment } from './moments';
import s from './Analysis.module.css';

const incidentText = { sub: '교체', secondYellow: '경고 누적 퇴장', red: '퇴장' } as const;

export function MatchMoments({
  record,
  frames,
  names,
  onSeek,
  live = false,
}: {
  record: MatchRecord;
  /** The playback's frames: they give each moment its minute label (`45+2`). */
  frames: MatchFrame[];
  /** Player names by ID; incidents name players by ID. */
  names?: Map<string, string>;
  onSeek: (moment: Moment) => void;
  live?: boolean;
}) {
  const name = (id?: string) => (id && names?.get(id)) || id || '선수';
  const goals = recordedGoals(record);
  // Goals, red cards and substitutions in match order, each labelled as its frame reads.
  // A moment seeks to the frame it lands on; without one, to its recorded minute.
  const moments = [
    ...goals.map((goal) => {
      const at = goalFrame(frames, goal);
      const label = frames[at]?.label ?? `${goal.minute}`;
      return { at, goal, incident: undefined, label, seek: label };
    }),
    ...recordedIncidents(record).map((incident) => {
      const at = incidentFrame(frames, incident);
      const seek = frames[at]?.label ?? incident.label;
      return { at, goal: undefined, incident, label: incident.label, seek };
    }),
  ].sort((a, b) => a.at - b.at);
  return (
    <details className={s.disclosure}>
      <summary>주요 장면 탐색</summary>
      <section className={s.content} aria-label="주요 장면 탐색">
        <div className={s.controls}>
          <button onClick={() => onSeek('kickoff')}>킥오프 · 1분</button>
          <button onClick={() => onSeek('halfTime')}>전반 종료 · 45분</button>
          <button onClick={() => onSeek('fullTime')}>경기 종료 · 90분</button>
        </div>
        <ol className={s.momentList}>
          {moments.map(({ goal, incident, label, seek }, i) => (
            <li key={i}>
              {goal ? (
                <button data-testid="recorded-goal" onClick={() => onSeek(seek)}>
                  <b>
                    {label}′ · {goal.player}
                  </b>
                  <span>
                    {goal.side === 0 ? '홈' : '원정'} 득점 · {goal.home}–{goal.away}
                  </span>
                </button>
              ) : (
                incident && (
                  <button data-testid="recorded-incident" onClick={() => onSeek(seek)}>
                    <b>
                      {label}′ ·{' '}
                      {incident.kind === 'sub'
                        ? `${name(incident.player)} ↔ ${name(incident.other)}`
                        : name(incident.player)}
                    </b>
                    <span>
                      {incident.side === 0 ? '홈' : '원정'} {incidentText[incident.kind]}
                    </span>
                  </button>
                )
              )}
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
          장면 선택은 재생만 이동하고 일시정지해요. {live && '배속을 선택하면 이어서 관전해요. '}
          경기 결과와 날짜는 그대로예요.
        </p>
      </section>
    </details>
  );
}
