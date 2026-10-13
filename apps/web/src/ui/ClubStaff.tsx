import { useEffect, useId, useState, type ReactNode } from 'react';
import type {
  ContractTerm,
  Manager,
  ManagerCriteria,
  Staff,
  StaffRole,
  StaffTrait,
  TalkPayCap,
  TrainingCoach,
  TrainingFocus,
  WageCapOvr,
  World,
  YouthFocus,
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
import {
  COACH_CRITERIA_DEFAULT,
  COACH_PRIORITY_INFO,
  coachCriteriaOf,
  coachDelegated,
  coachKey,
  MANAGER_CRITERIA_DEFAULT,
  MANAGER_PRIORITY_INFO,
  managerCriteriaOf,
  TALK_RULE_DEFAULT,
  talkRuleOf,
} from '../../../../packages/engine/src/hiring';
import { managerPickPreview } from '../../../../packages/engine/src/managerMarket';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { managerTerm, STYLE_INFO } from '../../../../packages/engine/src/styles';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { useCoachRequest } from './state';
import {
  ATTRIBUTE_STEPS,
  canApply,
  departmentTraits,
  OVR_STEPS,
  PRIDE_STEPS,
  sameCriteria,
  SCHOOLS,
  SELECTION_TRAITS,
  stepsWith,
  TALK_AGE_STEPS,
  TALK_MIN_OVR_STEPS,
  TALK_PAY_STEPS,
  toggled,
  wageCapFrom,
  wageCapOptions,
  wageCapValue,
  withDefaults,
  type CapKind,
} from './criteria';
import { Dialog } from './Dialog';
import { DecisionOwner } from './DecisionOwner';
import { callLine, TrainingOrderSheet } from './TrainingOrderSheet';
import { OvrBadge } from './OvrBadge';
import { Select } from './Select';
import { compactMoney, contractLine } from './format';
import { Money } from './Money';
import app from './App.module.css';
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
 * Who runs the coaching staff (→STAFF-15): every department follows the intervention level
 * together (level 4 →WEB-45), each by its own criteria while the staff hire.
 */
export function CoachingPlan({ w }: { w: World }) {
  const decision = coachKey(STAFF_ROLES[0]),
    auto = coachDelegated(w, STAFF_ROLES[0]);
  const expiring = (w.staff || []).filter((member) => isExpiring(w, member));
  return (
    <section className={s.plan} aria-label="코치진 운영">
      <header>
        <h3>코치진 운영</h3>
        <span data-testid="coaching-mode">
          {auto ? '자동 · 스태프가 부서별 기준으로 고용·재계약' : '직접 · 구단주가 고용·재계약'}
        </span>
      </header>
      <DecisionOwner
        w={w}
        decision={decision}
        criteria
        auto="스태프가 부서마다 정한 선임 기준으로 고용해요. 공석과 무급 자리는 기준에 맞는 첫 후보로 바로 채우고, 맞는 후보가 없으면 무급 코치가 지켜요. 계약 중인 코치는 계약이 끝날 때 기준으로 재계약하거나 교체해요."
        owner="코치 선임·재계약·교체를 직접 해요. 재계약 시즌은 4월 1일이에요."
      />
      {expiring.length > 0 && (
        <p className={s.note}>이번 시즌 끝에 계약이 끝나는 코치 {expiring.length}명</p>
      )}
    </section>
  );
}

/** The departments whose head sets a training focus the owner can suggest or force (→STAFF-19). */
const TRAINING_COACHES: readonly StaffRole[] = ['assistant', 'youth'];

/** Coaching departments, their effect on the squad and replacements. */
export function CoachingStaff({ w, client }: { w: World; client: GameClient }) {
  const acting = useActing();
  const [role, setRole] = useState<StaffRole>();
  // A coach's training sheet asked for from 훈련 or a remedy opens once (→STAFF-19).
  const coachRequest = useCoachRequest((state) => state.request);
  const [sheet, setSheet] = useState<{
    coach: TrainingCoach;
    focus?: TrainingFocus | YouthFocus;
  }>();
  useEffect(() => {
    if (!coachRequest) return;
    setSheet(coachRequest);
    useCoachRequest.getState().take();
  }, [coachRequest]);
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
                  {TRAINING_COACHES.includes(id) && (
                    <small data-testid={`coach-call-${id}`}>
                      훈련: {callLine(w, id as TrainingCoach).focus} ·{' '}
                      {callLine(w, id as TrainingCoach).by}
                    </small>
                  )}
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
                {member && TRAINING_COACHES.includes(id) && (
                  <button
                    disabled={acting}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setSheet({ coach: id as TrainingCoach });
                    }}
                  >
                    훈련 제안
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
              {/* The department's criteria, used while the level hands hiring to the staff (→STAFF-15). */}
              <div className={s.department}>
                <CoachCriteriaPanel w={w} client={client} role={id} />
              </div>
            </li>
          );
        })}
      </ul>
      {sheet && (
        <TrainingOrderSheet
          w={w}
          client={client}
          coach={sheet.coach}
          ready={sheet.focus}
          onClose={() => setSheet(undefined)}
        />
      )}
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

