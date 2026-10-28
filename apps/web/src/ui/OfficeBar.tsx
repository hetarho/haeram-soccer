import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { BetaMark } from './BetaMark';
import { ClubCrest } from './ClubCrest';
import { HudCash } from './HudCash';
import { PixelIcon } from './PixelIcon';
import o from './OfficeBar.module.css';

/**
 * The owner office's only chrome (→WEB-39): a way back, the place's name under our crest with the
 * BETA mark (→WEB-101) and the cash, which stays pinned to the top right as the HUD keeps it
 * everywhere else.
 */
export function OfficeBar({
  back,
  title,
  client,
}: {
  back: { label: string; onClick: () => void };
  title: string;
  client?: GameClient;
}) {
  const w = useGameState((state) => state.view?.world);
  return (
    <header className={o.bar} data-ui="office-bar">
      <button data-ui="link" type="button" className={o.back} onClick={back.onClick}>
        <PixelIcon name="chevronLeft" size={16} />
        {back.label}
      </button>
      <div className={o.centre}>
        <h2 className={o.title}>
          {w && <ClubCrest w={w} id={w.playerClub} size={22} className={o.crest} />}
          <span>{title}</span>
        </h2>
        {/* Beside the place name, as the HUD carries it beside the club name (→WEB-101). */}
        <BetaMark />
      </div>
      <div className={o.cash}>
        <HudCash client={client} />
      </div>
    </header>
  );
}
