import { useState, type ReactNode } from 'react';
import type { Command, FacilityPart, World } from '../../../../packages/contracts/src/types';
import {
  ACADEMY_FACILITY,
  FACILITY_PART_LABEL,
  FACILITY_PARTS,
  facilityWork,
  MAX_LEVEL,
  partLevel,
  STADIUM_STEPS,
  TRAINING_GROUND,
  WORK_INFO,
} from '../../../../packages/engine/src/facilities';
import { gateProjection } from '../../../../packages/engine/src/finance';
import { facilityInvestmentPreview } from '../../../../packages/engine/src/investment';
import { Dialog } from './Dialog';
import { number } from './format';
import s from './BusinessWorkbench.module.css';
import f from './FacilityParts.module.css';

const runway = (rounds: number) => (rounds >= 999 ? '999라운드 이상' : `${rounds}라운드`);
/** What one level of a part does, in the owner's words (→ECON-32). */
function levelEffect(part: FacilityPart, level: number) {
  if (part === 'training') return `선수 성장 기반 +${TRAINING_GROUND[level].base}`;
  const terms = ACADEMY_FACILITY[level];
  return `입단 +${terms.intake}명 · 잠재력 +${terms.potential} · 유소년 성장 ×${terms.growth}`;
}

/**
 * 운영 › 시설 (→WEB-39, ECON-32): the three parts built separately — the stadium's ladder of
 * expansions and rebuilds with seats against demand, then the training ground and the academy
 * facilities by level — each with its next work, any work in progress and a review before it
 * starts.
 */
