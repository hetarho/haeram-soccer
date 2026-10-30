import o from './OfficeBar.module.css';

/** The desk's title; the shared HUD owns club identity, BETA and cash. */
export function OfficeBar({ title }: { title: string }) {
  return (
    <header className={o.bar} data-ui="office-bar">
      <h2 className={o.title}>
        <span>{title}</span>
      </h2>
    </header>
  );
}
