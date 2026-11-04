import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { careerAssessment } from '../../../../packages/engine/src/career-assessment';
import { STAFF_INFO, staffMember } from '../../../../packages/engine/src/staff-info';
import { scoutRangeScale } from '../../../../packages/engine/src/owner-traits';
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
 * chief scout's range ("보통~높음"), as wide as the scout's ability allows and `scale` narrows it
 * (원석 감별사, →OWNER-5).
 */
export function gradeLabel(grade: Grade, own: boolean, scoutAbility?: number, scale = 1) {
  if (own) return GRADE_LABEL[grade];
  const [low, high] = personalityRange(grade, scoutAbility, scale);
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
 * for our own players — adaptation, its multiplier and an 적응 실패 flag. `compact` sits under a
 * card that already shows his rating and position (→WEB-109), so it leaves out its own head.
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
  useTextLocale();
  const assessment = careerAssessment(w, player, own);
  const ovr = overall(player);
  const slot = own ? startingSlot(w, player) : undefined;
  const multiplier = own ? ownMultiplier(player) : 1;
  const effective = slot
    ? Math.round(slotOvr(player, slot, multiplier))
    : Math.round(mainOvr(player) * multiplier);
  const scout = staffMember(w, 'scout')?.ability;
  const range = scoutRangeScale(w);
  const unsettled = own && player.unsettled !== undefined;
  return (
    <section
      className={`${s.profile} ${compact ? s.compact : ''}`}
      aria-label={displayMessage('copy.PlayerProfile.2f5041549c')}
    >
      {localizeValue(
        !compact && (
          <div className={s.head}>
            <OvrBadge value={ovr} role={player.position} large />
            <div className={s.headText}>
              <b>{localizeValue(POSITION_LABEL[player.position])}</b>
              <span data-testid="profile-effective">
                {richMessage('copy.PlayerProfile.4e1f9baf86', {
                  p0: effective,
                  p1: slot
                    ? sourceMessage('copy.PlayerProfile.24ed34f7e7', {
                        p0: slot.position,
                        p1: ROLE_LABEL[slot.role],
                      })
                    : '',
                })}
              </span>
              {localizeValue(
                own && (
                  <span data-testid="profile-adaptation">
                    {richMessage('copy.PlayerProfile.14f671458b', {
                      p0: player.adaptation.toFixed(2),
                      p1: multiplierLabel(multiplier),
                      p2: unsettled && (
                        <em data-ui="label" className={s.flag}>
                          {richMessage('copy.PlayerProfile.b45089d8aa')}
                        </em>
                      ),
                    })}
                  </span>
                ),
              )}
            </div>
          </div>
        ),
      )}
      <div className={s.columns}>
        <PositionMap positions={player.positions} main={player.position} />
        <div className={s.side}>
          <h4>{richMessage('copy.PlayerProfile.d23767d850')}</h4>
          <ul className={s.roles}>
            {localizeValue(
              bestRoles(player).map(({ role, ovr: value }) => (
                <li key={role}>
                  <span>{localizeValue(ROLE_LABEL[role])}</span>
                  <b>{localizeValue(value)}</b>
                </li>
              )),
            )}
          </ul>
          <h4>{richMessage('copy.PlayerProfile.9b3edda555')}</h4>
          <dl className={s.personality} data-testid="profile-personality">
            {localizeValue(
              (Object.keys(PERSONALITY_LABEL) as (keyof Personality)[]).map((key) => (
                <div key={key}>
                  <dt>{localizeValue(PERSONALITY_LABEL[key])}</dt>
                  <dd>{localizeValue(gradeLabel(player.personality[key], own, scout, range))}</dd>
                </div>
              )),
            )}
          </dl>
          {localizeValue(
            !own && (
              <small className={s.note}>{richMessage('copy.PlayerProfile.b532a0bda0')}</small>
            ),
          )}
          <h4>{richMessage('copy.PlayerProfile.082cda7da0')}</h4>
          <dl className={s.personality} data-testid="profile-aptitude">
            <div>
              <dt>{richMessage('copy.PlayerProfile.5f964720b6')}</dt>
              <dd>
                {localizeValue(
                  assessment.coaching ?? sourceMessage('copy.PlayerProfile.6a9f94258b'),
                )}
              </dd>
            </div>
            <div>
              <dt>{richMessage('copy.PlayerProfile.38c11fbcf4')}</dt>
              <dd>
                {localizeValue(
                  assessment.managerial ?? sourceMessage('copy.PlayerProfile.6a9f94258b'),
                )}
              </dd>
            </div>
            {localizeValue(
              assessment.specialty && (
                <div>
                  <dt>{richMessage('copy.PlayerProfile.502ea188a3')}</dt>
                  <dd>{localizeValue(STAFF_INFO[assessment.specialty].label)}</dd>
                </div>
              ),
            )}
          </dl>
          <small className={s.note}>
            {richMessage('copy.PlayerProfile.e04f0eef1f', {
              p0: !own && sourceMessage('copy.PlayerProfile.8b0d4bfaae'),
            })}
          </small>
          <h4>{richMessage('copy.PlayerCompare.2e0c7616cd')}</h4>
          <p className={s.traits}>
            {localizeValue(
              player.traits.length
                ? player.traits.map((trait) => (
                    <span data-ui="label" key={trait}>
                      {localizeValue(TRAIT_LABEL[trait])}
                    </span>
                  ))
                : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
            )}
          </p>
        </div>
      </div>
      <div className={s.groups} data-testid="profile-attributes">
        {localizeValue(
          ATTRIBUTE_GROUPS.map((group) => (
            <div key={group.label} className={s.group}>
              <h4>{localizeValue(group.label)}</h4>
              {localizeValue(
                group.attributes.map((attribute) => {
                  const value = Math.round(player.attrs[attribute]);
                  return (
                    <div
                      key={attribute}
                      className={s.bar}
                      aria-label={localizeValue(`${ATTRIBUTE_LABEL[attribute]} ${value}`)}
                    >
                      <span>{localizeValue(ATTRIBUTE_LABEL[attribute])}</span>
                      <span data-ui="attribute-meter" aria-hidden="true">
                        <i
                          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                          data-tone={value >= 75 ? 'high' : value >= 60 ? 'mid' : 'low'}
                        />
                      </span>
                      <b>{localizeValue(value)}</b>
                    </div>
                  );
                }),
              )}
            </div>
          )),
        )}
      </div>
    </section>
  );
}