/** One criterion: its name, then its control. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <span className={s.fieldName}>{label}</span>
      <div className={s.fieldControl}>{children}</div>
    </div>
  );
}
/** A single choice on the segment track (→WEB-69). */
function Segments<T extends string | number | boolean>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={`${app.segments} ${s.choice}`} role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? app.selected : undefined}
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
/** A multi-select as chips; 상관없음 is the empty list. */
function Chips<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: readonly T[];
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChange: (value: T[]) => void;
}) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      <button
        type="button"
        aria-pressed={!value.length}
        disabled={disabled}
        onClick={() => onChange([])}
      >
        상관없음
      </button>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value.includes(option)}
          disabled={disabled}
          onClick={() => onChange(toggled(value, option))}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
/** A threshold select over its steps; the open end reads 제한 없음. */
function Threshold({
  label,
  value,
  steps,
  open,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  steps: readonly number[];
  open: number;
  unit: '이상' | '이하';
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(Number(next))}
    >
      {stepsWith(steps, value).map((step) => (
        <option key={step} value={step}>
          {step === open ? '제한 없음' : `${step} ${unit}`}
        </option>
      ))}
    </Select>
  );
}
const TERMS = CONTRACT_TERMS.map((term): [ContractTerm, string] => [term, `${term}시즌`]);

/**
 * A criteria editor (→WEB-43): a local draft, one command on 기준 적용 (held while the draft says
 * what is stored or actions are pending) and 기본값으로 putting the defaults back into the draft.
 * A draft left untouched follows the stored value when it changes.
 */
function CriteriaEditor<T extends object>({
  label,
  stored,
  defaults,
  onApply,
  children,
  preview,
}: {
  label: string;
  stored: T;
  defaults: Readonly<T>;
  onApply: (draft: T) => Promise<unknown>;
  children: (draft: T, set: (patch: Partial<T>) => void, disabled: boolean) => ReactNode;
  preview?: (draft: T, changed: boolean) => ReactNode;
}) {
  const acting = useActing();
  const [draft, setDraft] = useState(() => withDefaults(defaults, stored));
  const [base, setBase] = useState(stored);
  const [sending, setSending] = useState(false);
  if (!sameCriteria(stored, base)) {
    setBase(stored);
    if (sameCriteria(draft, base)) setDraft(withDefaults(defaults, stored));
  }
  const set = (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch }));
  const changed = !sameCriteria(draft, stored);
  return (
    <section className={s.criteria} aria-label={label}>
      {children(draft, set, sending)}
      <div className={s.criteriaActions}>
        <button
          type="button"
          disabled={sending || sameCriteria(draft, defaults)}
          onClick={() => setDraft(withDefaults(defaults))}
        >
          기본값으로
        </button>
        <button
          type="button"
          className={s.primary}
          disabled={!canApply(draft, stored, acting || sending)}
          onClick={() => {
            setSending(true);
            void onApply(draft).finally(() => setSending(false));
          }}
        >
          기준 적용
        </button>
      </div>
      {preview?.(draft, changed)}
    </section>
  );
}
/** A world reading the draft criteria, for the preview of what applying would do. */
const withHiring = (w: World, hiring: World['hiring']): World => ({ ...w, hiring });

