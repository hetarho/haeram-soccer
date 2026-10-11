import type { Fixture, World } from '../../../../packages/contracts/src/types';
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
/**
 * Money for a phone-width HUD: whole major units, then K/M/B at three significant figures,
 * rounded down so the glance never shows more cash than the club has.
 */
export function compactMoney(value: string, code: string, year: number) {
  const c = currency(code, year),
    n = BigInt(value),
    sign = n < 0n ? '−' : '',
    major = (n < 0n ? -n : n) / BigInt(c.units);
  if (major < 100_000n) return `${sign}${c.symbol}${major.toLocaleString('en-GB')}`;
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
  return `${sign}${c.symbol}${whole.toLocaleString('en-GB')}${places ? '.' + String(fraction).padStart(places, '0') : ''}${unit}`;
}
export const number = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const seasonName = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
export const percent = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
export const kindLabel: Record<string, string> = {
  league: '리그',
  lower: '아마추어 리그',
  cup: '국내 컵',
  playoff: '승격 플레이오프',
  europe: '클럽대항전',
};
/**
 * The competition and stage of a fixture as football media name it: "잉글랜드 컵 8강",
 * "Champions League 16강 2차전", "Europa League 리그 페이즈"; league games keep their kind.
 */
export function competitionLabel(w: World, f: Fixture) {
  const knockout = /:k(\d+):\d+(:2)?$/.exec(f.id);
  if (f.kind === 'cup') {
    const cup = w.cups?.find((entry) => `cup:${entry.country}` === f.groupKey);
    const round = knockout && cup?.rounds[Number(knockout[1])];
    return `${cup?.name ?? kindLabel.cup}${round ? ` ${round.label}` : ''}`;
  }
  if (f.kind === 'europe') {
    const t = w.europe.find((entry) => entry.key === f.groupKey);
    if (!t) return kindLabel.europe;
    if (!knockout) return `${t.name} ${t.format === 'league' ? '리그 페이즈' : '조별 리그'}`;
    const round = t.rounds?.[Number(knockout[1])];
    const leg = round?.legs === 2 ? (knockout[2] ? ' 2차전' : ' 1차전') : '';
    return `${t.name}${round ? ` ${round.label}${leg}` : ''}`;
  }
  return kindLabel[f.kind] || f.kind;
}
