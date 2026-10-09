import { currency } from '../../../../packages/catalogs/src/index';
export function money(value: string, code: string, year: number) {
  const c = currency(code, year),
    n = BigInt(value),
    sign = n < 0 ? '−' : '',
    abs = n < 0 ? -n : n;
  if (c.code === 'GBP-LSD')
    return `${sign}£${(abs / 240n).toLocaleString('en-GB')} ${(abs % 240n) / 12n}s ${abs % 12n}d`;
  const units = BigInt(c.units);
  return `${sign}${c.symbol}${(abs / units).toLocaleString('en-GB')}${c.units === 100 ? '.' + String(abs % units).padStart(2, '0') : ''}`;
}
export const number = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const seasonName = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
export const percent = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
export const kindLabel: Record<string, string> = {
  league: '리그',
  lower: '하부 리그',
  cup: '국내 컵',
  playoff: '승격 플레이오프',
  europe: '클럽대항전',
};
