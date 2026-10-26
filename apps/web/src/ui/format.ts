import { currency } from '../../../../packages/catalogs/src/index';
import type { LocaleFormatters } from '../presentation/locale';

let localeFormatters: LocaleFormatters | undefined;
/** Initialized before App mounts; pure helpers remain usable in isolated non-React callers. */
export function setLocaleFormatters(formatters?: LocaleFormatters) {
  localeFormatters = formatters;
}
const integer = (value: bigint) => localeFormatters?.number(value) ?? value.toLocaleString();
const digits = (value: bigint, width: number) =>
  localeFormatters
    ? localeFormatters.decimal(value, {
        useGrouping: false,
        minimumIntegerDigits: width,
        maximumFractionDigits: 0,
      })
    : String(value).padStart(width, '0');
const decimalSeparator = () =>
  localeFormatters?.numberParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
export function money(value: string, code: string, year: number) {
  const c = currency(code, year),
    n = BigInt(value),
    sign = n < 0 ? '−' : '',
    abs = n < 0 ? -n : n;
  if (c.code === 'GBP-LSD')
    return `${sign}£${integer(abs / 240n)} ${digits((abs % 240n) / 12n, 1)}s ${digits(abs % 12n, 1)}d`;
  const units = BigInt(c.units);
  return `${sign}${c.symbol}${integer(abs / units)}${c.units === 100 ? decimalSeparator() + digits(abs % units, 2) : ''}`;
}
/**
 * The one money notation (→WEB-67): whole major units below 100,000, then K/M/B at three
 * significant figures, rounded toward zero so a glance never shows more than the club has.
 * Amounts standing on their own render through `<Money>`, which opens the exact `money()` value;
 * amounts inside a sentence, a label or a chart axis use this text.
 */
export function compactMoney(value: string, code: string, year: number) {
  const c = currency(code, year),
    n = BigInt(value),
    sign = n < 0n ? '−' : '',
    major = (n < 0n ? -n : n) / BigInt(c.units);
  if (major < 100_000n) return `${sign}${c.symbol}${integer(major)}`;
  const [unit, size]: [string, bigint] =
    major >= 1_000_000_000n
      ? ['B', 1_000_000_000n]
      : major >= 1_000_000n
        ? ['M', 1_000_000n]
        : ['K', 1_000n];
  const whole = major / size,
    places = whole >= 100n ? 0 : whole >= 10n ? 1 : 2,
    scale = 10n ** BigInt(places),
    fraction = ((major * scale) / size) % scale;
  return `${sign}${c.symbol}${integer(whole)}${places ? decimalSeparator() + digits(fraction, places) : ''}${unit}`;
}
export const number = (n: number) => localeFormatters?.number(n) ?? Math.round(n).toLocaleString();
/** A difference with its sign: "+3", "−1.5", "0". */
export const signed = (value: number, digits = 0) => {
  const text = digits
    ? (localeFormatters?.decimal(Number(Math.abs(value).toFixed(digits)), {
        useGrouping: false,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }) ?? Math.abs(value).toFixed(digits))
    : number(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
};
export const seasonName = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
/**
 * When a contract that runs `until` that year ends, in seasons rather than a bare year:
 * "계약 이번 시즌(1950/51) 끝까지" at this season's close, else "계약 1952/53 시즌 끝까지".
 */
export function contractLine(until: number, year: number) {
  return until === year + 1
    ? `계약 이번 시즌(${seasonName(year)}) 끝까지`
    : `계약 ${seasonName(until - 1)} 시즌 끝까지`;
}
export const percent = (a: number, b: number) => {
  if (!b) return '—';
  const rounded = Math.round((a / b) * 100);
  return `${localeFormatters?.decimal(rounded, { useGrouping: false, maximumFractionDigits: 0 }) ?? rounded}%`;
};
export { competitionLabel, kindLabel } from '../presentation/competitionLabels';
