import { PixelIcon } from './PixelIcon';
import { openPrimary } from './state';
import o from './OfficeBar.module.css';

/** A clubhouse room's bar: its doors stand in the owner's office, so it returns there. */
export function RoomBar({ title }: { title: string }) {
  return (
    <OfficeBar back={{ label: '사무실', onClick: () => openPrimary('business') }} title={title} />
  );
}

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
