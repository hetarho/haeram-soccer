import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import s from './Select.module.css';
import { play } from './motion';

type Declaration = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
  label?: string;
};
type Choice = { value: string; label: ReactNode; text: string; disabled?: boolean; group?: string };
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<Declaration>(child) ? textOf(child.props.children) : String(child),
    )
    .join('');
}
function choicesOf(children: ReactNode, group?: string): Choice[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<Declaration>(child)) return [];
    if (child.type === 'option')
      return [
        {
          value: String(child.props.value ?? textOf(child.props.children)),
          label: child.props.children,
          text: textOf(child.props.children),
          disabled: child.props.disabled,
          group,
        },
      ];
    return choicesOf(child.props.children, child.type === 'optgroup' ? child.props.label : group);
  });
}
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

export function Select({
  value,
  onValueChange,
  children,
  disabled,
  className,
  name,
  ...props
}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const lookup = useRef({ text: '', at: 0 });
  const id = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState('');
  const choices = choicesOf(children);
  const current = choices.find((choice) => choice.value === String(value));
  const available = choices.filter((choice) => choice.value !== '');
  const enabled = available.filter((choice) => !choice.disabled);
  const blocked = disabled || !enabled.length;
  const close = (focus = false) => {
    // Close the native layer before Tab's default focus move (Firefox otherwise restores it later).
    if (list.current?.matches(':popover-open')) list.current.hidePopover();
    setOpen(false);
    if (focus) trigger.current?.focus({ preventScroll: true });
  };
  const show = (initial?: string) => {
    if (blocked) return;
    lookup.current = { text: '', at: 0 };
    setHighlight(
      initial ||
        enabled.find((choice) => choice.value === String(value))?.value ||
        enabled[0]?.value ||
        '',
    );
    trigger.current?.focus({ preventScroll: true });
    setOpen(true);
  };
  const choose = (choice: Choice) => {
    if (blocked || choice.disabled) return;
    close(true);
    if (choice.value !== String(value)) onValueChange(choice.value);
  };
  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);
  useLayoutEffect(() => {
    if (!open || blocked || !list.current || !trigger.current) return;
    const popup = list.current;
    const position = () => {
      const anchor = trigger.current!.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0,
        top = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth,
        height = viewport?.height || innerHeight;
      const popupWidth = Math.min(Math.max(anchor.width, 220), width - 24);
      const below = Math.max(0, top + height - anchor.bottom - 18);
      const above = Math.max(0, anchor.top - top - 18);
      const upwards = below < Math.min(180, popup.scrollHeight) && above > below;
      const maxHeight = Math.min(360, upwards ? above : below);
      popup.style.width = `${popupWidth}px`;
      popup.style.maxHeight = `${maxHeight}px`;
      popup.style.left = `${Math.max(left + 12, Math.min(anchor.left, left + width - popupWidth - 12))}px`;
      popup.style.top = `${upwards ? anchor.top - Math.min(popup.scrollHeight, maxHeight) - 6 : anchor.bottom + 6}px`;
    };
    popup.showPopover();
    position();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!popup.contains(event.target as Node)) position();
    };
    const blur = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!popup.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', blur);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', blur);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [open, blocked]);
  // Animate only a real opening; repositioning re-shows the popover and must not replay it.
  useEffect(() => {
    if (open)
      play(
        list.current,
        [
          { opacity: 0, transform: 'translateY(-6px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 160 },
      );
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${highlight}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight, id]);
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (blocked) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      const active = enabled.find((choice) => choice.value === highlight);
      if (open && active) choose(active);
      else show();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = enabled.findIndex((choice) => choice.value === highlight);
      const next =
        event.key === 'Home'
          ? enabled[0]
          : event.key === 'End'
            ? enabled.at(-1)
            : enabled[
                (Math.max(0, index) + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) %
                  enabled.length
              ];
      if (!open) show(event.key === 'Home' || event.key === 'End' ? next?.value : undefined);
      else if (next) setHighlight(next.value);
      lookup.current.text = '';
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const at = performance.now();
      const previous = at - lookup.current.at < 700 ? lookup.current.text : '';
      const text = previous + event.key.toLocaleLowerCase();
      const search = [...text].every((letter) => letter === text[0]) ? text[0] : text;
      const index = enabled.findIndex((choice) => choice.value === highlight);
      const ordered = [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)];
      const match = ordered.find(
        (choice) =>
          choice.text.toLocaleLowerCase().startsWith(search) ||
          choice.value.toLocaleLowerCase().startsWith(search),
      );
      if (!open) show(match?.value);
      else if (match) setHighlight(match.value);
      lookup.current = { text, at };
    }
  };
  return (
    <>
      {name && <input type="hidden" name={name} value={value} disabled={blocked} />}
      <button
        {...props}
        ref={trigger}
        type="button"
        className={`${s.trigger} ${className || ''}`}
        disabled={blocked}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open && !blocked}
        aria-controls={open && !blocked ? id : undefined}
        aria-activedescendant={open && !blocked ? `${id}-${highlight}` : undefined}
        data-select-trigger=""
        data-state={open && !blocked ? 'open' : 'closed'}
        data-value={String(value)}
        onClick={() => (open ? close() : show())}
        onKeyDown={key}
      >
        <span className={s.value}>{current?.label || '선택하세요'}</span>
        <svg
          className={s.chevron}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && !blocked && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={props['aria-label']}
          aria-labelledby={props['aria-labelledby']}
          popover="auto"
          className={s.content}
          onToggle={(event) => {
            if (event.newState === 'closed') setOpen(false);
          }}
        >
          {available.map((choice, index) => (
            <div key={choice.value}>
              {choice.group && choice.group !== available[index - 1]?.group && (
                <div className={s.group}>{choice.group}</div>
              )}
              <div
                id={`${id}-${choice.value}`}
                role="option"
                aria-selected={choice.value === String(value)}
                aria-disabled={choice.disabled || undefined}
                className={s.item}
                data-value={choice.value}
                data-highlighted={choice.value === highlight || undefined}
                data-disabled={choice.disabled || undefined}
                data-state={choice.value === String(value) ? 'checked' : 'unchecked'}
                onPointerMove={(event) => {
                  if (event.pointerType === 'mouse' && !choice.disabled) setHighlight(choice.value);
                }}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault();
                  choose(choice);
                }}
              >
                <span>{choice.label}</span>
                {choice.value === String(value) && (
                  <span className={s.check}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
