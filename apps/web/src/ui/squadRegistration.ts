import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { World } from '../../../../packages/contracts/src/types';
import { registration, registrationLabel } from '../../../../packages/engine/src/registration';
/** One read model for home, roster and recruitment; registration itself owns every count. */
export function squadRegistration(w: World) {
  const counts = registration(w);
  const value = counts.rule.country
    ? `${counts.counted}/${counts.allowed}${counts.exempt ? sourceMessage('copy.squadRegistration.f3c8318145', { p0: counts.exempt }) : ''}`
    : `${counts.total}/${counts.ceiling}`;
  return {
    ...counts,
    value,
    detail: sourceMessage('copy.squadRegistration.d94a3ad4ab', {
      p0: registrationLabel(counts.rule, counts.allowed),
      p1: counts.estimated ? sourceMessage('copy.squadRegistration.8c415723e1') : '',
      p2: counts.total,
      p3: counts.ceiling,
    }),
    full:
      counts.total >= counts.ceiling || (!counts.rule.exempt && counts.counted >= counts.allowed),
  };
}
