import { useState } from 'react';
import type {
  ContractTerm,
  DelegationKey,
  Manager,
  Staff,
  StaffRole,
  World,
} from '../../../../packages/contracts/src/types';
import {
  coachPickPreview,
  CONTRACT_TERMS,
  DELEGATED_TERM,
  isExpiring,
  MANAGER_TRAIT_INFO,
  releaseCost,
  renewalTerms,
  seasonsLeft,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
  staffCandidates,
  staffImpact,
} from '../../../../packages/engine/src/staff';
import { managerRenewal, managerTermLimit } from '../../../../packages/engine/src/ops-staff';
import { COACH_KEYS, coachDelegated } from '../../../../packages/engine/src/hiring';
import { managerPickPreview } from '../../../../packages/engine/src/managerMarket';
import { managerTerm } from '../../../../packages/engine/src/styles';
import { academySummary } from '../../../../packages/engine/src/academy';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { OvrBadge } from './OvrBadge';
import { compactMoney, contractLine } from './format';
import { Money } from './Money';
import s from './ClubStaff.module.css';

/** One checkbox per decision; 코치 고용·재계약 turns every department's switch together. */
const DELEGATION: [DelegationKey | 'coaches', string, string][] = [
  ['training', '훈련 방향', '수석코치가 피로와 유망주를 보고 매 라운드 정해요'],
  ['academy', '유소년 승격·방출', '유스 디렉터가 준비된 유망주를 올리고 정리해요'],
  [
    'transfers',
    '영입 제안 응대',
    '이적 명단 선수는 제안을 받아요. 협상 가능 선수는 평가 가치 130%(유망주 200%) 이상만 받고(30세 이상·계약 막바지·자금난이면 낮춤) 주전은 지켜요. 이적 불가 선수의 150% 이상 거액 제안은 감독과 상의해 매각 기조와 자금 사정으로 정해요',
  ],
  ['business', '후원 계약', '후원이 비면 운영팀이 안정형 후원을 바로 맺어요'],
  [
    'coaches',
    '코치 고용·재계약',
    '부서마다 정한 선임 기준으로 공석과 무급 자리를 바로 채우고, 계약이 끝나는 코치는 기준으로 재계약하거나 교체해요',
  ],
  [
    'manager',
    '감독 선임',
    '감독이 떠나면 감독 선임 기준에 맞는 감독을 바로 뽑아 시계가 멈추지 않아요. 계약이 끝나는 감독은 기준으로 재계약하거나 교체해요',
  ],
];

function useActing() {
  return useGameState((state) => !!state.pendingActions || state.readonly || !!state.error);
}

/** The switches one checkbox stands for: the seven departments' for 코치 고용·재계약. */
const switchesOf = (key: DelegationKey | 'coaches'): readonly DelegationKey[] =>
  key === 'coaches' ? COACH_KEYS : [key];

