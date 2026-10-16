import type { World } from '../../../../packages/contracts/src/types';
import { registration, registrationLabel } from '../../../../packages/engine/src/registration';
/** One read model for home, roster and recruitment; registration itself owns every count. */
export function squadRegistration(w: World) {
  const counts = registration(w);
  const value = counts.rule.country
    ? `${counts.counted}/${counts.allowed}${counts.exempt ? ` · 제외 ${counts.exempt}` : ''}`
    : `${counts.total}/${counts.ceiling}`;
  return {
    ...counts,
    value,
    detail: `등록 한도 ${registrationLabel(counts.rule, counts.allowed)}${counts.estimated ? ' · 추정' : ''} · 전체 ${counts.total}/${counts.ceiling}`,
    full:
      counts.total >= counts.ceiling || (!counts.rule.exempt && counts.counted >= counts.allowed),
  };
}
