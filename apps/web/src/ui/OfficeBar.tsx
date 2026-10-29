import { PixelIcon } from './PixelIcon';
import o from './OfficeBar.module.css';

/** Local desk navigation; the shared HUD owns club identity, BETA and cash. */
export function OfficeBar({
  back,
  title,
}: {
  back?: { label: string; onClick: () => void };
  title: string;
}) {
  return (
    <header className={o.bar} data-ui="office-bar">
      {back && (
        <button data-ui="link" type="button" className={o.back} onClick={back.onClick}>
          <PixelIcon name="chevronLeft" size={16} />
          {back.label}
        </button>
      )}
      <h2 className={o.title}>
        <span>{title}</span>
      </h2>
    </header>
  );
}
