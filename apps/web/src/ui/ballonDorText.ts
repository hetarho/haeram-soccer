import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { World } from '../../../../packages/contracts/src/types';
import { ballonDorPremium, ballonDorRecord } from '../../../../packages/engine/src/ballon-dor';
import { seasonName } from './format';

/**
 * A player's Ballon d'Or line for his sheet (→WEB-111): his wins, then his second and third
 * places, each with its seasons; nothing without a podium place.
 */
export function ballonDorLine(history: World['history'], id: string) {
  const record = ballonDorRecord(history, id);
  const parts = [
    record.wins.length
      ? sourceMessage('copy.ballonDorText.d6ff4dc76c', {
          p0: record.wins.length,
          p1: record.wins.map(seasonName).join(', '),
        })
      : '',
    ...([2, 3] as const).map((place) => {
      const seasons = record.podiums.filter((entry) => entry.place === place);
      return seasons.length
        ? sourceMessage('copy.ballonDorText.4bce6565df', {
            p0: place,
            p1: seasons.length,
            p2: seasons.map((entry) => seasonName(entry.year)).join(', '),
          })
        : '';
    }),
  ].filter(Boolean);
  return parts.length
    ? sourceMessage('copy.ballonDorText.73d63e1a0a', { p0: parts.join(' · ') })
    : undefined;
}

/**
 * The Ballon d'Or premium a contract talk prices in (→CLUB-26, WEB-68): `발롱도르 수상 (1958/59) ·
 * 요구 +100%`, or nothing when no recent podium place raises his worth.
 */
export function ballonDorPremiumLine(w: Pick<World, 'history' | 'year'>, id: string) {
  const premium = ballonDorPremium(w.history, w.year, id);
  if (premium.factor === 1 || premium.year === undefined) return undefined;
  const place =
    premium.place === 1
      ? sourceMessage('copy.BallonDorView.936c3936af')
      : sourceMessage('copy.BallonDorView.5094d45cea', { p0: premium.place });
  return sourceMessage('copy.ballonDorText.6fa4042c60', {
    p0: place,
    p1: seasonName(premium.year),
    p2: Math.round((premium.factor - 1) * 100),
  });
}
