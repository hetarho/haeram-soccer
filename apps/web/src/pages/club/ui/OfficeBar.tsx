import { localizeValue, useTextLocale } from '../../../presentation/text';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import o from './OfficeBar.module.css';

/** Local desk navigation; the shared HUD owns club identity, BETA and cash. */
export function OfficeBar({
  back,
  title,
}: {
  back?: { label: string; onClick: () => void };
  title: string;
}) {
  useTextLocale();
  return (
    <header className={o.bar} data-ui="office-bar">
      {localizeValue(
        back && (
          <button data-ui="link" type="button" className={o.back} onClick={back.onClick}>
            <PixelIcon name="chevronLeft" size={16} />
            {localizeValue(back.label)}
          </button>
        ),
      )}
      <h2 className={o.title}>
        <span>{localizeValue(title)}</span>
      </h2>
    </header>
  );
}