/** 감독 선임 (→STAFF-18): who appoints, the manager criteria and whom the staff would appoint. */
export function ManagerPost({ w, client }: { w: World; client: GameClient }) {
  const stored = managerCriteriaOf(w);
  return (
    <section className={s.decision} aria-label="감독 선임 위임">
      <header>
        <h3>감독 선임</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="manager"
        criteria
        auto="감독이 떠나면 스태프가 아래 기준에 맞는 감독을 바로 뽑고, 4월 1일 계약이 끝나는 감독은 기준으로 재계약하거나 교체해요. 소식함에 보고해요."
        owner="구단주가 감독을 뽑고 재계약해요."
      />
      <CriteriaEditor
        label="감독 선임 기준"
        stored={stored}
        defaults={MANAGER_CRITERIA_DEFAULT}
        onApply={(criteria) => client.command({ type: 'hiring', role: 'manager', criteria })}
        preview={(draft, changed) => (
          <ManagerPreview
            w={withHiring(w, { ...w.hiring, manager: draft })}
            title={changed ? '적용하면' : '지금 기준이면'}
          />
        )}
      >
        {(c, set, disabled) => (
          <>
            <Field label="최소 OVR">
              <Threshold
                label="최소 OVR"
                value={c.minOvr}
                steps={OVR_STEPS}
                open={0}
                unit="이상"
                disabled={disabled}
                onChange={(minOvr) => set({ minOvr })}
              />
            </Field>
            <Field label="학파">
              <Chips
                label="학파"
                value={c.schools}
                options={SCHOOLS}
                disabled={disabled}
                onChange={(schools) => set({ schools })}
              />
            </Field>
            <Field label="최소 유연성">
              <Threshold
                label="최소 유연성"
                value={c.minFlexibility}
                steps={ATTRIBUTE_STEPS}
                open={0}
                unit="이상"
                disabled={disabled}
                onChange={(minFlexibility) => set({ minFlexibility })}
              />
            </Field>
            <Field label="최대 자존심">
              <Threshold
                label="최대 자존심"
                value={c.maxPride}
                steps={PRIDE_STEPS}
                open={100}
                unit="이하"
                disabled={disabled}
                onChange={(maxPride) => set({ maxPride })}
              />
            </Field>
            <Field label="최소 육성">
              <Threshold
                label="최소 육성"
                value={c.minYouth}
                steps={ATTRIBUTE_STEPS}
                open={0}
                unit="이상"
                disabled={disabled}
                onChange={(minYouth) => set({ minYouth })}
              />
            </Field>
            <Field label="선발 성향">
              <Chips
                label="선발 성향"
                value={c.traits}
                options={SELECTION_TRAITS}
                disabled={disabled}
                onChange={(traits) => set({ traits })}
              />
            </Field>
            <Field label="연봉 상한">
              <WageCap
                w={w}
                kind="manager"
                value={c.maxWageOvr}
                disabled={disabled}
                onChange={(maxWageOvr) => set({ maxWageOvr })}
              />
            </Field>
            <Field label="우선">
              <Segments
                label="우선"
                value={c.priority}
                options={Object.entries(MANAGER_PRIORITY_INFO) as [typeof c.priority, string][]}
                disabled={disabled}
                onChange={(priority) => set({ priority })}
              />
            </Field>
            <Field label="계약 기간">
              <Segments
                label="계약 기간"
                value={c.term}
                options={TERMS}
                disabled={disabled}
                onChange={(term) => set({ term })}
              />
              <small>소방수는 1시즌, 누구도 70세가 되는 시즌을 넘기지 않아요.</small>
            </Field>
            <Field label="다른 구단 감독">
              <Segments
                label="다른 구단 감독"
                value={c.poach}
                options={POACH_OPTIONS}
                disabled={disabled}
                onChange={(poach) => set({ poach })}
              />
            </Field>
            <Field label="맞는 후보가 없으면">
              <Segments
                label="맞는 후보가 없으면"
                value={c.whenNone}
                options={WHEN_NONE_OPTIONS}
                disabled={disabled}
                onChange={(whenNone) => set({ whenNone })}
              />
            </Field>
          </>
        )}
      </CriteriaEditor>
    </section>
  );
}
const POACH_OPTIONS: [boolean, string][] = [
  [false, '자유계약만'],
  [true, '웃돈 주고 영입'],
];
const WHEN_NONE_OPTIONS: [ManagerCriteria['whenNone'], string][] = [
  ['wait', '기다림'],
  ['best', '가장 나은 후보'],
];
function WageCap({
  w,
  kind,
  value,
  disabled,
  onChange,
}: {
  w: World;
  kind: CapKind;
  value?: WageCapOvr;
  disabled?: boolean;
  onChange: (value: WageCapOvr | undefined) => void;
}) {
  return (
    <Select
      aria-label="연봉 상한"
      value={wageCapValue(value)}
      disabled={disabled}
      onValueChange={(next) => onChange(wageCapFrom(next))}
    >
      {wageCapOptions(w, kind).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
/** Whom the manager criteria would appoint if the post fell vacant (→STAFF-18), or why nobody. */
function ManagerPreview({ w, title }: { w: World; title: string }) {
  const preview = managerPickPreview(w),
    pick = preview.pick,
    club = clubOf(w),
    money = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  return (
    <div className={s.preview} data-testid="manager-pick">
      <b>{title}</b>
      {pick ? (
        <div className={s.pick}>
          <OvrBadge value={pick.ability} role="감독" potential={pick.potential} />
          <div>
            <span>
              {pick.name} · {STYLE_INFO[pick.style].label}
            </span>
            <small>
              연봉 {money(pick.wage)} · 계약금 {money(pick.fee)}
              {pick.compensation && <> · 보상금(웃돈) {money(pick.compensation)}</>}
            </small>
            <small>
              {preview.fallback
                ? '기준에 맞는 감독이 없어 가장 나은 자유계약 감독을 뽑아요'
                : '기준에 맞는 첫 후보 · 감독 자리가 비면 이 감독을 뽑아요'}
            </small>
          </div>
        </div>
      ) : (
        <p>{preview.reason}</p>
      )}
    </div>
  );
}

/** One department's criteria (→STAFF-15) and whom they would hire today, behind 기준. */
function CoachCriteriaPanel({
  w,
  client,
  role,
}: {
  w: World;
  client: GameClient;
  role: StaffRole;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const stored = coachCriteriaOf(w, role),
    label = STAFF_INFO[role].label;
  const traitOptions: [StaffTrait | 'any', string][] = [
    ['any', '상관없음'],
    ...departmentTraits(role),
  ];
  return (
    <div className={s.coachCriteria}>
      <button
        type="button"
        className={s.disclosure}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <b>기준</b>
        <small>
          {stored.volunteer
            ? '자원봉사로 운영'
            : `능력 ${stored.minAbility} 이상 · ${COACH_PRIORITY_INFO[stored.priority]} · ${stored.term}시즌`}
        </small>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={id}>
          <CriteriaEditor
            label={`${label} 선임 기준`}
            stored={stored}
            defaults={COACH_CRITERIA_DEFAULT}
            onApply={(criteria) => client.command({ type: 'hiring', role, criteria })}
            preview={(draft, changed) => (
              <CoachPreview
                w={withHiring(w, {
                  ...w.hiring,
                  coaches: { ...w.hiring?.coaches, [role]: draft },
                })}
                role={role}
                title={changed ? '적용하면' : '지금 기준이면'}
              />
            )}
          >
            {(c, set, disabled) => (
              <>
                <label className={s.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={c.volunteer}
                    disabled={disabled}
                    onChange={(event) => set({ volunteer: event.target.checked })}
                  />
                  <span>자원봉사로 운영 · 무급 코치(능력 50)가 자리를 맡아요</span>
                </label>
                <fieldset className={s.fields} disabled={disabled || c.volunteer}>
                  <Field label="최소 능력">
                    <Threshold
                      label="최소 능력"
                      value={c.minAbility}
                      steps={OVR_STEPS}
                      open={0}
                      unit="이상"
                      onChange={(minAbility) => set({ minAbility })}
                    />
                  </Field>
                  <Field label="특성">
                    <Segments
                      label="특성"
                      value={c.trait ?? 'any'}
                      options={traitOptions}
                      onChange={(trait) => set({ trait: trait === 'any' ? undefined : trait })}
                    />
                  </Field>
                  <Field label="연봉 상한">
                    <WageCap
                      w={w}
                      kind="coach"
                      value={c.maxWageOvr}
                      onChange={(maxWageOvr) => set({ maxWageOvr })}
                    />
                  </Field>
                  <Field label="우선">
                    <Segments
                      label="우선"
                      value={c.priority}
                      options={Object.entries(COACH_PRIORITY_INFO) as [typeof c.priority, string][]}
                      onChange={(priority) => set({ priority })}
                    />
                  </Field>
                  <Field label="계약 기간">
                    <Segments
                      label="계약 기간"
                      value={c.term}
                      options={TERMS}
                      onChange={(term) => set({ term })}
                    />
                  </Field>
                </fieldset>
              </>
            )}
          </CriteriaEditor>
        </div>
      )}
    </div>
  );
}
/** Whom a department's criteria would hire today (→STAFF-15), or why nobody. */
function CoachPreview({ w, role, title }: { w: World; role: StaffRole; title: string }) {
  const preview = coachPickPreview(w, role),
    pick = preview.pick,
    c = coachCriteriaOf(w, role),
    member = (w.staff || []).find((one) => one.role === role),
    contracted = !!member && BigInt(member.wage) > 0n,
    club = clubOf(w),
    money = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  return (
    <div className={s.preview} data-testid={`coach-pick-${role}`}>
      <b>{title}</b>
      {pick ? (
        <div className={s.pick}>
          <OvrBadge value={Math.round(pick.ability)} role="OVR" potential={pick.potential} />
          <div>
            <span>
              {pick.name} · {pick.trait ? STAFF_TRAIT_INFO[pick.trait].label : '특성 없음'}
            </span>
            <small>
              연봉 {money(pick.wage)} · 계약금 {money(pick.fee)} · {c.term}시즌
            </small>
            {contracted && <small>계약 중인 코치는 계약이 끝날 때 기준으로 다시 판단해요</small>}
          </div>
        </div>
      ) : (
        <p>{preview.reason}</p>
      )}
    </div>
  );
}

/**
 * 계약 협상 (→CLUB-26): the switch and the talk rule; the term and the cash checks are fixed, and
 * a refusal may leave the player unhappy (→CLUB-27).
 */
export function TalkRulePanel({ w, client }: { w: World; client: GameClient }) {
  return (
    <section className={s.decision} aria-label="계약 협상 위임">
      <header>
        <h3>계약 협상</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="contracts"
        criteria
        auto="이적시장이 열릴 때 재계약·계약 개선을 요구하는 선수에게 스태프가 아래 기준으로 하한을 제시하거나 거절하고 소식함에 보고해요."
        owner="구단주가 협상마다 제시하거나 거절해요."
      />
      <CriteriaEditor
        label="계약 협상 기준"
        stored={talkRuleOf(w)}
        defaults={TALK_RULE_DEFAULT}
        onApply={(rule) => client.command({ type: 'talk-rule', rule })}
        preview={() => (
          <ul className={s.fixed}>
            <li>
              계약 기간: 이번 시즌 뒤로 2시즌(32세부터 1시즌), 지금 계약보다 먼저 끝나지 않아요.
            </li>
            <li>
              자금: 인상 뒤에도 13라운드 운영비가 남고, 이번 시즌 자금 전망도 13라운드 운영비
              이상으로 끝날 때만 하한을 제시해요.
            </li>
            <li>거절하면 감독이 설득하지 못할 때 선수가 언해피가 될 수 있어요.</li>
          </ul>
        )}
      >
        {(rule, set, disabled) => (
          <>
            <Field label="연봉 상한 · 시장가 대비">
              <Segments
                label="연봉 상한"
                value={rule.maxPay}
                options={TALK_PAY_STEPS.map((cap): [TalkPayCap, string] => [
                  cap,
                  `${Math.round(cap * 100)}%`,
                ])}
                disabled={disabled}
                onChange={(maxPay) => set({ maxPay })}
              />
            </Field>
            <Field label="최소 OVR">
              <Threshold
                label="최소 OVR"
                value={rule.minOvr}
                steps={TALK_MIN_OVR_STEPS}
                open={0}
                unit="이상"
                disabled={disabled}
                onChange={(minOvr) => set({ minOvr })}
              />
            </Field>
            <Field label="최대 나이">
              <Select
                aria-label="최대 나이"
                value={rule.maxAge ?? 'none'}
                disabled={disabled}
                onValueChange={(next) =>
                  set({ maxAge: next === 'none' ? undefined : Number(next) })
                }
              >
                <option value="none">제한 없음</option>
                {stepsWith(TALK_AGE_STEPS, rule.maxAge).map((age) => (
                  <option key={age} value={age}>
                    {age}세부터 정리
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </CriteriaEditor>
    </section>
  );
}

/**
 * 제안 응답 (→CLUB-18, CLUB-24): who answers and the sale bar the staff apply, in words.
 */
export function OfferAnswers({ w }: { w: World }) {
  const card = cardOf(buildOf(w), 'market').label;
  return (
    <section className={s.decision} aria-label="이적 제안 위임">
      <header>
        <h3>제안 응답</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="transfers"
        criteria
        auto="다른 구단의 제안에 스태프가 아래 기준으로 답하고 소식함에 보고해요."
        owner="구단주가 제안마다 수락·거절해요."
      />
      <ul className={s.fixed}>
        <li>이적 명단 선수는 들어오는 제안을 받아들여 매각해요.</li>
        <li>
          협상 가능 선수는 평가 가치의 130%(유망주: 22세 이하·잠재력이 능력보다 8 이상 높으면 200%)
          이상이면 팔아요. 주전은 같은 역할에 능력 3 안쪽의 후보가 있는 30세 이상일 때만 팔아요.
        </li>
        <li>
          나이(30–32세 −15%p, 33세 이상 −30%p), 계약(마지막 시즌 −20%p, 1년 남음 −10%p),
          자금(13라운드 미만 −20%p, 30라운드 미만 −10%p)만큼 낮추되 80% 밑으로는 내리지 않아요.
        </li>
        <li>
          이적 불가 선수의 거액 제안은 감독과 상의해 매각 기조 <b>{card}</b>와 자금 사정으로 정해요.
        </li>
      </ul>
    </section>
  );
}
