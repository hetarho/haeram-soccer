import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { dayCountedFrom, seasonDate } from '../../../../packages/engine/src/calendar';
import { currentLeagueRank } from '../../../../packages/engine/src/projection';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { useProgression, type ClockMark, type ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { number } from './format';
import { Money } from './Money';
import a from './App.module.css';
import s from './AwaySummary.module.css';

/** Own results since the mark, latest first: W-D-L on 90-minute scores and the last scores. */
function resultsSince(w: World, total: number, mark: ClockMark) {
  const own = w.playerClub;
  const at = mark.lastMatch ? w.ownMatches.findIndex((match) => match.id === mark.lastMatch) : -1;
  // The view keeps the latest own matches only; a long run counts what it still holds.
  const played = w.ownMatches.slice(at + 1).slice(-(total - mark.matches) || w.ownMatches.length);
  const tally = { won: 0, drawn: 0, lost: 0 };
  const lines = played.map((match) => {
    const home = match.home === own,
      ours = home ? match.score.home : match.score.away,
      theirs = home ? match.score.away : match.score.home,
      rival = w.clubs.find((club) => club.id === (home ? match.away : match.home))?.name ?? '';
    const outcome =
      ours > theirs
        ? sourceMessage('result.win')
        : ours < theirs
          ? sourceMessage('result.loss')
          : sourceMessage('result.draw');
    tally[
      outcome === sourceMessage('result.win')
        ? 'won'
        : outcome === sourceMessage('result.loss')
          ? 'lost'
          : 'drawn'
    ]++;
    return { id: match.id, text: `${outcome} ${ours}-${theirs} vs ${rival}` };
  });
  return {
    ...tally,
    total: total - mark.matches,
    counted: played.length,
    latest: lines.slice(-3).reverse(),
  };
}

/**
 * "자리를 비운 동안" (→WEB-64): what the club did while the owner was away, shown when a match was
 * played or a week or more passed; shorter runs clear without a card.
 */
export function AwaySummary({ controller }: { controller: ProgressionController }) {
  useTextLocale();
  const from = useProgression(controller, (state) => state.away);
  const running = useProgression(controller, (state) => state.running);
  const reason = useProgression(controller, (state) => state.reason);
  const w = useGameState((state) => state.view?.world);
  const total = useGameState((state) => state.view?.totalMatches ?? 0);
  const days = from && w ? dayCountedFrom(w, from.year) - from.day : 0;
  const results = from && w ? resultsSince(w, total, from) : undefined;
  const worth = !!results && (results.total > 0 || days >= 7);
  useEffect(() => {
    if (from && !worth) controller.clearAway();
  }, [from, worth, controller]);
  if (!from || !w || !results || !worth) return null;
  const own = clubOf(w),
    rank = currentLeagueRank(w).rank,
    cash = BigInt(w.cash) - BigInt(from.cash),
    format = (value: bigint) => <Money value={value} code={own.country} year={w.year} />,
    newSeason = w.year !== from.year;
  return (
    <Dialog
      label={displayMessage('copy.AwaySummary.5cb298a46d')}
      onClose={() => controller.clearAway()}
    >
      <p className={s.span}>
        {richMessage('copy.AwaySummary.faaafd6ff7', {
          p0: from.date,
          p1: seasonDate(w),
          p2: number(days),
        })}
      </p>
      <ul className={s.facts}>
        <li>
          <span>{richMessage('copy.LabPage.e56314e9a1')}</span>
          <b>
            {localizeValue(
              results.total
                ? sourceMessage('copy.AwaySummary.6e366bcb3d', {
                    p0: results.total,
                    p1: results.won,
                    p2: results.drawn,
                    p3: results.lost,
                    p4:
                      results.counted < results.total
                        ? sourceMessage('copy.AwaySummary.79c084c72a', { p0: results.counted })
                        : '',
                  })
                : sourceMessage('copy.AwaySummary.0bd25447f8'),
            )}
          </b>
        </li>
        {localizeValue(
          results.latest.map((line) => (
            <li key={line.id} className={s.result}>
              {localizeValue(line.text)}
            </li>
          )),
        )}
        <li>
          <span>{richMessage('copy.AwaySummary.a1f8f34457')}</span>
          <b>
            {localizeValue(
              newSeason
                ? sourceMessage('copy.AwaySummary.6206c84e44', { p0: rank })
                : sourceMessage('copy.AwaySummary.c28072ce2e', { p0: from.rank, p1: rank }),
            )}
          </b>
        </li>
        <li>
          <span>{richMessage('copy.AwaySummary.e397620205')}</span>
          <b className={cash < 0n ? s.down : s.up}>
            {localizeValue(cash < 0n ? '−' : '+')}
            {localizeValue(format(cash < 0n ? -cash : cash))}
          </b>
        </li>
        <li>
          <span>{richMessage('copy.AwaySummary.df159f47a8')}</span>
          <b>
            {localizeValue(
              running
                ? sourceMessage('copy.AwaySummary.9a0477ba21')
                : reason || sourceMessage('copy.AwaySummary.cf7e66efa3'),
            )}
          </b>
        </li>
      </ul>
      <div className={a.actions}>
        <button data-ui="primary" className={a.primary} onClick={() => controller.clearAway()}>
          {richMessage('copy.stories.1aacb54c49')}
        </button>
      </div>
    </Dialog>
  );
}
