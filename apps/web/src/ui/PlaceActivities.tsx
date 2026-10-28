import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CareKind } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { activeDialogSurface, Dialog } from './Dialog';
import { Money } from './Money';
import { Select } from './Select';
import { TrainingOrderSheet } from './TrainingOrderSheet';
import {
  activityUnavailable,
  placeActivities,
  placeActivityClient,
  type ActivityPlace,
} from './placeActivities';
import s from './PlaceActivities.module.css';

/** Import from './PlaceActivities.tsx' to distinguish the component from placeActivities.ts. */
export interface PlaceActivitiesProps {
  place: ActivityPlace;
  state: ClientState;
  client: GameClient;
}

type Inspection =
  | { type: 'care'; kind: CareKind; revision: number }
  | { type: 'training' }
  | { type: 'academy'; player: string };

export function PlaceActivities(props: PlaceActivitiesProps) {
  const world = props.state.view?.world;
  return world ? <Activities key={`${world.id}:${props.place}`} {...props} /> : null;
}

function Activities({ place, state, client }: PlaceActivitiesProps) {
  const w = state.view!.world;
  const model = placeActivities(w, place);
  const club = clubOf(w);
  const [inspection, setInspection] = useState<Inspection>();
  const [prospect, setProspect] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
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
  const inspect = (next: Inspection) => {
    inspectionSerial.current++;
    setError('');
    setInspection(next);
  };
  const care =
    inspection?.type === 'care'
      ? model.choices.find((choice) => choice.id === inspection.kind)
      : undefined;
  const lockReason = activityUnavailable(state, w);
  const reason =
    inspection?.type === 'care'
      ? activityUnavailable(state, { id: w.id, revision: inspection.revision })
      : lockReason;
  const selected =
    model.academy?.players.find(({ player }) => player.id === prospect) ??
    model.academy?.players[0];
  const reviewed =
    inspection?.type === 'academy'
      ? model.academy?.players.find(({ player }) => player.id === inspection.player)
      : undefined;
  const reviewedGroup = model.academy?.groups.find((group) => group.key === reviewed?.group);
  const trainingErrorTarget =
    inspection?.type === 'training' && error ? activeDialogSurface() : undefined;
  const submitCare = async () => {
    if (!care?.command || care.unavailable || reason || sending) return;
    setSending(true);
    try {
      const reply = await scoped.command(care.command);
      if (reply?.ok && mounted.current) close();
    } finally {
      if (mounted.current) setSending(false);
    }
  };
  return (
    <section
      className={s.panel}
      aria-label="이 장소에서 할 일"
      data-testid={`place-activities-${place}`}
    >
      <ul className={s.facts} aria-label="현재 상태">
        {model.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {lockReason && <p className={s.note}>{lockReason}</p>}
      <ul className={s.choices}>
        {model.choices.map((choice) => (
          <li key={choice.id}>
            <div>
              <b>{choice.label}</b>
              <small>
                {choice.by} 실행 · 비용 {choice.cost}
              </small>
              <p>{choice.effect}</p>
              {choice.chances && (
                <ul className={s.chances} aria-label={`${choice.label} 결과 확률`}>
                  {choice.chances.map((chance) => (
                    <li key={chance.text}>
                      {chance.chance}% · {chance.text}
                    </li>
                  ))}
                </ul>
              )}
              {choice.unavailable && <p className={s.note}>{choice.unavailable}</p>}
            </div>
            <button
              type="button"
              onClick={() =>
                inspect({ type: 'care', kind: choice.care!.kind, revision: w.revision })
              }
            >
              {choice.label} 검토
            </button>
          </li>
        ))}
        {place !== 'manager' && (
          <li>
            <div>
              <b>{model.training.role}에게 훈련 제안·강행</b>
              <p>
                {model.training.member} 결정 · 다음 라운드 정산부터 {model.training.duration}라운드
                유지
              </p>
              <small>
                제안은 거절될 수 있고 재제안 기회를 소모해요.
                {model.training.wait > 0 ? ` 재제안 ${model.training.wait}라운드 후.` : ''} 강행 시
                사임 확률 {Math.round(model.training.risk * 100)}% · 공석이 생길 수 있어요.
              </small>
              {place === 'academy' ? (
                <ul className={s.chances} aria-label="유소년 훈련의 성장 교환">
                  {Object.entries(model.training.youthFocuses).map(([key, focus]) => (
                    <li key={key}>
                      {focus.label} · {focus.description} · U-17 ×{focus.growth.u17} / U-19 ×
                      {focus.growth.u19} / U-21 ×{focus.growth.u21}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>
                  회복은 성장 기회를 줄이고, 하드는 피로·부상·분위기 부담을 늘려요. 비교 후
                  제안하세요.
                </small>
              )}
              {model.training.unavailable && <p className={s.note}>{model.training.unavailable}</p>}
            </div>
            <button type="button" onClick={() => inspect({ type: 'training' })}>
              훈련 조건 검토
            </button>
          </li>
        )}
        {model.academy && (
          <li>
            <div>
              <b>유소년 승격·방출</b>
              <p>
                구단주 직접 결정 가능 ·{' '}
                {model.academy.delegated ? '유스 디렉터가 자동 판단 중' : '구단주 보고받기'} · 결정
                즉시 반영
              </p>
              <small>
                승격하면 아카데미 성장 대신 1군 훈련을 받고 시장 급여의 첫 프로 계약을 맺어요.
                방출하면 이 선수의 남은 육성 기회를 잃어요.
              </small>
              <Select
                aria-label="검토할 유망주"
                value={selected?.player.id ?? ''}
                onValueChange={setProspect}
                disabled={!selected}
              >
                {!selected && <option value="">승격·방출할 유망주 없음</option>}
                {model.academy.players.map((one) => (
                  <option key={one.player.id} value={one.player.id}>
                    {one.player.name} · {one.age}세 · OVR {one.overall} / POT {one.potential} ·{' '}
                    {one.label}
                  </option>
                ))}
              </Select>
              {selected && (
                <p>
                  승격 후 연봉{' '}
                  <Money value={selected.promotionWage} code={club.country} year={w.year} /> · 계약
                  종료 {w.year + 3}년
                </p>
              )}
              {!selected && (
                <p className={s.note}>아카데미가 비어 있어요. 다음 유소년 입단을 기다려 주세요.</p>
              )}
            </div>
            <button
              type="button"
              disabled={!selected}
              onClick={() => selected && inspect({ type: 'academy', player: selected.player.id })}
            >
              승격·방출 조건 검토
            </button>
          </li>
        )}
      </ul>
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
          <p>아직 이 장소의 요청 기록이 없어요.</p>
        )}
      </div>
      {care?.care && (
        <Dialog label={`${care.label} 검토`} onClose={close}>
          <p>
            {care.by} 실행 · {care.effect}
          </p>
          {care.chances?.map((chance) => (
            <p key={chance.text}>
              {chance.chance}% · {chance.text}
            </p>
          ))}
          <p>
            즉시 비용 <Money value={care.care.cost} code={club.country} year={w.year} />
          </p>
          {BigInt(care.care.perWin) > 0n && (
            <p>
              승리마다 지급 <Money value={care.care.perWin} code={club.country} year={w.year} /> ·
              자금 부족이어도 지급 의무가 남아요.
            </p>
          )}
          {BigInt(care.care.income) > 0n && (
            <p>
              수입 <Money value={care.care.income} code={club.country} year={w.year} />
            </p>
          )}
          {(care.unavailable || reason || error) && (
            <p role="status">{care.unavailable || reason || error}</p>
          )}
          <div className={s.actions}>
            <button type="button" onClick={close}>
              취소
            </button>
            {inspection?.type === 'care' && inspection.revision !== w.revision && (
              <button
                type="button"
                onClick={() => inspect({ ...inspection, revision: w.revision })}
              >
                최신 조건 다시 보기
              </button>
            )}
            <button
              type="button"
              data-ui="primary"
              disabled={sending || !!reason || !!care.unavailable}
              onClick={() => void submitCare()}
            >
              요청하기
            </button>
          </div>
        </Dialog>
      )}
      {inspection?.type === 'training' && (
        <TrainingOrderSheet w={w} client={scoped} coach={model.training.coach} onClose={close} />
      )}
      {trainingErrorTarget &&
        createPortal(
          <p role="alert" className={s.note}>
            {error}
          </p>,
          trainingErrorTarget,
        )}
      {inspection?.type === 'academy' && (
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
