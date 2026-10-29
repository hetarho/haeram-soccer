import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { World } from '../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import type { PixelIconName } from './PixelIcon';
import { ClubCrest } from './ClubCrest';
import { FacilityOverview } from './FacilityOverview';
import { officeFacts } from './officeSummary';
import { PixelIcon } from './PixelIcon';
import { BUSINESS_TABS, openApprovalRequest, type BusinessView } from './state';
import o from './OfficeLobby.module.css';

const ICONS: Record<Exclude<BusinessView, 'identity'>, PixelIconName> = {
  players: 'people',
  staff: 'people',
  investment: 'star',
  sponsor: 'medal',
};

/**
 * The owner office's lobby (→WEB-39): the room itself, then one card per area with what stands
 * there now, so the owner picks a desk to work at rather than a tab.
 */
export function OfficeLobby({
  w,
  sponsors,
  pending = [],
  onOpen,
  onOverview,
}: {
  w: World;
  sponsors: readonly SponsorSlotView[];
  pending?: readonly StopReason[];
  onOpen: (view: BusinessView) => void;
  onOverview: () => void;
}) {
  const facts = officeFacts(w, sponsors, pending);
  return (
    <section className={o.lobby} aria-label="구단주 사무실" data-testid="office-lobby">
      <section className={o.pending} aria-label="결재 대기 업무">
        <h2>결재 대기 {pending.length}건</h2>
        {pending.length ? (
          pending.map((item) => (
            <button key={item.id} data-ui="link" onClick={() => openApprovalRequest(w.id, item)}>
              {item.title} · 검토하기
            </button>
          ))
        ) : (
          <p>현재 결재 대기 업무가 없어요.</p>
        )}
      </section>
      <FacilityOverview w={w} kind="manager" title="구단주 사무실">
        결재 대기 {pending.length}건 · 선수·스태프 계약, 재정과 후원 관리
      </FacilityOverview>
      <button type="button" data-ui="primary" onClick={onOverview}>
        결재라인 모아보기
      </button>
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
