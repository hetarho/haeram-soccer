import { useEffect, useMemo, useRef, useState } from 'react';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { Dialog } from './Dialog';
import { Money } from './Money';
import { activityUnavailable, placeActivities, placeActivityClient } from './placeActivityChoices';
import { useAcademyReview } from './state';
import s from './PlaceActivities.module.css';

export interface PlaceActivitiesProps {
  state: ClientState;
  client: GameClient;
}

/**
 * 유소년's working place (→WEB-102): its current state, the prospects with their promotion and
 * release decisions at actual costs and risks, and its real records. The other places only read
 * and have no panel of owner choices.
 */
export function PlaceActivities(props: PlaceActivitiesProps) {
  const world = props.state.view?.world;
  return world ? <Activities key={world.id} {...props} /> : null;
}

function Activities({ state, client }: PlaceActivitiesProps) {
  const w = state.view!.world;
  const model = placeActivities(w);
  const club = clubOf(w);
  /** The prospect under review. */
  const [inspection, setInspection] = useState<string>();
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const inspectionSerial = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const scoped = useMemo(() => {
    const serial = inspectionSerial.current;
    return placeActivityClient(
      client,
      w,
      () => mounted.current && inspectionSerial.current === serial,
      setError,
    );
  }, [client, w, inspection]);
  const close = () => {
    inspectionSerial.current++;
    setInspection(undefined);
    setError('');
  };
  const inspect = (next: string) => {
    inspectionSerial.current++;
    setError('');
    setInspection(next);
  };
  // A prospect named in 팀's academy list opens his review here, as its own row would (→WEB-112).
  const asked = useAcademyReview((store) => store.request);
  useEffect(() => {
    if (!asked) return;
    useAcademyReview.getState().take();
    if (model.academy.players.some(({ player }) => player.id === asked)) inspect(asked);
  }, [asked]);
  const reason = activityUnavailable(state, w);
  const reviewed = inspection
    ? model.academy.players.find(({ player }) => player.id === inspection)
    : undefined;
  const reviewedGroup = model.academy.groups.find((group) => group.key === reviewed?.group);
  return (
    <section
      className={s.panel}
      aria-label="유소년에서 할 일"
      data-testid="place-activities-academy"
    >
      <ul className={s.facts} aria-label="현재 상태">
        {model.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {reason && <p className={s.note}>{reason}</p>}
      <AcademyPanel w={w} client={scoped} onReview={inspect} />
      {error && (
        <p role="alert" className={s.note}>
          {error}
        </p>
      )}
      <div className={s.records} aria-label="이 장소의 실제 기록" aria-live="polite">
        <b>최근 기록</b>
        {model.records.length ? (
          model.records.map((event, i) => (
            <p key={`${event.year}:${event.round}:${event.kind}:${i}`}>
              <b>
                {event.year}년 · {event.title}
              </b>
              <small>{event.detail}</small>
              {event.amount !== undefined && (
                <Money value={event.amount} code={club.country} year={event.year} />
              )}
            </p>
          ))
        ) : (
          <p>아직 이 장소의 기록이 없어요.</p>
        )}
      </div>
      {inspection && (
        <Dialog label="유소년 승격·방출 검토" onClose={close}>
          {reviewed ? (
            <>
              <p>
                {reviewed.player.name} · OVR {reviewed.overall} / POT {reviewed.potential} ·{' '}
                {reviewed.label}
              </p>
              <p>
                승격: 즉시 1군 합류 · 시장 급여를 지급하는 첫 프로 계약 · 아카데미의 연령별 성장
                대신 1군 훈련과 출전 경쟁. 선발 출전은 보장되지 않아요.
              </p>
              <p>
                승격 후 연봉{' '}
                <Money value={reviewed.promotionWage} code={club.country} year={w.year} />
              </p>
              <p>
                현재 {reviewedGroup?.label} 성장 ×{reviewedGroup?.factor} · 승격 후 계약 종료{' '}
                {w.year + 3}년
              </p>
              {reviewed.promotionUnavailable && (
                <p role="status">승격 불가: {reviewed.promotionUnavailable}</p>
              )}
              <p>
                방출: 즉시 아카데미 자리 확보 · 이 선수의 잠재력과 남은 성장 기회를 포기해요.
                승격·방출에는 재요청 대기가 없어요.
              </p>
              {reason && <p role="status">{reason}</p>}
              <AcademyPanel w={w} client={scoped} selected={reviewed.player.id} />
            </>
          ) : (
            <p>이미 승격·방출되었거나 현재 아카데미에 없는 선수예요.</p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className={s.actions}>
            <button type="button" onClick={close}>
              취소
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