export function FacilityParts({
  w,
  blocked,
  act,
  format,
}: {
  w: World;
  blocked: boolean;
  act: (command: Command, success: string) => Promise<boolean>;
  format: (value: string) => ReactNode;
}) {
  const [review, setReview] = useState<FacilityPart>();
  const gate = gateProjection(w);
  const preview = (part: FacilityPart) => facilityInvestmentPreview(w, part);
  const work = (part: FacilityPart) => {
    const running = facilityWork(w, part);
    return running ? (
      <p className={f.work} data-testid={`facility-work-${part}`}>
        공사 중 · {part === 'stadium' ? STADIUM_STEPS[running.to].name : `${running.to}단계`} ·
        완공까지 {running.left}일
      </p>
    ) : null;
  };
  const next = (part: FacilityPart) => {
    const p = preview(part);
    if (!p.next) return <p className={s.note}>{FACILITY_PART_LABEL[part]}은(는) 최고 단계예요.</p>;
    return (
      <>
        <div className={s.metrics}>
          <div>
            <span>다음 공사</span>
            <b>{p.next.label}</b>
          </div>
          <div>
            <span>공사비 · 기간</span>
            <b>
              {format(p.next.cost)} · {p.next.days}일
            </b>
          </div>
        </div>
        <button
          type="button"
          className={s.primary}
          disabled={blocked || !p.eligible || !p.affordable}
          onClick={(event) => {
            event.currentTarget.focus();
            setReview(part);
          }}
        >
          {FACILITY_PART_LABEL[part]} 공사 검토
        </button>
        {!p.eligible || !p.affordable ? <p className={s.note}>{p.reason}</p> : null}
      </>
    );
  };
  const reviewed = review ? preview(review) : undefined;
  return (
    <>
      <section className={f.part} aria-label="경기장" data-testid="facility-stadium">
        <div className={s.panelHeading}>
          <div>
            <h3>경기장 · {STADIUM_STEPS[w.stadium].name}</h3>
            <p>
              {number(STADIUM_STEPS[w.stadium].capacity)}석 · 증축은 공사 중 관중석 10% 폐쇄,
              재건축은 새 구장이 열릴 때까지 지금 구장을 그대로 써요.
            </p>
          </div>
        </div>
        <ol className={f.ladder} aria-label="경기장 단계">
          {STADIUM_STEPS.map((step, index) => (
            <li
              key={step.name}
              data-state={
                index < w.stadium
                  ? 'built'
                  : index === w.stadium
                    ? 'current'
                    : w.facilityWorks?.stadium?.to === index
                      ? 'building'
                      : undefined
              }
              data-testid={`stadium-step-${index}`}
            >
              <b>{number(step.capacity)}</b>
              <small>{step.work ? WORK_INFO[step.work].label : '창단'}</small>
            </li>
          ))}
        </ol>
        <div className={s.metrics}>
          <div>
            <span>홈 관중 예상</span>
            <b>
              {number(gate.attendanceLow)}–{number(gate.attendanceHigh)}명
            </b>
          </div>
          <div>
            <span>좌석이 충분하면 올 관중</span>
            <b>{number(gate.wanted)}명</b>
          </div>
        </div>
        {work('stadium')}
        {next('stadium')}
      </section>
      {(['training', 'academy'] as const).map((part) => (
        <section
          key={part}
          className={f.part}
          aria-label={FACILITY_PART_LABEL[part]}
          data-testid={`facility-${part}`}
        >
          <div className={s.panelHeading}>
            <div>
              <h3>
                {FACILITY_PART_LABEL[part]} · {partLevel(w, part)}/{MAX_LEVEL}단계
              </h3>
              <p>{levelEffect(part, partLevel(w, part))}</p>
            </div>
          </div>
          <ol className={f.levels} aria-label={`${FACILITY_PART_LABEL[part]} 단계별 효과`}>
            {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((level) => (
              <li key={level} data-built={level <= partLevel(w, part) || undefined}>
                <b>{level}</b>
                <small>{levelEffect(part, level)}</small>
              </li>
            ))}
          </ol>
          {work(part)}
          {next(part)}
        </section>
      ))}
      {review && reviewed?.next ? (
        <Dialog
          label={`${FACILITY_PART_LABEL[review]} 공사 확인`}
          onClose={() => setReview(undefined)}
          actions={
            <div className={s.reviewActions}>
              <button onClick={() => setReview(undefined)}>취소</button>
              <button
                className={s.primary}
                disabled={blocked || !reviewed.eligible || !reviewed.affordable}
                onClick={async () => {
                  if (
                    await act(
                      { type: 'facility', part: review },
                      `${FACILITY_PART_LABEL[review]} 공사를 시작했어요 · ${reviewed.next!.days}일 뒤 완공`,
                    )
                  )
                    setReview(undefined);
                }}
              >
                공사 시작
              </button>
            </div>
          }
        >
          <h3>{reviewed.next.label}</h3>
          <p className={s.note}>
            공사비는 지금 나가고, 완공되는 날부터 효과와 늘어난 유지비가 적용돼요.
          </p>
          <div className={s.metrics}>
            <div>
              <span>즉시 지출</span>
              <b>{format(reviewed.cost)}</b>
            </div>
            <div>
              <span>공사 후 자금</span>
              <b>{format(reviewed.cashAfter)}</b>
            </div>
            <div>
              <span>공사 기간</span>
              <b>{reviewed.next.days}일</b>
            </div>
            {review === 'stadium' ? (
              <div>
                <span>수용 인원 (지금 → 공사 중 → 완공)</span>
                <b>
                  {number(reviewed.capacityBefore)} → {number(reviewed.capacityDuring)} →{' '}
                  {number(reviewed.capacityAfter)}석
                </b>
              </div>
            ) : (
              <div>
                <span>완공 후 효과</span>
                <b>{levelEffect(review, reviewed.next.to)}</b>
              </div>
            )}
            <div>
              <span>연간 시설 유지비</span>
              <b>
                {format(reviewed.maintenanceBefore)} → {format(reviewed.maintenanceAfter)}
              </b>
            </div>
            <div>
              <span>새 연간 고정 지출</span>
              <b>{format(reviewed.annualAfter)}</b>
            </div>
            <div>
              <span>공사 후 고정 지출 여유</span>
              <b>{runway(reviewed.runwayRounds)}</b>
            </div>
          </div>
          <p className={s.note}>자금 여유에는 앞으로의 수입과 경기 개최비를 포함하지 않았어요.</p>
        </Dialog>
      ) : null}
    </>
  );
}

/** Every part's preview, for callers that need to know whether any work can start. */
export function anyFacilityWork(w: World) {
  return FACILITY_PARTS.some((part) => facilityInvestmentPreview(w, part).eligible);
}
