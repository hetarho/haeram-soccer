import type { World } from '../../../../../../packages/contracts/src/types';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { FacilityArt } from '../../../entities/office/ui/FacilityArt';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { INVESTMENT_AREAS } from '../../../shared/routing/investmentAreas';
import { openInvestment } from '../../../shared/routing/state';
import s from '../../../shared/ui/styles/InvestmentView.module.css';

/**
 * The office's working areas under its home entrance (→WEB-11/116): each opens its controls and
 * the sum of what they do. The office itself lists the effects in force.
 */
export function InvestmentGallery({ w, className }: { w: World; className?: string }) {
  useTextLocale();
  return (
    <nav
      className={`${s.gallery} ${s.homeGallery} ${className ?? ''}`}
      data-home-part="areas"
      aria-label={displayMessage('home.areas.label')}
    >
      {INVESTMENT_AREAS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={s.destination}
          aria-label={displayMessage('copy.InvestmentView.8767428e28', { p0: item.title })}
          onClick={() => openInvestment(item.id)}
        >
          <FacilityArt
            kind={item.art}
            world={w}
            view={item.id === 'stadium' ? 'exterior' : undefined}
            className={s.art}
          />
          <span className={s.overlay}>
            <b>{localizeValue(item.title)}</b>
            <span>{localizeValue(item.description)}</span>
          </span>
          <span className={s.enter} aria-hidden="true">
            <PixelIcon name="chevronRight" size={24} />
          </span>
        </button>
      ))}
    </nav>
  );
}
