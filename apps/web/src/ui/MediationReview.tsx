import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  RecruitmentMediation,
  ReinforcementPromise,
  MediationSupport,
  World,
  CareerDate,
} from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { directionOption } from '../../../../packages/engine/src/direction';
import { requestLabel } from '../../../../packages/engine/src/signings';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import { Dialog } from './Dialog';
import { Money } from './Money';
import { openDirection } from './state';
import s from './MediationReview.module.css';
const date = (at: CareerDate) =>
  new Date(Date.UTC(at.year, 7, 1) + at.day * 86400000).toISOString().slice(0, 10);
const labels: Record<MediationSupport, string> = {
  director: '단장 우선',
  balanced: '균형',
  manager: '감독 우선',
};
const status: Record<ReinforcementPromise['status'], string> = {
  pending: '이행 대기',
  fulfilled: '이행 완료',
  unfulfilled: '미이행',
  cancelled: '취소',
};
export function MediationReview({
  record,
  w,
  client,
  onClose,
}: {
  record: RecruitmentMediation;
  w: World;
  client: GameClient;
  onClose: () => void;
}) {
  const [support, setSupport] = useState<MediationSupport>(
    directionOption(w, 'recruitmentSupport').id as MediationSupport,
  );
  const [checked, setChecked] = useState<{
      id: string;
      support: MediationSupport;
      revision: number;
      value: Awaited<ReturnType<GameClient['mediationPreview']>>;
    }>(),
    [error, setError] = useState<string>();
  const disabled = useGameState((state) => state.busy || state.readonly || !!state.pendingActions),
    readonly = useGameState((state) => state.readonly);
  const preview = checked?.id === record.id ? checked.value : undefined;
  const ready =
    checked?.id === record.id && checked.support === support && checked.revision === w.revision;
  const previewElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = previewElement.current;
    // Keep the occupied space when a new choice has fewer result rows.
    if (element && preview) element.style.minHeight = getComputedStyle(element).height;
  }, [preview]);
  useEffect(() => {
    let current = true;
    setError(undefined);
    void client.mediationPreview(record.id, support).then(
      (value) => {
        if (current) setChecked({ id: record.id, support, revision: w.revision, value });
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [client, record.id, support, w.revision]);
  const cash = (value: string) => (
    <Money value={value} code={w.clubs.find((c) => c.id === w.playerClub)!.country} year={w.year} />
  );
  return (
    <Dialog label="영입 중재 검토" onClose={onClose}>
      <div className={s.review}>
        <h2>단장·감독 영입 중재</h2>
        <h3>{record.manager.name} 감독의 요청</h3>
        <p>{record.managerReason}</p>
        <h3>{record.director.name} 단장의 재정 판단</h3>
        <p>{record.directorReason}</p>
        <p>
          보강 대상 {requestLabel(record.target)} · 지명 후보 {record.candidate.name}
        </p>
        <p>평소 지원 방침: {directionOption(w, 'recruitmentSupport').name}</p>
        <button onClick={() => openDirection('scouting')}>영입 지원 방침 편집</button>
        <fieldset disabled={disabled}>
          <legend>이번 중재에만 적용할 선택</legend>
          {(Object.keys(labels) as MediationSupport[]).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="mediation-support"
                checked={support === value}
                onChange={() => setSupport(value)}
              />
              {labels[value]}
            </label>
          ))}
        </fieldset>
        <p>이번 선택은 평소 지원 방침을 바꾸지 않아요. 실제 영입과 보강 약속은 별개의 결과예요.</p>
        <div ref={previewElement} aria-label="이번 중재 결과 미리보기" aria-busy={!ready && !error}>
          {preview && (
            <>
              <p>{preview.result}</p>
              {preview.offer && (
                <p>
                  영입 제안금 {cash(preview.offer.fee)} · 선수 연봉 {cash(preview.offer.wage)} ·{' '}
                  {preview.offer.kind === 'bid' ? '협상 응답 대기' : '자유계약 영입'}
                </p>
              )}
              <p>즉시 지출 {cash(preview.immediateSpend)}</p>
              {preview.promise && (
                <p>
                  보강 약속: {requestLabel(preview.promise.target)} · 마감{' '}
                  {date(preview.promise.deadline)}
                </p>
              )}
            </>
          )}
        </div>
        <p
          role={error ? 'alert' : 'status'}
          className={preview && !error ? s.previewStatus : undefined}
          style={{ visibility: ready && !error ? 'hidden' : undefined }}
        >
          {error
            ? `조건을 확인할 수 없어요. ${error} 다시 열어 최신 조건을 확인해 주세요.`
            : '선택한 조건을 확인하는 중이에요.'}
        </p>
        {disabled && (
          <p>{readonly ? '읽기 전용 기록이에요.' : '다른 처리를 마친 뒤 결정할 수 있어요.'}</p>
        )}
        <button
          disabled={disabled || !ready || !!error || record.status !== 'pending'}
          onClick={async () => {
            if (!ready || disabled || error || record.status !== 'pending') return;
            try {
              const reply = await client.command({
                type: 'resolve-mediation',
                id: record.id,
                support,
              });
              if (reply?.ok) onClose();
              else setError(reply?.error ?? '조건이 바뀌었어요.');
            } catch (reason) {
              setError(String(reason));
            }
          }}
        >
          이번 중재 결정 확정
        </button>
        <button onClick={onClose}>닫기</button>
      </div>
    </Dialog>
  );
}
export function MediationButton({
  record,
  w,
  client,
}: {
  record: RecruitmentMediation;
  w: World;
  client: GameClient;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>영입 중재 검토</button>
      {open && (
        <MediationReview record={record} w={w} client={client} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function PromiseCard({ promise }: { promise: ReinforcementPromise }) {
  return (
    <article className={s.card}>
      <h4>
        {requestLabel(promise.target)} · {status[promise.status]}
      </h4>
      <p>
        {promise.manager.name} 감독 · 약속 {date(promise.created)} · 마감 {date(promise.deadline)}
      </p>
      {promise.reason && <p>{promise.reason}</p>}
      {promise.reaction && <p>{promise.reaction}</p>}
    </article>
  );
}
export function RecruitmentCommitments({ w, client }: { w: World; client: GameClient }) {
  const [open, setOpen] = useState(false),
    [history, setHistory] = useState<Awaited<ReturnType<GameClient['recruitmentHistory']>>>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    setHistory(undefined);
    setError(undefined);
    void client.recruitmentHistory().then(
      (value) => {
        if (current) setHistory(value);
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [open, client]);
  return (
    <section className={s.review} aria-label="영입 중재와 보강 약속">
      <h3>영입 중재와 보강 약속</h3>
      {w.mediations
        ?.filter((m) => m.status === 'pending')
        .map((record) => (
          <div key={record.id}>
            <p>
              {record.manager.name} 감독 · {requestLabel(record.target)}
            </p>
            {!isDelegated(w, 'recruitment') && (
              <MediationButton record={record} w={w} client={client} />
            )}
          </div>
        ))}
      {w.promises?.map((p) => (
        <PromiseCard key={p.id} promise={p} />
      ))}
      <button onClick={() => setOpen(true)}>전체 영입 결정 기록</button>
      {open && (
        <Dialog label="영입 결정 기록" onClose={() => setOpen(false)}>
          {error ? (
            <p role="status">기록을 불러올 수 없어요. {error}</p>
          ) : !history ? (
            <p role="status">기록을 불러오는 중이에요.</p>
          ) : (
            <>
              {history.mediations.map((m) => (
                <article className={s.card} key={m.id}>
                  <h3>
                    {m.manager.name} 감독 · {m.director.name} 단장
                  </h3>
                  <p>{m.managerReason}</p>
                  <p>{m.directorReason}</p>
                  <p>
                    당시 지원 방침 {labels[m.support]} ·{' '}
                    {m.resolution
                      ? `${labels[m.resolution.support]} 결정: ${m.resolution.result}`
                      : '미결정'}
                  </p>
                </article>
              ))}
              {history.promises.map((p) => (
                <PromiseCard key={p.id} promise={p} />
              ))}
            </>
          )}
          <button onClick={() => setOpen(false)}>닫기</button>
        </Dialog>
      )}
    </section>
  );
}
