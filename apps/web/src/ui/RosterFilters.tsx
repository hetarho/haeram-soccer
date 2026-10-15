import { PixelIcon } from './PixelIcon';
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { POSITIONS } from '../../../../packages/contracts/src/player';
import type { PlayerOrder, PlayerScope, PositionFilter } from './playerAnalysis';
import { Dialog } from './Dialog';
import { play } from './motion';
import s from './RosterFilters.module.css';

export interface RosterView {
  scope: PlayerScope;
  role: PositionFilter;
  order: PlayerOrder;
  minutes: number;
}
export const DEFAULT_ROSTER_VIEW: RosterView = {
  scope: 'season',
  role: 'all',
  order: 'roster',
  minutes: 0,
};
const GROUPS: {
  key: keyof RosterView;
  label: string;
  options: { value: RosterView[keyof RosterView]; label: string }[];
}[] = [
  {
    key: 'scope',
    label: '지표 범위',
    options: [
      { value: 'season', label: '이번 시즌' },
      { value: 'career', label: '우리 클럽 통산' },
    ],
  },
  {
    key: 'role',
    label: '포지션',
    options: [
      { value: 'all', label: '전체' },
      ...(['GK', 'DF', 'MF', 'FW'] as const).map((value) => ({ value, label: value })),
      // Every outfield position; a player counts under each he plays at 준수 or better.
      ...POSITIONS.filter((value) => value !== 'GK').map((value) => ({ value, label: value })),
    ],
  },
  {
    key: 'order',
    label: '정렬',
    options: [
      { value: 'roster', label: '선수단 순서' },
      { value: 'ability', label: 'OVR 높은 순' },
      { value: 'minutes', label: '출전 분' },
      { value: 'fatigue', label: '피로 낮은 순' },
      { value: 'goals90', label: '90분당 득점' },
    ],
  },
  {
    key: 'minutes',
    label: '최소 표본',
    options: [0, 90, 180, 450, 900].map((value) => ({
      value,
      label: value ? `${value}분+` : '제한 없음',
    })),
  },
];
/** The non-default choices in display order, e.g. "FWD · 90분당 득점". */
export function rosterViewSummary(view: RosterView) {
  return GROUPS.filter((group) => view[group.key] !== DEFAULT_ROSTER_VIEW[group.key]).map(
    (group) => group.options.find((option) => option.value === view[group.key])!.label,
  );
}
const phone = () => {
  try {
    return matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
};

function Choices({ view, onChange }: { view: RosterView; onChange: (view: RosterView) => void }) {
  return (
    <div className={s.groups}>
      {GROUPS.map((group) => (
        <div key={group.key} className={s.group} role="radiogroup" aria-label={group.label}>
          <span>{group.label}</span>
          <div className={s.chips}>
            {group.options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={view[group.key] === option.value}
                className={s.chip}
                onClick={() => onChange({ ...view, [group.key]: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The roster's view settings behind one icon button in the panel header: a popover under the
 * button on wide screens, the bottom sheet on phones. Choices apply at once.
 */
export function RosterFilters({
  view,
  onChange,
}: {
  view: RosterView;
  onChange: (view: RosterView) => void;
}) {
  const [open, setOpen] = useState<'popover' | 'sheet'>();
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const active = rosterViewSummary(view).length;
  const reset = (
    <button
      type="button"
      className={s.reset}
      disabled={!active}
      onClick={() => onChange(DEFAULT_ROSTER_VIEW)}
    >
      초기화
    </button>
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={s.trigger}
        aria-label={`선수 보기 설정${active ? ` · ${active}개 적용` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={!!open}
        aria-controls={open === 'popover' ? id : undefined}
        data-active={active || undefined}
        onClick={() => setOpen(open ? undefined : phone() ? 'sheet' : 'popover')}
      >
        <PixelIcon name="filter" />
        {active > 0 && <i aria-hidden="true">{active}</i>}
      </button>
      {open === 'sheet' && (
        <Dialog label="선수 보기 설정" onClose={() => setOpen(undefined)}>
          <Choices view={view} onChange={onChange} />
          <div className={s.footer}>{reset}</div>
        </Dialog>
      )}
      {open === 'popover' && (
        <Popover id={id} anchor={trigger} label="선수 보기 설정" onClose={() => setOpen(undefined)}>
          <Choices view={view} onChange={onChange} />
          <div className={s.footer}>{reset}</div>
        </Popover>
      )}
    </>
  );
}

/**
 * Anchored under its trigger, right edges aligned, in the top layer so no panel clips it. It
 * closes on an outside tap, Escape (focus back on the trigger) or any modal sheet opening.
 */
function Popover({
  id,
  anchor,
  label,
  onClose,
  children,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const popup = panel.current!;
    const layered = typeof popup.showPopover === 'function';
    if (layered) popup.showPopover();
    const place = () => {
      const target = anchor.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const right = Math.max(8, width - rect.right);
      const top = rect.bottom + 8;
      popup.style.top = `${top}px`;
      popup.style.right = `${right}px`;
      popup.style.setProperty('--room', `${Math.max(160, innerHeight - top - 12)}px`);
      popup.style.setProperty(
        '--caret',
        `${Math.max(14, width - right - (rect.left + rect.width / 2) - 7)}px`,
      );
    };
    place();
    play(
      popup,
      [
        { opacity: 0, transform: 'translateY(-6px) scale(0.96)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 180 },
    );
    popup.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const away = (event: Event) => {
      const target = event.target as Node;
      if (!popup.contains(target) && !anchor.current?.contains(target)) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
      anchor.current?.focus({ preventScroll: true });
    };
    const sheet = (event: Event) => {
      if ((event as CustomEvent<{ open: boolean }>).detail?.open) close.current();
    };
    // The content region scrolls, not the document: follow the trigger through any scroll.
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('haeram:dialog', sheet);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('haeram:dialog', sheet);
      if (layered && popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [anchor]);
  return (
    <div
      ref={panel}
      id={id}
      className={s.popover}
      popover="manual"
      role="dialog"
      aria-label={label}
    >
      <div className={s.popoverBody}>
        <b className={s.title}>{label}</b>
        {children}
      </div>
    </div>
  );
}
