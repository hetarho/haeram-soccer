import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { ClubProfile } from '../../../../../../packages/contracts/src/owner';
import type { Read } from '../../../shared/lib';
import { Dialog } from '../../../shared/ui/Dialog';
import { TabList, TabPanel } from '../../../shared/ui/PageTabs';
import { HistoryPanel, SquadPanel, StaffPanel } from './ProfilePanels';
import s from './ClubDetail.module.css';

export type ClubDetailTab = 'overview' | 'squad' | 'staff' | 'history';
const TABS = [
  ['overview', sourceMessage('copy.stories.dc015df639')],
  ['squad', sourceMessage('copy.areas.f33435e513')],
  ['staff', sourceMessage('copy.investmentAreas.243be11e44')],
  ['history', sourceMessage('copy.ClubDetail.4f5275b217')],
] as const satisfies readonly (readonly [ClubDetailTab, string])[];

/**
 * One club's detail, wherever it opens (→WEB-15, WEB-58): its identity and the 개요 · 선수단 ·
 * 코치진 · 역사 tabs stay on top, and the tab's content scrolls below them in a dialog of one
 * height. The opener supplies what only it knows — the identity line, the 개요 (a season's
 * standing in play, the price before a takeover) and any footer actions — and the club's profile
 * read; the other tabs read the profile the same way everywhere.
 */
export function ClubDetail({
  name,
  crest,
  lines,
  badge,
  overview,
  profile,
  onPlayer,
  onPerson,
  actions,
  onClose,
  testId,
}: {
  name: string;
  crest?: ReactNode;
  /** Short facts under the name: division, 우리 팀, a project in progress. */
  lines?: ReactNode;
  /** The headline rating beside the name. */
  badge?: ReactNode;
  overview: ReactNode;
  profile: Read<ClubProfile>;
  /** Opens a squad player's detail; without it the squad is read-only. */
  onPlayer?: (id: string) => void;
  /** Opens a coach's career; without it the 코치진 is read-only. */
  onPerson?: (person: string, name: string) => void;
  actions?: ReactNode;
  onClose: () => void;
  testId?: string;
}) {
  useTextLocale();
  const [tab, setTab] = useState<ClubDetailTab>('overview');
  const idPrefix = `club-${useId().replace(/:/g, '')}`;
  const panel = useRef<HTMLDivElement>(null);
  const pick = (next: ClubDetailTab) => {
    setTab(next);
    // A new tab starts at its top, not where the last one was scrolled to.
    panel.current?.closest('[data-ui="dialog-body"]')?.scrollTo({ top: 0 });
  };
  return (
    <Dialog
      label={localizeValue(name)}
      wide
      fixed
      onClose={onClose}
      actions={actions}
      summary={
        <div data-testid={testId && `${testId}-head`}>
          <div className={s.head}>
            {localizeValue(crest)}
            <div>
              <h2>{localizeValue(name)}</h2>
              {localizeValue(lines)}
            </div>
            {localizeValue(badge)}
          </div>
          <TabList
            tabs={TABS}
            value={tab}
            onChange={pick}
            label={displayMessage('copy.ClubDetail.6cc7ea176a', { p0: name })}
            idPrefix={idPrefix}
          />
        </div>
      }
    >
      <div ref={panel} data-testid={testId}>
        <TabPanel idPrefix={idPrefix} value={tab}>
          <div className={s.panel}>
            {localizeValue(tab === 'overview' && overview)}
            {localizeValue(tab === 'squad' && <SquadPanel profile={profile} onPlayer={onPlayer} />)}
            {localizeValue(tab === 'staff' && <StaffPanel profile={profile} onPerson={onPerson} />)}
            {localizeValue(tab === 'history' && <HistoryPanel profile={profile} />)}
          </div>
        </TabPanel>
      </div>
    </Dialog>
  );
}