/** What the staff decides for the owner; turning one off hands that decision back. */
export function Delegation({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  // Show the owner's choice immediately; the saved world confirms it a moment later.
  const [draft, setDraft] = useState<Partial<Record<DelegationKey | 'coaches', boolean>>>({});
  const value = (key: DelegationKey | 'coaches') =>
    draft[key] ?? switchesOf(key).every((one) => !!w.delegation?.[one]);
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
              void (async () => {
                for (const one of switchesOf(key))
                  if (!!w.delegation?.[one] !== next)
                    await client.command({ type: 'delegate', key: one, value: next });
              })().finally(() =>
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
      <ManagerOutlook w={w} />
    </section>
  );
}

/** Whom the staff would appoint by the manager criteria if the post fell vacant today (→STAFF-18). */
function ManagerOutlook({ w }: { w: World }) {
  const preview = managerPickPreview(w);
  return (
    <p data-testid="manager-rule-outlook">
      지금 감독 자리가 비면 · {preview.reason}
      {!w.delegation?.manager && ' · 감독 선임을 맡기면 이 기준으로 골라요'}
    </p>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/** " · 34세" for a coach with an age; volunteers and older saves have none. */
function coachAge(w: World, member: Staff) {
  return member.born === undefined ? '' : ` · ${w.year - member.born}세`;
}
/** The department effect if this candidate replaced the current member. */
function hiredImpact(w: World, role: StaffRole, candidate: Staff) {
  const staff = [...(w.staff || []).filter((member) => member.role !== role), candidate];
  return staffImpact({ ...w, staff }, role);
}

/**
 * The seasons a contract runs, chosen by the owner (→STAFF-11, →STAFF-14) as a five-step dial;
 * steps past `limit` stay visible but unavailable, with the reason as their title.
 */
export function TermDial({
  label,
  value,
  limit = CONTRACT_TERMS.length,
  why,
  disabled,
  onChange,
}: {
  label: string;
  value: ContractTerm;
  limit?: number;
  why?: string;
  disabled?: boolean;
  onChange: (term: ContractTerm) => void;
}) {
  return (
    <div className={s.termDial} role="radiogroup" aria-label={label}>
      {CONTRACT_TERMS.map((term) => (
        <button
          key={term}
          type="button"
          role="radio"
          aria-checked={value === term}
          className={value === term ? `${s.termStep} ${s.planOn}` : s.termStep}
          disabled={disabled || term > limit}
          title={term > limit ? why : undefined}
          onClick={() => onChange(term)}
        >
          <b>{term}시즌</b>
        </button>
      ))}
    </div>
  );
}

/**
 * What a contract costs before it is signed: the wage over the term with the signing fee, when it
 * ends, and what releasing or replacing him would pay right after (25% of the wage per season
 * left, →STAFF-11).
 */
function TermCosts({
  w,
  wage,
  fee,
  term,
  until,
  ends = true,
}: {
  w: World;
  wage: string;
  fee: string;
  term: number;
  until: number;
  /** Off where the sheet already says when the contract ends. */
  ends?: boolean;
}) {
  const club = clubOf(w);
  const format = (value: string | bigint) => (
    <Money value={value} code={club.country} year={w.year} />
  );
  const total = BigInt(wage) * BigInt(term) + BigInt(fee);
  return (
    <p className={s.termCosts} data-testid="term-costs">
      <span>
        총 {format(total)} · 연봉 {format(wage)} × {term}시즌 + 계약금 {format(fee)}
      </span>
      <small>
        {ends && `${contractLine(until, w.year)} · `}중도 해지·교체 보상금{' '}
        {format(releaseCost(w, { wage, until }))} (남은 {seasonsLeft(w, until)}시즌 × 연봉의 25%)
      </small>
    </p>
  );
}

const SEVENTY = '70세가 되는 시즌까지만 계약할 수 있어요';

/**
 * Renewing the manager whose contract ends at this close (→STAFF-14): nobody renews himself, so
 * the owner chooses the seasons (the firefighter one, never past his 70th year) at the going
 * wage, fixed for the term.
 */
export function ManagerRenewal({
  w,
  client,
  disabled,
}: {
  w: World;
  client: GameClient;
  disabled: boolean;
}) {
  const offer = managerRenewal(w);
  const [term, setTerm] = useState<ContractTerm>(managerTerm(w.manager) as ContractTerm);
  if (!offer) return null;
  const chosen = Math.min(term, offer.limit) as ContractTerm,
    terms = managerRenewal(w, chosen)!;
  return (
    <>
      <p>
        재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요.
        {offer.limit === 1 && managerTerm(w.manager) === 1 && ' 소방수는 1시즌씩 계약해요.'}
      </p>
      {offer.limit > 1 && (
        <TermDial
          label="감독 재계약 기간"
          value={chosen}
          limit={offer.limit}
          why={SEVENTY}
          disabled={disabled}
          onChange={setTerm}
        />
      )}
      <TermCosts w={w} wage={terms.wage} fee={terms.fee} term={chosen} until={terms.until} />
      <button
        className={s.primary}
        disabled={disabled}
        onClick={() => void client.command({ type: 'renew-manager', term: chosen })}
      >
        재계약
      </button>
    </>
  );
}

/** The term a manager candidate signs for and what it costs (→STAFF-14). */
export function ManagerHireTerm({
  w,
  candidate,
  term,
  disabled,
  onChange,
}: {
  w: World;
  candidate: Pick<Manager, 'style' | 'born' | 'wage'> & { fee: string };
  term: ContractTerm;
  disabled: boolean;
  onChange: (term: ContractTerm) => void;
}) {
  const limit = managerTermLimit(candidate, w.year);
  return (
    <>
      {limit > 1 && (
        <TermDial
          label="감독 계약 기간"
          value={term}
          limit={limit}
          why={SEVENTY}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      <TermCosts
        w={w}
        wage={candidate.wage}
        fee={candidate.fee}
        term={term}
        until={w.year + term}
        ends={false}
      />
    </>
  );
}

/**
 * Who runs the coaching staff (→STAFF-15): each department the staff run hires and renews by its
 * own criteria; the owner runs the rest.
 */
export function CoachingPlan({ w }: { w: World }) {
  const delegatedRoles = STAFF_ROLES.filter((role) => coachDelegated(w, role)),
    delegated = delegatedRoles.length > 0;
  const expiring = (w.staff || []).filter((member) => isExpiring(w, member));
  return (
    <section className={s.plan} aria-label="코치진 운영">
      <header>
        <h3>코치진 운영</h3>
        <span data-testid="coaching-mode">
          {delegatedRoles.length === STAFF_ROLES.length
            ? '자동 · 스태프가 부서별 기준으로 고용·재계약'
            : delegated
              ? `일부 자동 · ${delegatedRoles.map((role) => STAFF_INFO[role].label).join('·')}`
              : '직접 · 구단주가 고용·재계약'}
        </span>
      </header>
      <p className={s.note}>
        {delegated
          ? `스태프가 ${delegatedRoles.length}개 부서를 맡아 부서마다 정한 선임 기준으로 고용해요. 공석과 무급 자리는 기준에 맞는 첫 후보로 바로 채우고, 맞는 후보가 없으면 무급 코치가 지켜요. 계약 중인 코치는 계약이 끝날 때 기준으로 재계약하거나 교체해요.`
          : '코치 선임·재계약·교체를 직접 해요. 재계약 시즌은 4월 1일이에요. 부서를 스태프에게 맡기면 정한 선임 기준으로 알아서 고용해요.'}
        {expiring.length > 0 && ` · 이번 시즌 끝에 계약이 끝나는 코치 ${expiring.length}명`}
      </p>
    </section>
  );
}

/** Coaching departments, their effect on the squad and replacements. */
export function CoachingStaff({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const [role, setRole] = useState<StaffRole>();
  const [pick, setPick] = useState<number>();
  // Hiring and renewing both start from the two seasons the staff would sign (→STAFF-15).
  const [term, setTerm] = useState<ContractTerm>(DELEGATED_TERM);
  const [renewing, setRenewing] = useState<StaffRole>();
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />,
    // Inside a control that already answers the tap: the notation, the exact amount as its title.
    plain = (value: string) => <Money value={value} code={club.country} year={w.year} plain />,
    text = (value: string) => compactMoney(value, club.country, w.year);
  const members = new Map((w.staff || []).map((member) => [member.role, member]));
  const candidates = role ? staffCandidates(w, role) : [];
  const chosen = pick !== undefined ? candidates[pick] : undefined;
  const current = role ? members.get(role) : undefined;
  const owed = releaseCost(w, current);
  const renewal = renewing ? members.get(renewing) : undefined;
  const renewed = renewal && isExpiring(w, renewal) ? renewalTerms(w, renewal, term) : undefined;
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
                {member ? (
                  <OvrBadge
                    value={Math.round(member.ability)}
                    role="OVR"
                    potential={member.potential}
                  />
                ) : (
                  <span className={s.vacantChip}>공석</span>
                )}
                <div>
                  <b>{STAFF_INFO[id].label}</b>
                  <small>{STAFF_INFO[id].duty}</small>
                </div>
              </div>
              {member ? (
                <div className={s.member}>
                  <span>
                    {member.name}
                    {coachAge(w, member)}
                    {isExpiring(w, member) && <em className={s.expiring}> 계약 만료 예정</em>}
                  </span>
                  <Meter value={member.ability} />
                  <small>
                    {member.trait ? STAFF_TRAIT_INFO[member.trait].label : '특성 없음'}
                    {BigInt(member.wage) > 0n ? (
                      <> · 연봉 {format(member.wage)}</>
                    ) : (
                      ' · 무급 자원봉사'
                    )}
                  </small>
                  <small className={s.impact}>{staffImpact(w, id)}</small>
                  {isExpiring(w, member) && (
                    <small>
                      재계약: 연봉 {format(renewalTerms(w, member).wage)} · 계약금{' '}
                      {format(renewalTerms(w, member).fee)} · 1–5시즌 선택
                    </small>
                  )}
                </div>
              ) : (
                <div className={s.member}>
                  <span className={s.vacant}>공석</span>
                  <small className={s.impact}>{staffImpact(w, id)}</small>
                </div>
              )}
              <div className={s.rowActions}>
                {member && isExpiring(w, member) && (
                  <button
                    className={s.primary}
                    disabled={acting}
                    title={`연봉 ${text(renewalTerms(w, member).wage)} · 계약금 ${text(renewalTerms(w, member).fee)} · 기간 선택`}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setRenewing(id);
                      setTerm(DELEGATED_TERM);
                    }}
                  >
                    재계약
                  </button>
                )}
                <button
                  disabled={acting}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setRole(id);
                    setPick(undefined);
                    setTerm(DELEGATED_TERM);
                  }}
                >
                  {member ? '교체' : '선임'}
                </button>
              </div>
              {coachDelegated(w, id) && (
                <small className={s.impact} data-testid={`coach-pick-${id}`}>
                  지금 기준이면 · {coachPickPreview(w, id).reason}
                </small>
              )}
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
                  계약 해지{owed !== '0' && <> · {plain(owed)}</>}
                </button>
              )}
              <button
                className={s.primary}
                disabled={acting || pick === undefined}
                onClick={() => {
                  if (pick === undefined) return;
                  void client.command({ type: 'hire-staff', role, candidate: pick, term });
                  setRole(undefined);
                }}
              >
                {chosen ? `${chosen.name} 선임 · ${term}시즌` : '후보를 고르세요'}
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
                  <div className={s.candidateHead}>
                    <OvrBadge
                      value={Math.round(candidate.ability)}
                      role="OVR"
                      potential={candidate.potential}
                    />
                    <div>
                      <b>{candidate.name}</b>
                      <span>
                        {coachAge(w, candidate).replace(/^ · /, '')}
                        {candidate.ability > (current?.ability ?? 0)
                          ? ` · 지금보다 +${Math.round(candidate.ability - (current?.ability ?? 0))}`
                          : ''}
                        {(candidate.potential ?? 0) > candidate.ability
                          ? ` · 성장 여지 +${candidate.potential! - candidate.ability}`
                          : ''}
                      </span>
                    </div>
                  </div>
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
                    연봉 {plain(candidate.wage)} · 계약금 {plain(candidate.fee)}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className={s.note}>이번 시즌 이 자리에 맞는 후보가 없어요.</p>
          )}
          {candidates.length > 0 && (
            <TermDial label="코치 계약 기간" value={term} disabled={acting} onChange={setTerm} />
          )}
          {chosen && (
            <TermCosts
              w={w}
              wage={chosen.wage}
              fee={chosen.fee}
              term={term}
              until={w.year + term}
            />
          )}
          {current && owed !== '0' && (
            <p className={s.note}>
              교체·해지 시 {current.name}에게 보상금 {format(owed)} (남은{' '}
              {seasonsLeft(w, current.until)}시즌 × 연봉의 25%)
            </p>
          )}
        </Dialog>
      )}
      {renewing && renewal && renewed && (
        <Dialog
          label={`${STAFF_INFO[renewing].label} 재계약`}
          onClose={() => setRenewing(undefined)}
          actions={
            <div className={s.sheetActions}>
              <button onClick={() => setRenewing(undefined)}>취소</button>
              <button
                className={s.primary}
                disabled={acting}
                onClick={() => {
                  void client.command({ type: 'renew-staff', role: renewing, term });
                  setRenewing(undefined);
                }}
              >
                재계약 · {term}시즌
              </button>
            </div>
          }
        >
          <p className={s.note}>
            {renewal.name} (능력 {Math.round(renewal.ability)}) · 연봉은 지금 능력으로 다시 정해지고
            계약 기간 동안 그대로예요.
          </p>
          <TermDial label="코치 재계약 기간" value={term} disabled={acting} onChange={setTerm} />
          <TermCosts
            w={w}
            wage={renewed.wage}
            fee={renewed.fee}
            term={term}
            until={renewed.until}
          />
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
