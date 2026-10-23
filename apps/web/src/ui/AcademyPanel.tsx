import { registrationRoom } from '../../../../packages/engine/src/registration';
import { useTaskState } from './taskMemory';
import { PlayerLink } from './PlayerSheet';
import type { World } from '../../../../packages/contracts/src/types';
import {
  academySummary,
  ACADEMY_LEAVE_AGE,
  YOUTH_FOCUS_INFO,
} from '../../../../packages/engine/src/academy';
import { LINE_LABEL, lineOf, POSITION_LABEL } from '../../../../packages/engine/src/player';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import { currentStepName } from './board';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { DecisionOwner } from './DecisionOwner';
import { DirectionLines } from './DirectionLines';
import { directionOption } from '../../../../packages/engine/src/direction';
import { OvrBadge } from './OvrBadge';
import {
  openDirection,
  openCoachSheet,
  openStaff,
  openFacility,
  usePlayerPreparation,
} from './state';
import { callLine } from './TrainingOrderSheet';
import s from './TrainingView.module.css';

function useActing() {
  return useGameState(gameActionsBlocked);
}

function Meter({ value }: { value: number }) {
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/**
 * 유소년 (→WEB-70): the academy's prospects by age group — U-17, U-19, U-21 — grow here until
 * promoted or released (→CLUB-16), by the owner or, when the level delegates it, by the youth
 * director's rule (→STAFF-13); the director sets the academy's training focus (→CLUB-31). The
 * academy investment and 유입 방식 are set in 방향 and only named here (→WEB-71).
 */
export function AcademyPanel({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const [promoted, setPromoted] = useTaskState<string | undefined>(
    w.id,
    'academy-promoted',
    undefined,
  );
  const arrived = w.players.find((person) => person.id === promoted && person.status === 'active');
  const summary = academySummary(w);
  const today = currentDay(w);
  const director = w.staff?.find((member) => member.role === 'youth');
  const nextIntake =
    summary.intakeDone || today > summary.intakeDay
      ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
      : `${seasonDayLabel(w.year, summary.intakeDay)} · D-${summary.intakeDay - today}`;
  const investment = currentStepName(w, 'academy');
  return (
    <div className={s.stack}>
      {arrived && (
        <section className={s.card} aria-label="승격한 선수 관리">
          <h3>1군에 합류했어요</h3>
          <PlayerLink id={arrived.id} name={arrived.name} />
          <div className={s.filters}>
            <button
              type="button"
              onClick={() => openCoachSheet('assistant', undefined, arrived.id)}
            >
              이 선수 훈련 보기
            </button>
            <button type="button" onClick={() => usePlayerPreparation.getState().open(arrived.id)}>
              다음 경기 선발·전술 준비
            </button>
          </div>
          <p className={s.timing}>
            감독이 능력과 피로를 보고 선발해요. 직접 선발을 정하는 것은 선택이에요.
          </p>
        </section>
      )}
      <section className={s.card} aria-label="유소년 아카데미">
        <header className={s.head}>
          <h3>유소년 아카데미</h3>
          <span>
            {summary.players.length}/{summary.capacity}명 · 1군 자리 {summary.room.total}
          </span>
        </header>
        <p className={s.intake} data-testid="academy-intake">
          다음 입단 <b>{nextIntake}</b> · 예상 {summary.nextIntakeSize}명
        </p>
        {summary.players.length ? (
          summary.groups.map((group) => (
            <section
              key={group.key}
              className={s.ageGroup}
              aria-label={`${group.label} ${group.ages}`}
              data-testid={`age-group-${group.key}`}
            >
              <header>
                <b>{group.label}</b>
                <small>
                  {group.ages} · {group.players.length}명 · 성장 ×{group.factor}
                </small>
              </header>
              {group.players.length > 0 && (
                <ul className={s.prospects}>
                  {group.players.map(({ player: p, overall, potential, age, readiness, label }) => (
                    <li key={p.id}>
                      <OvrBadge value={overall} role={p.position} potential={potential} />
                      <div className={s.prospectText}>
                        <b>{p.name}</b>
                        <small>
                          {age}세 · {POSITION_LABEL[p.position]} · {LINE_LABEL[lineOf(p.position)]}
                        </small>
                        <Meter value={(overall / Math.max(1, potential)) * 100} />
                        <small className={readiness === 'ready' ? s.ready : undefined}>
                          {label}
                        </small>
                      </div>
                      <div className={s.prospectActions}>
                        <button
                          type="button"
                          className={readiness === 'ready' ? s.primary : undefined}
                          aria-label={`${p.name} 1군 승격`}
                          disabled={
                            acting ||
                            !!registrationRoom(w, { ...p, graduate: true, joined: w.year }) ||
                            age < summary.promotionAge
                          }
                          title={
                            age < summary.promotionAge
                              ? `첫 프로 계약은 ${summary.promotionAge}세부터`
                              : undefined
                          }
                          onClick={() => {
                            void client
                              .command({ type: 'promote-youth', id: p.id })
                              .then((reply) => {
                                if (reply?.ok) setPromoted(p.id);
                              });
                          }}
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
              )}
            </section>
          ))
        ) : (
          <p className={s.note}>아직 아카데미 선수가 없어요. 매년 3월 15일에 유소년이 입단해요.</p>
        )}
        {summary.room.total === 0 && (
          <p className={s.note}>선수단의 전체 등록 한도가 가득 차 승격할 수 없어요.</p>
        )}
      </section>
      <YouthTraining w={w} />
      <section className={s.card} aria-label="유소년 운영">
        <header className={s.head}>
          <h3>아카데미 운영</h3>
        </header>
        <button type="button" className={s.homeLine} onClick={() => openDirection('youth')}>
          <span>
            <b>유소년 투자 · 유입 방식은 운영 방침에서</b>
            <small>
              지금 {investment} · {cardOf(buildOf(w), 'youth').label} · 반복 운영비와 다음 입단에
              반영
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className={s.homeLine} onClick={() => openStaff('youth')}>
          <span>
            <b>유스 디렉터 {director?.name ?? '공석'}</b>
            <small>담당자의 효과와 계약 · 선임·교체</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className={s.homeLine} onClick={() => openFacility('academy')}>
          <span>
            <b>유소년 시설 {w.academyFacility}단계 · 공사 보기</b>
            <small>투자 운영비와 별도로 공사비를 내고 완공 후 효과를 받아요</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
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
            auto="시즌이 끝날 때 유스 디렉터가 이 기준으로 승격과 방출을 정하고 알림·결정에 보고해요."
            owner="시즌이 끝날 때 유스 디렉터가 이 기준으로 승격 추천과 방출 검토를 보고하고, 결정은 직접 해요."
          />
          <DirectionLines w={w} rows={['youthGoal', 'debut', 'finance']} />
          <ul className={s.rule}>
            <li>
              <b>승격</b>
              <span>
                {summary.promotionAge}세(첫 프로 계약 나이) 이상이고 데뷔 시점이 정한 기준에 이르면,
                1군과 그 포지션에 자리가 있을 때 · {directionOption(w, 'debut').summary}
              </span>
            </li>
            <li>
              <b>방출</b>
              <span>
                {directionOption(w, 'youthGoal').summary} · 나머지는 {ACADEMY_LEAVE_AGE}세가 되면
                아카데미를 떠나요
              </span>
            </li>
            <li>
              <b>보류</b>
              <span>운영자금이 재정 기조가 정한 운영비보다 적으면 승격을 미루고 보고</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

/**
 * The academy's training focus the youth director sets (→CLUB-31): who set it and why, each
 * focus's effect by age group read only, and a line opening his card to suggest or force
 * (→STAFF-19).
 */
function YouthTraining({ w }: { w: World }) {
  const call = callLine(w, 'youth'),
    focus = academySummary(w).focus;
  return (
    <section className={s.card} aria-label="유소년 훈련 방향">
      <header className={s.head}>
        <h3>유소년 훈련 방향</h3>
        <span data-testid="youth-focus">
          지금 {call.focus} · {call.by}
        </span>
      </header>
      <p className={s.advice}>{call.reason}</p>
      <button type="button" className={s.homeLine} onClick={() => openCoachSheet('youth')}>
        <span>
          <b>유스 디렉터에게 훈련 제안·강행</b>
          <small>받아들이면 4라운드 · 강행하면 사임 위험이 있어요</small>
        </span>
        <span className={s.chevron} aria-hidden="true">
          ›
        </span>
      </button>
      <p className={s.timing}>
        다음 라운드 정산부터 반영해요. 입단 예정일과 유입 방침은 아카데미 운영에서 확인하세요.
      </p>
      <details className={s.reference}>
        <summary>유소년 훈련 효과·판단 기준</summary>
        <ul className={s.focuses} aria-label="유소년 훈련 방향별 효과">
          {(Object.keys(YOUTH_FOCUS_INFO) as (keyof typeof YOUTH_FOCUS_INFO)[]).map((id) => {
            const info = YOUTH_FOCUS_INFO[id];
            return (
              <li key={id} aria-current={focus === id || undefined}>
                <b>{info.label}</b>
                <span>
                  <small>
                    U-17 ×{info.growth.u17} · U-19 ×{info.growth.u19}
                  </small>
                  <small>U-21 ×{info.growth.u21}</small>
                </span>
              </li>
            );
          })}
        </ul>
        <p className={s.note}>
          유스 디렉터는 U-19·U-21 유망주가 1군 수준까지 OVR 5 안쪽이면 1군 준비, U-17이 위
          연령대보다 많으면 기본기 집중, 그 밖에는 균형으로 훈련해요.
        </p>
      </details>
    </section>
  );
}
