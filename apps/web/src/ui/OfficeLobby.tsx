import type { World } from '../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import type { PixelIconName } from './PixelIcon';
import { ClubCrest } from './ClubCrest';
import { FacilityArt } from './FacilityArt';
import { officeFacts } from './officeSummary';
import { PixelIcon } from './PixelIcon';
import { BUSINESS_TABS, type BusinessView } from './state';
import { useStrategies } from './strategies';
import o from './OfficeLobby.module.css';

const ICONS: Record<Exclude<BusinessView, 'identity'>, PixelIconName> = {
  strategy: 'trend',
  build: 'home',
  finance: 'star',
  sponsor: 'medal',
  office: 'check',
};

/**
 * The owner office's lobby (→WEB-39): the room itself, then one card per area with what stands
 * there now, so the owner picks a desk to work at rather than a tab.
 */
export function OfficeLobby({
  w,
  sponsors,
  onOpen,
}: {
  w: World;
  sponsors: readonly SponsorSlotView[];
  onOpen: (view: BusinessView) => void;
}) {
  const saved = useStrategies((state) => state.items);
  const facts = officeFacts(w, sponsors, saved);
  return (
    <section className={o.lobby} aria-label="구단주 사무실" data-testid="office-lobby">
      <FacilityArt kind="manager" world={w} className={o.room} eager />
      <ul className={o.areas} aria-label="사무실 업무">
        {BUSINESS_TABS.map(([view, label]) => (
          <li key={view}>
            <button
              type="button"
              className={o.area}
              data-office-area={view}
              aria-label={label}
              aria-describedby={`office-fact-${view}`}
              onClick={(event) => {
                event.currentTarget.focus();
                onOpen(view);
              }}
            >
              <span className={o.icon} aria-hidden="true">
                {view === 'identity' ? (
                  <ClubCrest w={w} id={w.playerClub} size={28} />
                ) : (
                  <PixelIcon name={ICONS[view]} size={22} />
                )}
              </span>
              <span className={o.text}>
                <b>{label}</b>
                <small id={`office-fact-${view}`}>
                  {view === 'identity' ? '엠블럼과 유니폼' : facts[view]}
                </small>
              </span>
              <PixelIcon name="chevronRight" size={14} className={o.more} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
