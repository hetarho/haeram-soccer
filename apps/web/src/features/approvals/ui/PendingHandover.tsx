import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { RESPONSIBILITY_LABELS } from '../../../entities/office/lib/intervention';
import type { OfficeProposal } from '../../../entities/office/lib/officeChanges';
import s from '../../../shared/ui/styles/OwnerOffice.module.css';

export function PendingHandover({ proposal }: { proposal: OfficeProposal }) {
  useTextLocale();
  if (!proposal.pending.length) return null;
  return (
    <section className={s.preview} aria-label={displayMessage('copy.OwnerOfficeView.5c967dce5a')}>
      <h3>{richMessage('copy.OwnerOfficeView.39cc3c0774')}</h3>
      <ul>
        {localizeValue(
          proposal.pending.map((item) => (
            <li key={item.key}>
              {localizeValue(
                item.count > 0 && (
                  <>
                    {richMessage('copy.OwnerOfficeView.21aab38c4f', {
                      p0: RESPONSIBILITY_LABELS[item.key],
                      p1: item.count,
                      p2: ' ',
                      p3:
                        item.to === 'delegated'
                          ? sourceMessage('copy.OwnerOfficeView.e0becc4639')
                          : sourceMessage('copy.OwnerOfficeView.ae39dc2655'),
                    })}
                  </>
                ),
              )}
              {localizeValue(
                (item.held ?? 0) > 0 && (
                  <>{richMessage('copy.OwnerOfficeView.01e9d1412f', { p0: item.held })}</>
                ),
              )}
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
