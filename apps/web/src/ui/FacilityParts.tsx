import { useFacilityRequest } from './state';
import { useEffect } from 'react';
import type { FacilityPart, World } from '../../../../packages/contracts/src/types';
import {
  ACADEMY_FACILITY,
  FACILITY_PART_LABEL,
  facilityWork,
  MAX_LEVEL,
  partLevel,
  STADIUM_STEPS,
  TRAINING_GROUND,
  WORK_INFO,
} from '../../../../packages/engine/src/facilities';
import { gateProjection } from '../../../../packages/engine/src/finance';
import { FacilityArt } from './FacilityArt';
import { number } from './format';
import s from './BusinessWorkbench.module.css';
import f from './FacilityParts.module.css';

/** What one level of a part does, in the owner's words (→ECON-32). */
function levelEffect(part: FacilityPart, level: number) {
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return `선수 성장 ×${terms.growth} · 추가 피로 회복 +${terms.recoveryBonus} · 협상 호감 +${terms.goodwill}%`;
  }
  const terms = ACADEMY_FACILITY[level];
  return `입단 +${terms.intake}명 · 잠재력 +${terms.potential} · 유소년 성장 ×${terms.growth}`;
}

/**
 * 재정·투자's facilities (→WEB-14, ECON-32): the three parts as they stand, each with its art — the
 * stadium's ladder of expansions and rebuilds with seats against demand, then the training ground
 * and the academy facilities by level — and any work already under way, which finishes as
 * scheduled. No career starts a work, so nothing here builds.
 */
export function FacilityParts({ w }: { w: World }) {
  const request = useFacilityRequest((store) => store.request);
  useEffect(() => {
    if (!request) return;
    useFacilityRequest.getState().take();
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(`[data-testid="facility-${request}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [request]);
  const gate = gateProjection(w);
  const work = (part: FacilityPart) => {
    const running = facilityWork(w, part);
    return running ? (
      <p data-ui="notice" data-tone="warm" className={f.work} data-testid={`facility-work-${part}`}>
        공사 중 · {part === 'stadium' ? STADIUM_STEPS[running.to].name : `${running.to}단계`} ·
        완공까지 {running.left}일
      </p>
    ) : null;
  };
  return (
    <div className={f.parts}>
      <section
        data-surface="panel"
        className={f.part}
        aria-label="경기장"
        data-testid="facility-stadium"
      >
        <FacilityArt kind="stadium" world={w} view="exterior" className={f.art} />
        <div className={f.body}>
          <div className={s.panelHeading}>
            <div>
              <h3>경기장 · {STADIUM_STEPS[w.stadium].name}</h3>
              <p>{number(STADIUM_STEPS[w.stadium].capacity)}석</p>
            </div>
          </div>
          <ol data-ui="facility-steps" className={f.ladder} aria-label="경기장 단계" tabIndex={0}>
            {STADIUM_STEPS.map((step, index) => (
              <li
                key={step.name}
                data-ui="facility-step"
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
                <small>{step.work ? WORK_INFO[step.work].label : '기본'}</small>
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
        </div>
      </section>
      {(['training', 'academy'] as const).map((part) => (
        <section
          data-surface="panel"
          key={part}
          className={f.part}
          aria-label={FACILITY_PART_LABEL[part]}
          data-testid={`facility-${part}`}
        >
          <FacilityArt kind={part} world={w} className={f.art} />
          <div className={f.body}>
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
                  <b
                    data-ui="level-mark"
                    data-state={level <= partLevel(w, part) ? 'built' : undefined}
                  >
                    {level}
                  </b>
                  <small>{levelEffect(part, level)}</small>
                </li>
              ))}
            </ol>
            {work(part)}
          </div>
        </section>
      ))}
    </div>
  );
}
