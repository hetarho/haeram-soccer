import type { World } from '../../../../packages/contracts/src/types';
import {
  academySummary,
  PROMOTION_AGE,
  RELEASE_AGE,
} from '../../../../packages/engine/src/academy';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import { POLICY_DEFAULTS, POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { DecisionOwner } from './DecisionOwner';
import { OvrBadge } from './OvrBadge';
import { openBusiness } from './state';
import s from './TrainingView.module.css';

function useActing() {
  return useGameState((state) => !!state.pendingActions || state.readonly || !!state.error);
}

function Meter({ value }: { value: number }) {
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/**
 * 유소년 (→WEB-70): the academy's prospects grow here until promoted or released (→CLUB-16), by
 * the owner or, with its switch on, by the youth director's rule (→STAFF-13). The academy
 * investment and youth policy are set in 운영 전략 and only named here (→WEB-71).
 */
export function AcademyPanel({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const summary = academySummary(w);
  const today = currentDay(w);
  const director = w.staff?.find((member) => member.role === 'youth');
  const nextIntake =
    summary.intakeDone || today > summary.intakeDay
      ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
      : `${seasonDayLabel(w.year, summary.intakeDay)} · D-${summary.intakeDay - today}`;
  const investment =
    POLICY_INFO.academy.levels[(policyOf(w).academy ?? POLICY_DEFAULTS.academy) - 1].name;
  return (
    <div className={s.stack}>
      <section className={s.card} aria-label="유소년 아카데미">
        <header className={s.head}>
          <h3>유소년 아카데미</h3>
          <span>
            {summary.players.length}/{summary.capacity}명 · 1군 자리 {summary.room}
          </span>
        </header>
        <p className={s.intake} data-testid="academy-intake">
          다음 입단 <b>{nextIntake}</b> · 예상 {summary.nextIntakeSize}명
        </p>
        {summary.players.length ? (
          <ul className={s.prospects}>
            {summary.players.map(({ player: p, overall, potential, age, readiness, label }) => (
              <li key={p.id}>
                <OvrBadge value={overall} role={p.role} potential={potential} />
                <div className={s.prospectText}>
                  <b>{p.name}</b>
                  <small>{age}세</small>
                  <Meter value={(overall / Math.max(1, potential)) * 100} />
                  <small className={readiness === 'ready' ? s.ready : undefined}>{label}</small>
                </div>
                <div className={s.prospectActions}>
                  <button
                    type="button"
                    className={readiness === 'ready' ? s.primary : undefined}
                    aria-label={`${p.name} 1군 승격`}
                    disabled={acting || summary.room === 0}
                    onClick={() => void client.command({ type: 'promote-youth', id: p.id })}
                  >
                    1군 승격
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} 방출`}
                    disabled={acting}
                    onClick={() => void client.command({ type: 'release-youth', id: p.id })}
                  >
                    방출
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.note}>아직 아카데미 선수가 없어요. 매년 3월 15일에 유소년이 입단해요.</p>
        )}
        {summary.room === 0 && <p className={s.note}>1군이 26명으로 가득 차 승격할 수 없어요.</p>}
      </section>
      <section className={s.card} aria-label="유소년 위임">
        <header className={s.head}>
          <h3>유스 디렉터</h3>
          <span>
            {director ? `${director.name} · 능력 ${Math.round(director.ability)}` : '공석'}
          </span>
        </header>
        <div className={s.delegate}>
          <DecisionOwner
            w={w}
            decision="academy"
            plain
            auto="시즌이 끝날 때 유스 디렉터가 이 기준으로 승격과 방출을 정하고 소식함에 보고해요."
            owner="시즌이 끝날 때 유스 디렉터가 이 기준으로 승격 추천과 방출 검토를 보고하고, 결정은 직접 해요."
          />
          <ul className={s.rule}>
            <li>
              <b>승격</b>
              <span>
                {PROMOTION_AGE}세 이상이고 같은 포지션 1군 최하위나 주전 평균 −10에 이르면, 1군과 그
                포지션에 자리가 있을 때
              </span>
            </li>
            <li>
              <b>방출</b>
              <span>{RELEASE_AGE}세까지 1군 수준에 이르지 못한 유망주</span>
            </li>
            <li>
              <b>보류</b>
              <span>운영자금이 1년 운영비보다 적으면 승격을 미루고 보고</span>
            </li>
          </ul>
        </div>
      </section>
      <button type="button" className={s.homeLine} onClick={() => openBusiness('strategy')}>
        <span>
          <b>유소년 투자 · 유스 정책은 운영 전략에서</b>
          <small>
            유소년 투자 {investment} · 유스 정책 {cardOf(buildOf(w), 'youth').label}
          </small>
        </span>
        <span className={s.chevron} aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  );
}
