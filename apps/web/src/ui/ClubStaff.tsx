import { useState } from 'react';
import type {
  DelegationKey,
  Staff,
  StaffRole,
  World,
} from '../../../../packages/contracts/src/types';
import {
  MANAGER_TRAIT_INFO,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
  staffCandidates,
  staffImpact,
} from '../../../../packages/engine/src/staff';
import { academySummary } from '../../../../packages/engine/src/academy';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { money } from './format';
import s from './ClubStaff.module.css';

const DELEGATION: [DelegationKey, string, string][] = [
  ['training', '훈련 방향', '수석코치가 피로와 유망주를 보고 매 라운드 정해요'],
  ['academy', '유소년 승격·방출', '유스 디렉터가 준비된 유망주를 올리고 정리해요'],
  [
    'transfers',
    '영입 제안 응대',
    '평가 가치 130%(유망주 200%) 이상만 받아요. 30세 이상·계약 막바지·자금난이면 기준을 낮추고, 주전은 지켜요',
  ],
  ['business', '후원 계약', '후원이 비면 운영팀이 안정형 후원을 바로 맺어요'],
];

function useActing() {
  return useGameState((state) => !!state.pendingActions || state.readonly || !!state.error);
}

/** What the staff decides for the owner; turning one off hands that decision back. */
export function Delegation({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  // Show the owner's choice immediately; the saved world confirms it a moment later.
  const [draft, setDraft] = useState<Partial<Record<DelegationKey, boolean>>>({});
  const value = (key: DelegationKey) => draft[key] ?? !!w.delegation?.[key];
  return (
    <section className={s.delegation} aria-label="스태프 위임">
      <h3>스태프에게 맡기기</h3>
      <p>맡긴 일은 스태프가 자동으로 처리하고 소식함에 보고해요. 언제든 직접 할 수 있어요.</p>
      {DELEGATION.map(([key, label, detail]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={value(key)}
            disabled={acting && draft[key] === undefined}
            onChange={(event) => {
              const next = event.target.checked;
              setDraft((current) => ({ ...current, [key]: next }));
              void client.command({ type: 'delegate', key, value: next }).finally(() =>
                setDraft((current) => {
                  const rest = { ...current };
                  delete rest[key];
                  return rest;
                }),
              );
            }}
          />
          <span>
            <b>{label}</b>
            <small>{detail}</small>
          </span>
        </label>
      ))}
    </section>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/** The department effect if this candidate replaced the current member. */
function hiredImpact(w: World, role: StaffRole, candidate: Staff) {
  const staff = [...(w.staff || []).filter((member) => member.role !== role), candidate];
  return staffImpact({ ...w, staff }, role);
}

/** Coaching departments, their effect on the squad and replacements. */
export function CoachingStaff({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const [role, setRole] = useState<StaffRole>();
  const [pick, setPick] = useState<number>();
  const club = clubOf(w);
  const format = (value: string) => money(value, club.country, w.year);
  const members = new Map((w.staff || []).map((member) => [member.role, member]));
  const candidates = role ? staffCandidates(w, role) : [];
  const chosen = pick !== undefined ? candidates[pick] : undefined;
  const current = role ? members.get(role) : undefined;
  return (
    <section className={s.staff} aria-label="코치진">
      <header>
        <h3>코치진</h3>
        <span>
          감독 {w.manager.name}
          {w.manager.trait && ` · ${MANAGER_TRAIT_INFO[w.manager.trait].label}`}
        </span>
      </header>
      {w.manager.trait && (
        <p className={s.managerTrait}>{MANAGER_TRAIT_INFO[w.manager.trait].effect}</p>
      )}
      <ul>
        {STAFF_ROLES.map((id) => {
          const member = members.get(id);
          return (
            <li key={id}>
              <div className={s.role}>
                <b>{STAFF_INFO[id].label}</b>
                <small>{STAFF_INFO[id].duty}</small>
              </div>
              {member ? (
                <div className={s.member}>
                  <span>
                    {member.name} · 능력 {Math.round(member.ability)}
                  </span>
                  <Meter value={member.ability} />
                  <small>
                    {member.trait ? STAFF_TRAIT_INFO[member.trait].label : '특성 없음'}
                    {BigInt(member.wage) > 0n
                      ? ` · 연봉 ${format(member.wage)}`
                      : ' · 무급 자원봉사'}
                  </small>
                  <small className={s.impact}>{staffImpact(w, id)}</small>
                </div>
              ) : (
                <div className={s.member}>
                  <span className={s.vacant}>공석</span>
                  <small className={s.impact}>{staffImpact(w, id)}</small>
                </div>
              )}
              <button
                disabled={acting}
                onClick={(event) => {
                  event.currentTarget.focus();
                  setRole(id);
                  setPick(undefined);
                }}
              >
                {member ? '교체' : '선임'}
              </button>
            </li>
          );
        })}
      </ul>
      {role && (
        <Dialog
          label={`${STAFF_INFO[role].label} 선임`}
          onClose={() => setRole(undefined)}
          actions={
            <div className={s.sheetActions}>
              {current && (
                <button
                  disabled={acting}
                  onClick={() => {
                    void client.command({ type: 'release-staff', role });
                    setRole(undefined);
                  }}
                >
                  계약 해지
                </button>
              )}
              <button
                className={s.primary}
                disabled={acting || pick === undefined}
                onClick={() => {
                  if (pick === undefined) return;
                  void client.command({ type: 'hire-staff', role, candidate: pick });
                  setRole(undefined);
                }}
              >
                {chosen ? `${chosen.name} 선임` : '후보를 고르세요'}
              </button>
            </div>
          }
        >
          <p className={s.note}>
            {STAFF_INFO[role].duty} · 현재{' '}
            {current ? `${current.name} (능력 ${Math.round(current.ability)})` : '공석'}
          </p>
          {candidates.length ? (
            <div className={s.candidates} role="radiogroup" aria-label="코치 후보">
              {candidates.map((candidate, i) => (
                <button
                  key={candidate.id}
                  role="radio"
                  aria-checked={pick === i}
                  className={pick === i ? s.picked : undefined}
                  onClick={() => setPick(i)}
                >
                  <b>{candidate.name}</b>
                  <span>
                    능력 {Math.round(candidate.ability)}
                    {candidate.ability > (current?.ability ?? 0)
                      ? ` (+${Math.round(candidate.ability - (current?.ability ?? 0))})`
                      : ''}
                  </span>
                  <Meter value={candidate.ability} />
                  <small>
                    {candidate.trait
                      ? `${STAFF_TRAIT_INFO[candidate.trait].label} · ${STAFF_TRAIT_INFO[candidate.trait].effect}`
                      : '특성 없음'}
                  </small>
                  <small className={s.impact}>
                    선임 시 {hiredImpact(w, role, candidate)} (지금 {staffImpact(w, role)})
                  </small>
                  <small>
                    연봉 {format(candidate.wage)} · 계약금 {format(candidate.fee)} ·{' '}
                    {candidate.until}
                    년까지
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className={s.note}>이번 시즌 이 자리에 맞는 후보가 없어요.</p>
          )}
          {current && BigInt(current.wage) > 0n && (
            <p className={s.note}>교체·해지 시 기존 연봉의 25%를 보상금으로 지급해요.</p>
          )}
        </Dialog>
      )}
    </section>
  );
}

/** The youth academy: prospects grow here until promoted to the first team. */
export function AcademyView({ w, client }: { w: World; client: GameClient }) {
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
              <span className={s.badge}>{p.role}</span>
              <div>
                <b>{p.name}</b>
                <small>
                  {age}세 · 능력 {overall} / 잠재력 {potential}
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
