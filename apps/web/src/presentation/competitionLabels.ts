import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { COUNTRIES } from '../../../../packages/catalogs/src/index';

/**
 * Division and competition names as football media say them, shared by the Worker's read models,
 * slot summaries and the UI. They are the default locale's labels (→WEB-90); nothing here reads the
 * selected locale, the theme or browser state.
 */

export const kindLabel: Record<string, string> = {
  league: sourceMessage('navigation.league'),
  cup: sourceMessage('copy.competitionLabels.0efd8e1c18'),
  playoff: sourceMessage('copy.competitionLabels.b5a56f17ba'),
  europe: sourceMessage('copy.competitionLabels.c31822375c'),
};

/**
 * A division of a country as the tables and records name it: "2부", and "3부 B조" where the
 * division plays in regional groups.
 */
export function divisionName(code: string, tier: number, group?: number) {
  const groups = COUNTRIES.find((c) => c.code === code)?.groups[tier] ?? [];
  const region =
    group !== undefined && groups.length > 1
      ? sourceMessage('copy.competitionLabels.9e6d97cc84', { p0: String.fromCharCode(65 + group) })
      : '';
  return sourceMessage('copy.competitionLabels.85f44f73b7', { p0: tier + 1, p1: region });
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
    if (!knockout)
      return `${t.name} ${t.format === 'league' ? sourceMessage('copy.competitionLabels.6b9ab4d59c') : sourceMessage('copy.competitionLabels.6fcd805067')}`;
    const round = t.rounds?.[Number(knockout[1])];
    const leg =
      round?.legs === 2
        ? knockout[2]
          ? sourceMessage('copy.competitionLabels.7b32c11947')
          : sourceMessage('copy.competitionLabels.2a5fd233a4')
        : '';
    return `${t.name}${round ? ` ${round.label}${leg}` : ''}`;
  }
  return kindLabel[f.kind] || f.kind;
}
