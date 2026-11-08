import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useFacilityRequest } from '../../../shared/routing/state';
import { useEffect } from 'react';
import type { FacilityPart, World } from '../../../../../../packages/contracts/src/types';
import {
  ACADEMY_FACILITY,
  FACILITY_PART_LABEL,
  facilityWork,
  MAX_LEVEL,
  partLevel,
  STADIUM_STEPS,
  TRAINING_GROUND,
  WORK_INFO,
} from '../../../../../../packages/engine/src/facilities';
import { gateProjection } from '../../../../../../packages/engine/src/finance';
import { FacilityArt } from '../../../entities/office';
import { number } from '../../../presentation/format';
import s from './BusinessWorkbench.module.css';
import f from './FacilityParts.module.css';

/** What one level of a part does, in the owner's words (→ECON-32). */
function levelEffect(part: FacilityPart, level: number) {
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return sourceMessage('copy.FacilityParts.22f747ccff', {
      p0: terms.growth,
      p1: terms.recoveryBonus,
      p2: terms.goodwill,
    });
  }
  const terms = ACADEMY_FACILITY[level];
  return sourceMessage('copy.FacilityParts.b9bdab5e1d', {
    p0: terms.intake,
    p1: terms.potential,
    p2: terms.growth,
  });
}

/**
 * 재정·투자's facilities (→WEB-14, ECON-32): the three parts as they stand, each with its art — the
 * stadium's ladder of expansions and rebuilds with seats against demand, then the training ground
 * and the academy facilities by level — and any work already under way, which finishes as
 * scheduled. No career starts a work, so nothing here builds.
 */
export function FacilityParts({ w }: { w: World }) {
  useTextLocale();
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
        {richMessage('copy.FacilityParts.90d32b1539', {
          p0:
            part === 'stadium'
              ? STADIUM_STEPS[running.to].name
              : sourceMessage('copy.FacilityParts.bda7274853', { p0: running.to }),
          p1: running.left,
        })}
      </p>
    ) : null;
  };
  return (
    <div className={f.parts}>
      <section
        data-surface="panel"
        className={f.part}
        aria-label={displayMessage('copy.ClubOperations.64779ec1ad')}
        data-testid="facility-stadium"
      >
        <FacilityArt kind="stadium" world={w} view="exterior" className={f.art} />
        <div className={f.body}>
          <div className={s.panelHeading}>
            <div>
              <h3>
                {richMessage('copy.FacilityParts.2cc50918f0', {
                  p0: STADIUM_STEPS[w.stadium].name,
                })}
              </h3>
              <p>
                {richMessage('copy.ClubOperations.e718a2e7a8', {
                  p0: number(STADIUM_STEPS[w.stadium].capacity),
                })}
              </p>
            </div>
          </div>
          <ol
            data-ui="facility-steps"
            className={f.ladder}
            aria-label={displayMessage('copy.FacilityParts.614d34bc36')}
            tabIndex={0}
          >
            {localizeValue(
              STADIUM_STEPS.map((step, index) => (
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
                  <b>{localizeValue(number(step.capacity))}</b>
                  <small>
                    {localizeValue(
                      step.work
                        ? WORK_INFO[step.work].label
                        : sourceMessage('copy.FacilityParts.3603b45811'),
                    )}
                  </small>
                </li>
              )),
            )}
          </ol>
          <div className={s.metrics}>
            <div>
              <span>{richMessage('copy.FacilityParts.67973119a4')}</span>
              <b>
                {richMessage('copy.ClubSettingControl.af70cdc2c5', {
                  p0: number(gate.attendanceLow),
                  p1: number(gate.attendanceHigh),
                })}
              </b>
            </div>
            <div>
              <span>{richMessage('copy.FacilityParts.f2efd0b8d9')}</span>
              <b>{richMessage('copy.CareerRecordBook.e414915261', { p0: number(gate.wanted) })}</b>
            </div>
          </div>
          {localizeValue(work('stadium'))}
        </div>
      </section>
      {localizeValue(
        (['training', 'academy'] as const).map((part) => (
          <section
            data-surface="panel"
            key={part}
            className={f.part}
            aria-label={localizeValue(FACILITY_PART_LABEL[part])}
            data-testid={`facility-${part}`}
          >
            <FacilityArt kind={part} world={w} className={f.art} />
            <div className={f.body}>
              <div className={s.panelHeading}>
                <div>
                  <h3>
                    {richMessage('copy.FacilityParts.d4747d87b8', {
                      p0: FACILITY_PART_LABEL[part],
                      p1: partLevel(w, part),
                      p2: MAX_LEVEL,
                    })}
                  </h3>
                  <p>{localizeValue(levelEffect(part, partLevel(w, part)))}</p>
                </div>
              </div>
              <ol
                className={f.levels}
                aria-label={displayMessage('copy.FacilityParts.41e08adcea', {
                  p0: FACILITY_PART_LABEL[part],
                })}
              >
                {localizeValue(
                  Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((level) => (
                    <li key={level} data-built={level <= partLevel(w, part) || undefined}>
                      <b
                        data-ui="level-mark"
                        data-state={level <= partLevel(w, part) ? 'built' : undefined}
                      >
                        {localizeValue(level)}
                      </b>
                      <small>{localizeValue(levelEffect(part, level))}</small>
                    </li>
                  )),
                )}
              </ol>
              {localizeValue(work(part))}
            </div>
          </section>
        )),
      )}
    </div>
  );
}
