import type { World } from '../../../../packages/contracts/src/types';
import { academySummary } from '../../../../packages/engine/src/academy';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { OvrBadge } from './OvrBadge';
import s from './ClubStaff.module.css';

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

/** The youth academy: prospects grow here until promoted to the first team. */
export function AcademyPanel({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const summary = academySummary(w);
  const today = currentDay(w);
  const director = w.staff?.find((member) => member.role === 'youth');
  const nextIntake =
    summary.intakeDone || today > summary.intakeDay
      ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
      : `${seasonDayLabel(w.year, summary.intakeDay)} · D-${summary.intakeDay - today}`;
  return (
    <section className={s.academy} aria-label="유소년 아카데미">
      <header>
        <h3>유소년 아카데미</h3>
        <span>
          {summary.players.length}/{summary.capacity}명 · 유스 디렉터{' '}
          {director ? `${director.name} (능력 ${Math.round(director.ability)})` : '공석'}
        </span>
      </header>
      <p className={s.note}>
        다음 입단 {nextIntake} · 예상 {summary.nextIntakeSize}명
        {summary.delegated
          ? ' · 승격과 방출은 유스 디렉터가 시즌 끝에 결정해요'
          : ' · 승격과 방출은 구단주가 직접 결정해요'}
      </p>
      {summary.players.length ? (
        <ul>
          {summary.players.map(({ player: p, overall, potential, age, readiness, label }) => (
            <li key={p.id}>
              <OvrBadge value={overall} role={p.role} />
              <div>
                <b>{p.name}</b>
                <small>
                  {age}세 · 잠재력 {potential}
                </small>
                <Meter value={(overall / Math.max(1, potential)) * 100} />
                <small className={readiness === 'ready' ? s.ready : undefined}>{label}</small>
              </div>
              <div className={s.youthActions}>
                <button
                  className={s.primary}
                  disabled={acting || summary.room === 0}
                  onClick={() => void client.command({ type: 'promote-youth', id: p.id })}
                >
                  1군 승격
                </button>
                <button
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
        <p className={s.empty}>아직 아카데미 선수가 없어요. 매년 3월 15일에 유소년이 입단해요.</p>
      )}
      {summary.room === 0 && <p className={s.note}>1군이 26명으로 가득 차 승격할 수 없어요.</p>}
    </section>
  );
}
