import { localizeValue, useTextLocale } from '../../../presentation/text';
import type { StaffRole } from '../../../../../../packages/contracts/src/types';
import { useLocale } from '../../../presentation/react';
import s from './StaffRoleBadge.module.css';

/** The label stays live over the theme's portable, informational job-colour skin. */
export function StaffRoleBadge({ post }: { post: StaffRole | 'manager' }) {
  useTextLocale();
  const { t } = useLocale();
  const label = t(`staff.role.${post}`);
  return (
    <span
      className={s.badge}
      data-ui="staff-role-badge"
      data-post={post}
      title={localizeValue(label)}
    >
      <span className={s.label}>{localizeValue(label)}</span>
    </span>
  );
}
