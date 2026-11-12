import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useTaskState } from '../../../shared/routing/taskMemory';
import { PersonCareerLink } from '../../../features/person-career';
import { useEffect } from 'react';
import type {
  ContractTerm,
  Manager,
  Staff,
  StaffCandidate,
  StaffRole,
  TrainingCoach,
  World,
} from '../../../../../../packages/contracts/src/types';
import {
  coachPickPreview,
  renewalTerms,
  staffCandidates,
  staffImpact,
} from '../../../../../../packages/engine/src/staff';
import {
  CONTRACT_TERMS,
  DELEGATED_TERM,
  isExpiring,
  MANAGER_TRAIT_INFO,
  releaseCost,
  seasonsLeft,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
} from '../../../../../../packages/engine/src/staff-info';
import { managerRenewal, managerTermLimit } from '../../../../../../packages/engine/src/ops-staff';
import { coachCriteriaOf, coachDelegated } from '../../../../../../packages/engine/src/hiring';
import { directionOption } from '../../../../../../packages/engine/src/direction';
import { SAFETY_ROUNDS, sharePercent } from '../../../../../../packages/engine/src/delegation-info';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import { SALE_BARS } from '../../../../../../packages/engine/src/transfers';
import { managerPickPreview } from '../../../../../../packages/engine/src/managerMarket';
import { buildOf, cardOf } from '../../../../../../packages/engine/src/build';
import { managerTerm, STYLE_INFO } from '../../../../../../packages/engine/src/styles';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import type { GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { openTraining, useStaffRequest } from '../../../shared/routing/state';
import { callLine } from '../../../entities/player';
import { DirectionFacts } from './DirectionFacts';
import { Segments } from '../../../shared/ui/Segments';
import { Dialog } from '../../../shared/ui/Dialog';
import { DecisionOwner } from './DecisionOwner';
import { OvrBadge } from '../../../entities/player';
import { StaffRoleBadge } from './StaffRoleBadge';
import { compactMoney, contractLine } from '../../../presentation/format';
import { directorDecisions } from '../lib/shortlist';
import { staffOrigin } from '../lib/staffMarket';
import { ClubLink } from '../../../entities/club';
import { Money } from '../../../shared/ui/Money';
import s from './ClubStaff.module.css';
import management from './ManagementView.module.css';

function useActing() {
  return useGameState(gameActionsBlocked);
}

function Meter({ value }: { value: number }) {
  useTextLocale();
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/** " · 34세" for a coach with an age; volunteers and older saves have none. */
function coachAge(w: World, member: Staff) {
  return member.born === undefined
    ? ''
    : sourceMessage('copy.AssigneeProfile.c8bdab2932', { p0: w.year - member.born });
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
  useTextLocale();
  return (
    <div className={s.termDial} role="radiogroup" aria-label={localizeValue(label)}>
      {localizeValue(
        CONTRACT_TERMS.map((term) => (
          <button
            key={term}
            type="button"
            role="radio"
            aria-checked={value === term}
            className={value === term ? `${s.termStep} ${s.planOn}` : s.termStep}
            disabled={disabled || term > limit}
            title={localizeValue(term > limit ? why : undefined)}
            onClick={() => onChange(term)}
          >
            <b>{richMessage('copy.BallonDorView.3585c2642b', { p0: term })}</b>
          </button>
        )),
      )}
    </div>
  );
}

/**
 * What a contract costs before it is signed: the wage over the term with the signing fee and any
 * compensation to another club (→STAFF-49), when it ends, and what releasing or replacing him
 * would pay right after (25% of the wage per season left, →STAFF-11).
 */
function TermCosts({
  w,
  wage,
  fee,
  compensation,
  term,
  until,
  ends = true,
}: {
  w: World;
  wage: string;
  fee: string;
  compensation?: string;
  term: number;
  until: number;
  /** Off where the sheet already says when the contract ends. */
  ends?: boolean;
}) {
  useTextLocale();
  const club = clubOf(w);
  const format = (value: string | bigint) => (
    <Money value={value} code={club.country} year={w.year} />
  );
  const total = BigInt(wage) * BigInt(term) + BigInt(fee) + BigInt(compensation ?? '0');
  return (
    <p className={s.termCosts} data-testid="term-costs">
      <span>
        {compensation
          ? richMessage('copy.ClubStaff.2f836110bc', {
              p0: format(total),
              p1: format(wage),
              p2: term,
              p3: format(fee),
              p4: format(compensation),
            })
          : richMessage('copy.ClubStaff.245d2ffb11', {
              p0: format(total),
              p1: format(wage),
              p2: term,
              p3: format(fee),
            })}
      </span>
      <small>
        {richMessage('copy.ClubStaff.9146f19581', {
          p0: ends && `${contractLine(until, w.year)} · `,
          p1: ' ',
          p2: format(releaseCost(w, { wage, until })),
          p3: seasonsLeft(w, until),
        })}
      </small>
    </p>
  );
}

/**
 * Where a staff candidate comes from and what signing him pays (→STAFF-49, CLUB-50): 자유계약 with
 * his wage and signing fee, or his club with its compensation (웃돈) and the fee and compensation
 * together. `link` off names the club as text, inside a control that already answers the tap.
 */
function StaffTerms({
  w,
  candidate,
  link = true,
  costs = true,
}: {
  w: World;
  candidate: StaffCandidate;
  link?: boolean;
  /** Off where the wage and fee already have a line of their own. */
  costs?: boolean;
}) {
  useTextLocale();
  const origin = staffOrigin(candidate),
    club = clubOf(w);
  const plain = (value: string) => <Money value={value} code={club.country} year={w.year} plain />;
  const named =
    origin.kind === 'club' &&
    (link ? (
      <ClubLink w={w} id={origin.club} crest={12} />
    ) : (
      (w.clubs.find((c) => c.id === origin.club)?.name ?? origin.club)
    ));
  return (
    <>
      <small className={s.source} data-source={origin.kind}>
        {localizeValue(
          origin.kind === 'club'
            ? richMessage('staff.source.club', {
                club: named,
                compensation: plain(origin.compensation),
              })
            : richMessage('staff.source.free'),
        )}
      </small>
      {localizeValue(
        costs && (
          <small>
            {localizeValue(
              origin.kind === 'club'
                ? richMessage('staff.cost.club', {
                    wage: plain(candidate.wage),
                    total: plain(origin.total),
                  })
                : richMessage('copy.ClubStaff.88938e8749', {
                    p0: plain(candidate.wage),
                    p1: plain(origin.fee),
                  }),
            )}
          </small>
        ),
      )}
    </>
  );
}

const SEVENTY = sourceMessage('copy.ClubStaff.005127c822');

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
  useTextLocale();
  const offer = managerRenewal(w);
  const [term, setTerm] = useTaskState<ContractTerm>(
    w.id,
    `manager-renewal-term-${w.manager.id}`,
    managerTerm(w.manager) as ContractTerm,
  );
  if (!offer) return null;
  const chosen = Math.min(term, offer.limit) as ContractTerm,
    terms = managerRenewal(w, chosen)!;
  return (
    <>
      <p>
        {richMessage('copy.ClubStaff.d5aef91981', {
          p0:
            offer.limit === 1 &&
            managerTerm(w.manager) === 1 &&
            sourceMessage('copy.ClubStaff.b961053287'),
        })}
      </p>
      {localizeValue(
        offer.limit > 1 && (
          <TermDial
            label={displayMessage('copy.ClubStaff.5dc3af72e1')}
            value={chosen}
            limit={offer.limit}
            why={SEVENTY}
            disabled={disabled}
            onChange={setTerm}
          />
        ),
      )}
      <TermCosts w={w} wage={terms.wage} fee={terms.fee} term={chosen} until={terms.until} />
      <button
        data-ui="primary"
        className={s.primary}
        disabled={disabled}
        onClick={() => void client.command({ type: 'renew-manager', term: chosen })}
      >
        {richMessage('copy.ClubStaff.a199caa699')}
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
  useTextLocale();
  const limit = managerTermLimit(candidate, w.year);
  return (
    <>
      {localizeValue(
        limit > 1 && (
          <TermDial
            label={displayMessage('copy.ClubStaff.c07f58b5f4')}
            value={term}
            limit={limit}
            why={SEVENTY}
            disabled={disabled}
            onChange={onChange}
          />
        ),
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
 * Who runs the coaching staff (→STAFF-15): every department follows the one 코치진
 * responsibility together (→WEB-45), all by 코치 기조 while the staff hire.
 */
export function CoachingPlan({ w }: { w: World }) {
  useTextLocale();
  // The 단장's post among them; every post follows the same responsibility, so one department speaks.
  const decision = 'staff' as const,
    auto = coachDelegated(w, 'assistant');
  const expiring = (w.staff || []).filter((member) => isExpiring(w, member));
  return (
    <section
      data-surface="sheet"
      className={s.plan}
      aria-label={displayMessage('copy.ClubStaff.13ae521048')}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.13ae521048')}</h3>
        <span data-testid="coaching-mode">
          {localizeValue(
            auto
              ? sourceMessage('copy.ClubStaff.57de55757f')
              : sourceMessage('copy.ClubStaff.e6146179aa'),
          )}
        </span>
      </header>
      <DecisionOwner
        w={w}
        decision={decision}
        criteria
        auto={sourceMessage('copy.ClubStaff.c045e61a86')}
        owner={sourceMessage('copy.ClubStaff.4a63de6ab5')}
      />
      <details data-ui="disclosure" className={management.reference}>
        <summary>{richMessage('copy.ClubStaff.d112f7379a')}</summary>
        <DirectionFacts w={w} rows={['coaches']} responsibility="staff" />
      </details>
      {localizeValue(
        expiring.length > 0 && (
          <p className={s.note}>
            {richMessage('copy.ClubStaff.b96a621e3c', { p0: expiring.length })}
          </p>
        ),
      )}
    </section>
  );
}

/** What the 단장 decides at the current level (→STAFF-20, →WEB-43), each 맡김 or 직접. */
function DirectorDecides({ w }: { w: World }) {
  useTextLocale();
  return (
    <small className={s.decides} data-testid="director-decides">
      {localizeValue(
        directorDecisions(w).map(({ label, auto }, i) => (
          <span key={label} data-auto={auto}>
            {localizeValue(i > 0 && ' · ')}
            {localizeValue(label)}{' '}
            <b>
              {localizeValue(
                auto
                  ? sourceMessage('copy.ClubStaff.6c113d66d2')
                  : sourceMessage('copy.ApprovalQueue.20c483bdda'),
              )}
            </b>
          </span>
        )),
      )}
    </small>
  );
}

/** The departments whose head sets a training focus by his own rule (→CLUB-13, CLUB-31). */
const TRAINING_COACHES: readonly StaffRole[] = ['assistant', 'youth'];

/** Coaching departments, their effect on the squad and replacements. */
export function CoachingStaff({
  w,
  client,
  selected,
  onCancel,
  error,
}: {
  w: World;
  client: GameClient;
  selected?: StaffRole;
  onCancel?: () => void;
  error?: string;
}) {
  useTextLocale();
  const acting = useActing();
  const request = useStaffRequest((store) => store.request);
  const [role, setRole] = useTaskState<StaffRole | undefined>(w.id, 'staff-role', () =>
    selected && !w.staff?.some((member) => member.role === selected) ? selected : undefined,
  );
  useEffect(() => {
    if (request) {
      setRole(request);
      setPick(undefined);
      setTerm(DELEGATED_TERM);
      setRenewing(undefined);
      useStaffRequest.getState().take();
    }
  }, [request]);
  const [pick, setPick] = useTaskState<string | undefined>(w.id, 'staff-pick', undefined);
  // Hiring and renewing both start from the two seasons the staff would sign (→STAFF-15).
  const [term, setTerm] = useTaskState<ContractTerm>(w.id, 'staff-term', DELEGATED_TERM);
  const [renewing, setRenewing] = useTaskState<StaffRole | undefined>(w.id, 'staff-renewing', () =>
    selected && w.staff?.some((member) => member.role === selected && isExpiring(w, member))
      ? selected
      : undefined,
  );
  useEffect(() => {
    if (!selected) return;
    const member = w.staff?.find((person) => person.role === selected);
    setRole(member ? undefined : selected);
    setPick(undefined);
    setRenewing(member && isExpiring(w, member) ? selected : undefined);
  }, [selected, w.id]);
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />,
    // Inside a control that already answers the tap: the notation, the exact amount as its title.
    plain = (value: string) => <Money value={value} code={club.country} year={w.year} plain />,
    text = (value: string) => compactMoney(value, club.country, w.year);
  const members = new Map((w.staff || []).map((member) => [member.role, member]));
  const projectedCandidates = useGameState((state) =>
    role ? state.view?.coaches[role] : undefined,
  );
  const candidates = role ? (projectedCandidates ?? staffCandidates(w, role)) : [];
  const chosen = candidates.find((candidate) => candidate.id === pick);
  const current = role ? members.get(role) : undefined;
  const owed = releaseCost(w, current);
  const renewal = renewing ? members.get(renewing) : undefined;
  const renewed = renewal && isExpiring(w, renewal) ? renewalTerms(w, renewal, term) : undefined;
  return (
    <section
      data-surface="panel"
      className={s.staff}
      aria-label={displayMessage('copy.ClubStaff.64c4586f7b')}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.64c4586f7b')}</h3>
        <span>
          {richMessage('copy.ClubStaff.22896d392f', {
            p0: w.manager.name,
            p1: w.manager.trait && ` · ${MANAGER_TRAIT_INFO[w.manager.trait].label}`,
          })}
        </span>
      </header>
      {localizeValue(
        w.manager.trait && (
          <p className={s.managerTrait}>
            {localizeValue(MANAGER_TRAIT_INFO[w.manager.trait].effect)}
          </p>
        ),
      )}
      <ul>
        {localizeValue(
          (
            [
              'director',
              'scout',
              ...STAFF_ROLES.filter((id) => id !== 'director' && id !== 'scout'),
            ] as StaffRole[]
          ).map((id) => {
            if (selected && id !== selected) return null;
            const member = members.get(id);
            return (
              <li key={id} id={`staff-post-${id}`} data-role={id}>
                {localizeValue(
                  (id === 'director' || id === 'assistant') && (
                    <h4 className={s.departmentTitle}>
                      {localizeValue(
                        id === 'director'
                          ? sourceMessage('copy.ClubStaff.48e41762cb')
                          : sourceMessage('copy.ClubStaff.4f9c12ccbd'),
                      )}
                    </h4>
                  ),
                )}
                <div className={s.role}>
                  {localizeValue(
                    member ? (
                      <OvrBadge
                        value={Math.round(member.ability)}
                        role="OVR"
                        potential={member.potential}
                      />
                    ) : (
                      <span className={s.vacantChip}>{richMessage('team.vacant')}</span>
                    ),
                  )}
                  <div>
                    <StaffRoleBadge post={id} />
                  </div>
                </div>
                {localizeValue(
                  member ? (
                    <div className={s.member}>
                      <span>
                        {member.name}
                        {localizeValue(
                          member.person && (
                            <PersonCareerLink
                              id={member.person}
                              name={member.name}
                              client={client}
                            />
                          ),
                        )}
                        {localizeValue(coachAge(w, member))}
                        {localizeValue(
                          isExpiring(w, member) && (
                            <em className={s.expiring}>
                              {richMessage('copy.ClubStaff.9f7c630b1d')}
                            </em>
                          ),
                        )}
                      </span>
                      <Meter value={member.ability} />
                      <small>
                        {localizeValue(
                          member.trait
                            ? STAFF_TRAIT_INFO[member.trait].label
                            : sourceMessage('copy.ClubStaff.7cff642737'),
                        )}
                        {localizeValue(
                          BigInt(member.wage) > 0n ? (
                            <>
                              {richMessage('copy.ClubStaff.143fe39ad3', {
                                p0: format(member.wage),
                              })}
                            </>
                          ) : (
                            sourceMessage('copy.ClubStaff.5fad535146')
                          ),
                        )}
                      </small>
                      <small>{localizeValue(contractLine(member.until, w.year))}</small>
                      <small className={s.impact}>{localizeValue(staffImpact(w, id))}</small>
                      {localizeValue(id === 'director' && <DirectorDecides w={w} />)}
                      {localizeValue(
                        TRAINING_COACHES.includes(id) && (
                          <small data-testid={`coach-call-${id}`}>
                            {richMessage('copy.ClubStaff.d31fae7e7e', {
                              p0: callLine(w, id as TrainingCoach).focus,
                              p1: ' ',
                              p2: callLine(w, id as TrainingCoach).by,
                            })}
                          </small>
                        ),
                      )}
                      {localizeValue(
                        isExpiring(w, member) && (
                          <small>
                            {richMessage('copy.ClubStaff.adba59f354', {
                              p0: format(renewalTerms(w, member).wage),
                              p1: ' ',
                              p2: format(renewalTerms(w, member).fee),
                            })}
                          </small>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className={s.member}>
                      <span className={s.vacant}>{richMessage('team.vacant')}</span>
                      <small className={s.impact}>{localizeValue(staffImpact(w, id))}</small>
                      {localizeValue(id === 'director' && <DirectorDecides w={w} />)}
                    </div>
                  ),
                )}
                <div className={s.rowActions}>
                  {localizeValue(
                    member && isExpiring(w, member) && (
                      <button
                        data-ui="primary"
                        className={s.primary}
                        disabled={acting}
                        title={displayMessage('copy.ClubStaff.b0fac1d9d1', {
                          p0: text(renewalTerms(w, member).wage),
                          p1: text(renewalTerms(w, member).fee),
                        })}
                        onClick={(event) => {
                          event.currentTarget.focus();
                          setRenewing(id);
                          setTerm(DELEGATED_TERM);
                        }}
                      >
                        {richMessage('copy.ClubStaff.a199caa699')}
                      </button>
                    ),
                  )}
                  {localizeValue(
                    member && TRAINING_COACHES.includes(id) && (
                      // The coach sets the focus by his rule; 훈련 reads it in full (→WEB-43, WEB-70).
                      <button onClick={() => openTraining(id === 'youth' ? 'academy' : 'training')}>
                        {richMessage('copy.ClubStaff.1759b5d978')}
                      </button>
                    ),
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
                    {localizeValue(
                      member
                        ? sourceMessage('copy.LabPage.084c5a6dd7')
                        : sourceMessage('copy.managerHistoryPacking.f163d47d0b'),
                    )}
                  </button>
                </div>
                {/* Whom 코치 기조 would hire here while the level hands hiring to the staff (→STAFF-15). */}
                <details data-ui="disclosure" className={`${s.department} ${management.reference}`}>
                  <summary>{richMessage('copy.ClubStaff.ab7c6e0c2f')}</summary>
                  <p className={s.note}>{localizeValue(STAFF_INFO[id].duty)}</p>
                  <CoachPreview
                    w={w}
                    role={id}
                    title={displayMessage('copy.ClubStaff.cd87e26f98')}
                  />
                </details>
              </li>
            );
          }),
        )}
      </ul>
      {localizeValue(
        role && (
          <Dialog
            label={displayMessage('copy.ClubStaff.aeb9824561', { p0: STAFF_INFO[role].label })}
            onClose={() => {
              setRole(undefined);
              onCancel?.();
            }}
            actions={
              <div className={s.sheetActions}>
                {localizeValue(
                  current && (
                    <button
                      disabled={acting}
                      onClick={() => {
                        void client.command({ type: 'release-staff', role });
                        setRole(undefined);
                      }}
                    >
                      {richMessage('copy.ClubStaff.0021ae0ba5', {
                        p0: owed !== '0' && <> · {localizeValue(plain(owed))}</>,
                      })}
                    </button>
                  ),
                )}
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={acting || !chosen}
                  onClick={async () => {
                    if (!chosen) return;
                    const reply = await client.command({
                      type: 'hire-staff',
                      role,
                      candidate: candidates.findIndex((candidate) => candidate.id === chosen.id),
                      candidateId: chosen.id,
                      term,
                    });
                    if (reply?.ok) setRole(undefined);
                  }}
                >
                  {localizeValue(
                    chosen
                      ? sourceMessage('copy.ClubStaff.269839005c', { p0: chosen.name, p1: term })
                      : sourceMessage('copy.ClubStaff.2d573f96ab'),
                  )}
                </button>
              </div>
            }
          >
            <p className={s.note}>
              {richMessage('copy.ClubStaff.66fe115236', {
                p0: STAFF_INFO[role].duty,
                p1: ' ',
                p2: current
                  ? sourceMessage('copy.ClubStaff.578433e364', {
                      p0: current.name,
                      p1: Math.round(current.ability),
                    })
                  : sourceMessage('team.vacant'),
              })}
            </p>
            {localizeValue(
              candidates.length ? (
                <div
                  className={s.candidates}
                  role="radiogroup"
                  aria-label={displayMessage('copy.ClubStaff.f6184e4c8d')}
                >
                  {localizeValue(
                    candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        role="radio"
                        aria-checked={pick === candidate.id}
                        className={pick === candidate.id ? s.picked : undefined}
                        onClick={() => setPick(candidate.id)}
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
                              {localizeValue(coachAge(w, candidate).replace(/^ · /, ''))}
                              {localizeValue(
                                candidate.ability > (current?.ability ?? 0)
                                  ? sourceMessage('copy.ClubStaff.63a8535984', {
                                      p0: Math.round(candidate.ability - (current?.ability ?? 0)),
                                    })
                                  : '',
                              )}
                              {localizeValue(
                                (candidate.potential ?? 0) > candidate.ability
                                  ? sourceMessage('copy.ClubStaff.4719fc8cca', {
                                      p0: candidate.potential! - candidate.ability,
                                    })
                                  : '',
                              )}
                            </span>
                          </div>
                        </div>
                        <Meter value={candidate.ability} />
                        <small>
                          {localizeValue(
                            candidate.trait
                              ? `${STAFF_TRAIT_INFO[candidate.trait].label} · ${STAFF_TRAIT_INFO[candidate.trait].effect}`
                              : sourceMessage('copy.ClubStaff.7cff642737'),
                          )}
                        </small>
                        <small className={s.impact}>
                          {richMessage('copy.ClubStaff.ff36a2eafa', {
                            p0: hiredImpact(w, role, candidate),
                            p1: staffImpact(w, role),
                          })}
                        </small>
                        <StaffTerms w={w} candidate={candidate} link={false} />
                      </button>
                    )),
                  )}
                </div>
              ) : (
                <p className={s.note}>{richMessage('copy.ClubStaff.6696051fed')}</p>
              ),
            )}
            {localizeValue(
              chosen?.person && (
                <PersonCareerLink id={chosen.person} name={chosen.name} client={client} />
              ),
            )}
            {localizeValue(
              chosen?.club && (
                <p className={s.note}>
                  {richMessage('copy.Rich.dc1e71653d', { p0: <ClubLink w={w} id={chosen.club} /> })}
                </p>
              ),
            )}
            {localizeValue(
              candidates.length > 0 && (
                <TermDial
                  label={displayMessage('copy.ClubStaff.7c33f611a8')}
                  value={term}
                  disabled={acting}
                  onChange={setTerm}
                />
              ),
            )}
            {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
            {localizeValue(
              chosen && (
                <TermCosts
                  w={w}
                  wage={chosen.wage}
                  fee={chosen.fee}
                  compensation={chosen.compensation}
                  term={term}
                  until={w.year + term}
                />
              ),
            )}
            {localizeValue(
              current && owed !== '0' && (
                <p className={s.note}>
                  {richMessage('copy.ClubStaff.be3b746167', {
                    p0: current.name,
                    p1: format(owed),
                    p2: ' ',
                    p3: seasonsLeft(w, current.until),
                  })}
                </p>
              ),
            )}
          </Dialog>
        ),
      )}
      {localizeValue(
        renewing && renewal && renewed && (
          <Dialog
            label={displayMessage('copy.ClubStaff.def7ad57ad', { p0: STAFF_INFO[renewing].label })}
            onClose={() => {
              setRenewing(undefined);
              onCancel?.();
            }}
            actions={
              <div className={s.sheetActions}>
                <button
                  onClick={() => {
                    setRenewing(undefined);
                    onCancel?.();
                  }}
                >
                  {richMessage('common.cancel')}
                </button>
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={acting}
                  onClick={async () => {
                    const reply = await client.command({
                      type: 'renew-staff',
                      role: renewing,
                      term,
                    });
                    if (reply?.ok) setRenewing(undefined);
                  }}
                >
                  {richMessage('copy.ClubStaff.41140416e6', { p0: term })}
                </button>
              </div>
            }
          >
            <p className={s.note}>
              {richMessage('copy.ClubStaff.bda7576c1a', {
                p0: renewal.name,
                p1: Math.round(renewal.ability),
              })}
            </p>
            {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
            <TermDial
              label={displayMessage('copy.ClubStaff.5e29d2ae19')}
              value={term}
              disabled={acting}
              onChange={setTerm}
            />
            <TermCosts
              w={w}
              wage={renewed.wage}
              fee={renewed.fee}
              term={term}
              until={renewed.until}
            />
          </Dialog>
        ),
      )}
    </section>
  );
}

/**
 * The 이적시장's staff views: every candidate for the chosen post as a card with its own 영입 제안,
 * which confirms the seasons and costs before the same hire the post's 선임 sends (→STAFF-15).
 */
export function StaffMarket({
  w,
  client,
  roles,
}: {
  w: World;
  client: GameClient;
  roles: readonly StaffRole[];
}) {
  useTextLocale();
  const acting = useActing();
  const [stored, setRole] = useTaskState<StaffRole>(w.id, `staff-market-${roles[0]}`, roles[0]);
  const role = roles.includes(stored) ? stored : roles[0];
  const [pick, setPick] = useTaskState<string | undefined>(w.id, 'staff-market-pick', undefined);
  const [term, setTerm] = useTaskState<ContractTerm>(w.id, 'staff-market-term', DELEGATED_TERM);
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const projected = useGameState((state) => state.view?.coaches[role]);
  const candidates = projected ?? staffCandidates(w, role);
  const current = w.staff?.find((member) => member.role === role);
  const chosen = candidates.find((candidate) => candidate.id === pick);
  const owed = releaseCost(w, current);
  return (
    <section
      data-surface="panel"
      className={s.staff}
      aria-label={displayMessage('copy.ClubStaff.2d43ec39f3', { p0: STAFF_INFO[role].label })}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.6011c13d9d', { p0: STAFF_INFO[role].label })}</h3>
        <span>
          {richMessage('copy.ClubStaff.ceb2ec9df3', {
            p0: current
              ? `${current.name} · OVR ${Math.round(current.ability)}`
              : sourceMessage('team.vacant'),
          })}
        </span>
      </header>
      {localizeValue(
        roles.length > 1 && (
          <Segments
            label={displayMessage('copy.ClubStaff.fda279cf16')}
            options={roles.map((id) => [id, STAFF_INFO[id].label] as const)}
            value={role}
            onChange={(id) => {
              setRole(id);
              setPick(undefined);
            }}
            wrap
          />
        ),
      )}
      <p className={s.note}>
        {richMessage('copy.ClubStaff.d8d9b7ea7c', {
          p0: STAFF_INFO[role].duty,
          p1: staffImpact(w, role),
        })}
      </p>
      {localizeValue(
        candidates.length ? (
          <div className={s.marketCards}>
            {localizeValue(
              candidates.map((candidate) => (
                <article key={candidate.id} className={s.marketCard} data-surface="inset">
                  <div className={s.candidateHead}>
                    <OvrBadge
                      value={Math.round(candidate.ability)}
                      role="OVR"
                      potential={candidate.potential}
                    />
                    <div>
                      <b>{candidate.name}</b>
                      <span>
                        {localizeValue(coachAge(w, candidate).replace(/^ · /, ''))}
                        {localizeValue(
                          candidate.ability > (current?.ability ?? 0)
                            ? sourceMessage('copy.ClubStaff.63a8535984', {
                                p0: Math.round(candidate.ability - (current?.ability ?? 0)),
                              })
                            : '',
                        )}
                      </span>
                    </div>
                  </div>
                  <Meter value={candidate.ability} />
                  <small>
                    {localizeValue(
                      candidate.trait
                        ? `${STAFF_TRAIT_INFO[candidate.trait].label} · ${STAFF_TRAIT_INFO[candidate.trait].effect}`
                        : sourceMessage('copy.ClubStaff.7cff642737'),
                    )}
                  </small>
                  <small className={s.impact}>
                    {richMessage('copy.ClubStaff.999145c9b0', {
                      p0: hiredImpact(w, role, candidate),
                    })}
                  </small>
                  <StaffTerms w={w} candidate={candidate} />
                  <button
                    type="button"
                    data-ui="primary"
                    className={s.primary}
                    disabled={acting}
                    onClick={() => {
                      setPick(candidate.id);
                      setTerm(DELEGATED_TERM);
                    }}
                  >
                    {richMessage('copy.ClubStaff.6e1d7a0faf')}
                  </button>
                </article>
              )),
            )}
          </div>
        ) : (
          <p className={s.note}>{richMessage('copy.ClubStaff.6696051fed')}</p>
        ),
      )}
      {localizeValue(
        chosen && (
          <Dialog
            label={displayMessage('copy.ClubStaff.c037a387ca', { p0: STAFF_INFO[role].label })}
            onClose={() => setPick(undefined)}
            actions={
              <div className={s.sheetActions}>
                <button onClick={() => setPick(undefined)}>{richMessage('common.cancel')}</button>
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={acting}
                  onClick={async () => {
                    const reply = await client.command({
                      type: 'hire-staff',
                      role,
                      candidate: candidates.findIndex((candidate) => candidate.id === chosen.id),
                      candidateId: chosen.id,
                      term,
                    });
                    if (reply?.ok) setPick(undefined);
                  }}
                >
                  {richMessage('copy.ClubStaff.7fcc7e0be2', { p0: chosen.name, p1: term })}
                </button>
              </div>
            }
          >
            <p className={s.note}>
              {richMessage('copy.ClubStaff.e995612837', {
                p0: chosen.name,
                p1: Math.round(chosen.ability),
                p2: STAFF_INFO[role].label,
                p3: ' ',
                p4: current
                  ? `${current.name} (OVR ${Math.round(current.ability)})`
                  : sourceMessage('team.vacant'),
              })}
            </p>
            {localizeValue(
              chosen.person && (
                <PersonCareerLink id={chosen.person} name={chosen.name} client={client} />
              ),
            )}
            {localizeValue(
              chosen.club && (
                <p className={s.note}>
                  {richMessage('copy.Rich.dc1e71653d', { p0: <ClubLink w={w} id={chosen.club} /> })}
                </p>
              ),
            )}
            <TermDial
              label={displayMessage('copy.ClubStaff.7c33f611a8')}
              value={term}
              disabled={acting}
              onChange={setTerm}
            />
            <TermCosts
              w={w}
              wage={chosen.wage}
              fee={chosen.fee}
              compensation={chosen.compensation}
              term={term}
              until={w.year + term}
            />
            {localizeValue(
              current && owed !== '0' && (
                <p className={s.note}>
                  {richMessage('copy.ClubStaff.e5fab9815d', {
                    p0: current.name,
                    p1: format(owed),
                    p2: ' ',
                    p3: seasonsLeft(w, current.until),
                  })}
                </p>
              ),
            )}
          </Dialog>
        ),
      )}
    </section>
  );
}

/** One criterion: its name, then its control. */
/** 감독 선임 (→STAFF-18): who appoints, the rows the staff follow and whom they would appoint. */
export function ManagerPost({ w }: { w: World; client?: GameClient }) {
  useTextLocale();
  return (
    <section
      data-surface="sheet"
      className={s.decision}
      aria-label={displayMessage('copy.ClubStaff.cb234cd90e')}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.10451c4909')}</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="manager"
        criteria
        auto={sourceMessage('copy.ClubStaff.27781851a7')}
        owner={sourceMessage('copy.ClubStaff.894107efbb')}
      />
      <details data-ui="disclosure" className={management.reference}>
        <summary>{richMessage('copy.ClubStaff.44d280d2a4')}</summary>
        <DirectionFacts w={w} rows={['school', 'manager']} responsibility="manager" />
        <ManagerPreview w={w} title={displayMessage('copy.ClubStaff.d4167cd8d7')} />
      </details>
    </section>
  );
}
/** Whom 선호 학파 and 감독 기조 would appoint if the post fell vacant (→STAFF-18), or why nobody. */
function ManagerPreview({ w, title }: { w: World; title: string }) {
  useTextLocale();
  const preview = managerPickPreview(w),
    pick = preview.pick,
    club = clubOf(w),
    money = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  return (
    <div data-surface="tile" className={s.preview} data-testid="manager-pick">
      <b>{localizeValue(title)}</b>
      {localizeValue(
        pick ? (
          <div className={s.pick}>
            <OvrBadge
              value={pick.ability}
              role={sourceMessage('staff.role.manager')}
              potential={pick.potential}
            />
            <div>
              <span>
                {pick.name} · {localizeValue(STYLE_INFO[pick.style].label)}
              </span>
              <small>
                {richMessage('copy.ClubStaff.c2d7bdbaae', {
                  p0: money(pick.wage),
                  p1: money(pick.fee),
                  p2: pick.compensation && (
                    <>
                      {richMessage('copy.ClubStaff.3e2995c1db', { p0: money(pick.compensation) })}
                    </>
                  ),
                })}
              </small>
              <small>
                {localizeValue(
                  preview.fallback
                    ? sourceMessage('copy.ClubStaff.276ae46c9a')
                    : sourceMessage('copy.ClubStaff.8eb8e5a49d'),
                )}
              </small>
            </div>
          </div>
        ) : (
          <p>{localizeValue(preview.reason)}</p>
        ),
      )}
    </div>
  );
}

/** Whom 코치 기조 would hire today in a department (→STAFF-15), or why nobody. */
function CoachPreview({ w, role, title }: { w: World; role: StaffRole; title: string }) {
  useTextLocale();
  const preview = coachPickPreview(w, role),
    pick = preview.pick,
    c = coachCriteriaOf(w),
    member = (w.staff || []).find((one) => one.role === role),
    contracted = !!member && BigInt(member.wage) > 0n,
    club = clubOf(w),
    money = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  return (
    <div data-surface="tile" className={s.preview} data-testid={`coach-pick-${role}`}>
      <b>{localizeValue(title)}</b>
      {localizeValue(
        pick ? (
          <div className={s.pick}>
            <OvrBadge value={Math.round(pick.ability)} role="OVR" potential={pick.potential} />
            <div>
              <span>
                {pick.name} ·{' '}
                {localizeValue(
                  pick.trait
                    ? STAFF_TRAIT_INFO[pick.trait].label
                    : sourceMessage('copy.ClubStaff.7cff642737'),
                )}
              </span>
              <StaffTerms w={w} candidate={pick} costs={false} />
              <small>
                {richMessage('copy.ClubStaff.adbb8848ea', {
                  p0: money(pick.wage),
                  p1: money(pick.fee),
                  p2: c.term,
                })}
              </small>
              {localizeValue(
                contracted && <small>{richMessage('copy.ClubStaff.c2c0b38fa9')}</small>,
              )}
            </div>
          </div>
        ) : (
          <p>{localizeValue(preview.reason)}</p>
        ),
      )}
    </div>
  );
}

/**
 * 계약 협상 (→CLUB-26): who answers, the rows the staff follow (재계약 기조, the 단장's plan) and
 * what stays fixed; a refusal may leave the player unhappy (→CLUB-27).
 */
export function TalkRulePanel({ w }: { w: World; client?: GameClient }) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  const plan = office.delegation.contracts.plan;
  return (
    <section
      data-surface="sheet"
      className={s.decision}
      aria-label={displayMessage('copy.ClubStaff.81fb576096')}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.5ca939d3e3')}</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="contracts"
        criteria
        auto={sourceMessage('copy.ClubStaff.5fe81d8483')}
        owner={sourceMessage('copy.ClubStaff.670fe07b8a')}
      />
      <DirectionFacts w={w} rows={['renewal']} responsibility="contracts" />
      <ul className={s.fixed}>
        <li>{localizeValue(directionOption(w, 'renewal').summary)}</li>
        <li>{richMessage('copy.ClubStaff.9d5c92492d')}</li>
        <li>{richMessage('delegation.talk.money', { share: sharePercent(plan.share) })}</li>
        <li>{richMessage('copy.ClubStaff.e257a74a0b')}</li>
      </ul>
    </section>
  );
}

/**
 * 제안 응답 (→CLUB-18, CLUB-24): who answers and the sale bar the staff apply, in words.
 */
export function OfferAnswers({ w }: { w: World }) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  const card = cardOf(buildOf(w), 'market').label,
    [bar, prospect] = SALE_BARS[w.build?.market ?? 'standard'],
    [first, second] = office.delegation.sales.plan.stance.sellAbove,
    recruitment = office.delegation.recruitment.plan,
    signing = recruitment.stance.signing,
    code = clubOf(w).country,
    hold = w.build?.market === 'hold';
  return (
    <section
      data-surface="sheet"
      className={s.decision}
      aria-label={displayMessage('copy.ClubStaff.ee9dab61b8')}
    >
      <header>
        <h3>{richMessage('copy.ClubStaff.ba835896f9')}</h3>
      </header>
      <DecisionOwner
        w={w}
        decision="sales"
        criteria
        auto={sourceMessage('copy.ClubStaff.d7d3dab4d0')}
        owner={sourceMessage('copy.ClubStaff.ed0c775102')}
      />
      <DecisionOwner
        w={w}
        decision="recruitment"
        criteria
        auto={sourceMessage('copy.ClubStaff.386ff78aec')}
        owner={sourceMessage('copy.ClubStaff.093dbc6ce0')}
      />
      <DirectionFacts w={w} rows={['market']} responsibility="sales" />
      <ul className={s.fixed}>
        <li>{richMessage('copy.ClubStaff.169f48d4c7')}</li>
        <li>
          {richMessage('copy.ClubStaff.f2a314f736', {
            p0: bar,
            p1: ' ',
            p2: prospect,
            p3: ' ',
            p4: hold
              ? sourceMessage('copy.ClubStaff.f18edf288b')
              : sourceMessage('copy.ClubStaff.131f1f83e6'),
          })}
        </li>
        <li>{richMessage('delegation.offer.cuts', { first, second, weeks: SAFETY_ROUNDS })}</li>
        <li>{richMessage('copy.ClubStaff.5909c8a6d1', { p0: <b>{localizeValue(card)}</b> })}</li>
        <li>
          {richMessage('delegation.offer.signings', {
            upgrades:
              signing.margin === undefined
                ? sourceMessage('delegation.offer.noUpgrades')
                : sourceMessage('copy.ClubStaff.42b9e5f546', {
                    p0: signing.margin,
                    p1: signing.upgrades,
                  }),
            left: compactMoney(recruitment.left, code, w.year),
          })}
        </li>
      </ul>
    </section>
  );
}
