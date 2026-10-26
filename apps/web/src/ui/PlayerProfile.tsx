import { careerAssessment } from '../../../../packages/engine/src/career-assessment';
import { STAFF_INFO } from '../../../../packages/engine/src/staff';
import type { Grade, Personality } from '../../../../packages/contracts/src/player';
import type { Player, World } from '../../../../packages/contracts/src/types';
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  GRADE_LABEL,
  mainOvr,
  ovrAt,
  PERSONALITY_LABEL,
  personalityRange,
  POSITION_LABEL,
  ROLE_LABEL,
  rolesAt,
  TRAIT_LABEL,
} from '../../../../packages/engine/src/player';
import { staffMember } from '../../../../packages/engine/src/staff';
import {
  formationOf,
  overall,
  ownMultiplier,
  slotOvr,
} from '../../../../packages/engine/src/player-state';
import { ownStarters } from '../../../../packages/engine/src/world';
import { OvrBadge } from './OvrBadge';
import { PositionMap } from './FormationPitch';
import s from './PlayerProfile.module.css';

/** A multiplier as football media print it: ×1, ×0.95, ×1.025 — three decimals only if needed. */
export function multiplierLabel(value: number) {
  return `×${Number(value.toFixed(3))}`;
}
/** His best roles at his main position, best first, with his OVR in each (→PLAYER-5, PLAYER-6). */
export function bestRoles(player: Pick<Player, 'attrs' | 'position'>, count = 3) {
  return rolesAt(player.position)
    .map((role) => ({ role, ovr: Math.round(ovrAt(player.attrs, player.position, role)) }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, count);
}
/**
 * A personality grade as the owner sees it (→PLAYER-18): exact for his own players, otherwise the
 * chief scout's range ("보통~높음"), as wide as the scout's ability allows.
 */
export function gradeLabel(grade: Grade, own: boolean, scoutAbility?: number) {
  if (own) return GRADE_LABEL[grade];
  const [low, high] = personalityRange(grade, scoutAbility);
  return low === high ? GRADE_LABEL[low] : `${GRADE_LABEL[low]}~${GRADE_LABEL[high]}`;
}
/** The slot a player of ours holds in the XI, if he starts. */
function startingSlot(w: World, player: Player) {
  const index = ownStarters(w).findIndex((p) => p.id === player.id);
  return index < 0 ? undefined : formationOf(w.tactic)[index];
}

/**
 * A player read as football media would (→WEB-59, PLAYER-18): OVR and 실효 OVR, his positions on a
 * pitch by level, the 16 attributes by group, his best roles, personality and play traits, and —
 * for our own players — adaptation, its multiplier and an 적응 실패 flag.
 */
export function PlayerProfile({
  w,
  player,
  own,
  compact = false,
}: {
  w: World;
  player: Player;
  own: boolean;
  compact?: boolean;
}) {
  const assessment = careerAssessment(w, player, own);
  const ovr = overall(player);
  const slot = own ? startingSlot(w, player) : undefined;
  const multiplier = own ? ownMultiplier(player) : 1;
  const effective = slot
    ? Math.round(slotOvr(player, slot, multiplier))
    : Math.round(mainOvr(player) * multiplier);
  const scout = staffMember(w, 'scout')?.ability;
  const unsettled = own && player.unsettled !== undefined;
  return (
    <section className={`${s.profile} ${compact ? s.compact : ''}`} aria-label="선수 프로필">
      <div className={s.head}>
        <OvrBadge value={ovr} role={player.position} large />
        <div className={s.headText}>
          <b>{POSITION_LABEL[player.position]}</b>
          <span data-testid="profile-effective">
            실효 OVR {effective}
            {slot ? ` · 선발 ${slot.position} ${ROLE_LABEL[slot.role]}` : ''}
          </span>
          {own && (
            <span data-testid="profile-adaptation">
              적응도 {player.adaptation.toFixed(2)} · {multiplierLabel(multiplier)}
              {unsettled && <em className={s.flag}>적응 실패</em>}
            </span>
          )}
        </div>
      </div>
      <div className={s.columns}>
        <PositionMap positions={player.positions} main={player.position} />
        <div className={s.side}>
          <h4>주요 역할</h4>
          <ul className={s.roles}>
            {bestRoles(player).map(({ role, ovr: value }) => (
              <li key={role}>
                <span>{ROLE_LABEL[role]}</span>
                <b>{value}</b>
              </li>
            ))}
          </ul>
          <h4>성격</h4>
          <dl className={s.personality} data-testid="profile-personality">
            {(Object.keys(PERSONALITY_LABEL) as (keyof Personality)[]).map((key) => (
              <div key={key}>
                <dt>{PERSONALITY_LABEL[key]}</dt>
                <dd>{gradeLabel(player.personality[key], own, scout)}</dd>
              </div>
            ))}
          </dl>
          {!own && <small className={s.note}>성격은 수석 스카우트가 본 범위예요.</small>}
          <h4>지도자 자질</h4>
          <dl className={s.personality} data-testid="profile-aptitude">
            <div>
              <dt>코치 자질</dt>
              <dd>{assessment.coaching ?? '평가 없음'}</dd>
            </div>
            <div>
              <dt>감독 자질</dt>
              <dd>{assessment.managerial ?? '평가 없음'}</dd>
            </div>
            {assessment.specialty && (
              <div>
                <dt>코칭 전문 분야</dt>
                <dd>{STAFF_INFO[assessment.specialty].label}</dd>
              </div>
            )}
          </dl>
          <small className={s.note}>
            선수 OVR과 별개의 자질 평가예요.{!own && ' 수석 스카우트가 본 범위예요.'}
          </small>
          <h4>플레이 특성</h4>
          <p className={s.traits}>
            {player.traits.length
              ? player.traits.map((trait) => <span key={trait}>{TRAIT_LABEL[trait]}</span>)
              : '없음'}
          </p>
        </div>
      </div>
      <div className={s.groups} data-testid="profile-attributes">
        {ATTRIBUTE_GROUPS.map((group) => (
          <div key={group.label} className={s.group}>
            <h4>{group.label}</h4>
            {group.attributes.map((attribute) => {
              const value = Math.round(player.attrs[attribute]);
              return (
                <div
                  key={attribute}
                  className={s.bar}
                  aria-label={`${ATTRIBUTE_LABEL[attribute]} ${value}`}
                >
                  <span>{ATTRIBUTE_LABEL[attribute]}</span>
                  <i
                    style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                    data-tone={value >= 75 ? 'high' : value >= 60 ? 'mid' : 'low'}
                  />
                  <b>{value}</b>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
