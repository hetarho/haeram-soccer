import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { useState } from 'react';
import { compactMoney, money } from './format';
import s from './Money.module.css';

/**
 * One amount in the money notation (→WEB-67): compact where it is read, the exact amount on hover
 * and on tap. Affordability is still decided on the exact value, never on this text.
 *
 * `plain` is for an amount inside a control that already answers taps (a radio step, a confirm
 * button): it keeps the notation and the hover title without nesting a second control.
 */
export function Money({
  value,
  code,
  year,
  className,
  plain,
}: {
  /** Minor units, as the engine records money (→ARCH-9). */
  value: string | bigint;
  /** The club's country, which owns the currency period. */
  code: string;
  /** The game year the amount belongs to. */
  year: number;
  className?: string;
  plain?: boolean;
}) {
  useTextLocale();
  const [open, setOpen] = useState(false);
  const minor = value.toString(),
    compact = compactMoney(minor, code, year),
    exact = money(minor, code, year);
  // Below 100,000 whole units in a currency without minor units there is nothing left to disclose.
  if (plain || compact === exact)
    return (
      <span className={className} title={localizeValue(exact)} data-money="">
        {localizeValue(compact)}
      </span>
    );
  return (
    <button
      type="button"
      className={`${s.money} ${className ?? ''}`}
      title={localizeValue(exact)}
      aria-label={displayMessage('copy.Money.35733a3eaf', { p0: compact, p1: exact })}
      aria-expanded={open}
      data-money=""
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
        setOpen(!open);
      }}
    >
      {localizeValue(open ? exact : compact)}
    </button>
  );
}
