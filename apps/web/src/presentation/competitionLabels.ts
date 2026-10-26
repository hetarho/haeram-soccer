import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { COUNTRIES } from '../../../../packages/catalogs/src/index';

/**
 * Division and competition names as football media say them, shared by the Worker's read models,
 * slot summaries and the UI. They are the default locale's labels (→WEB-90); nothing here reads the
 * selected locale, the theme or browser state.
 */

export const kindLabel: Record<string, string> = {
  league: '리그',
  lower: '아마추어 리그',
  cup: '국내 컵',
  playoff: '승격 플레이오프',
  europe: '클럽대항전',
};

/**
 * A division of a country as the tables and records name it: "2부", "3부 B조" where the division
 * plays in regional groups, "아마추어 리그" below the professional game.
 */
export function divisionName(code: string, tier: number, group?: number) {
  const groups = COUNTRIES.find((c) => c.code === code)?.groups[tier];
  if (!groups) return '아마추어 리그';
  const region =
    group !== undefined && groups.length > 1 ? ` ${String.fromCharCode(65 + group)}조` : '';
  return `${tier + 1}부${region}`;
}

/**
 * The competition and stage of a fixture as football media name it: "잉글랜드 컵 8강",
 * "Champions League 16강 2차전", "Europa League 리그 페이즈"; league games keep their kind.
 */
export function competitionLabel(w: Pick<World, 'cups' | 'europe'>, f: Fixture) {
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
