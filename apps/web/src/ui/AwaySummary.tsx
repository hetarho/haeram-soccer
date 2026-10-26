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
    const outcome = ours > theirs ? '승' : ours < theirs ? '패' : '무';
    tally[outcome === '승' ? 'won' : outcome === '패' ? 'lost' : 'drawn']++;
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
    <Dialog label="자리를 비운 동안" onClose={() => controller.clearAway()}>
      <p className={s.span}>
        {from.date} → {seasonDate(w)} · {number(days)}일
      </p>
      <ul className={s.facts}>
        <li>
          <span>경기</span>
          <b>
            {results.total
              ? `${results.total}경기 · ${results.won}승 ${results.drawn}무 ${results.lost}패${results.counted < results.total ? ` (최근 ${results.counted}경기)` : ''}`
              : '경기 없음'}
          </b>
        </li>
        {results.latest.map((line) => (
          <li key={line.id} className={s.result}>
            {line.text}
          </li>
        ))}
        <li>
          <span>리그 순위</span>
          <b>{newSeason ? `새 시즌 ${rank}위` : `${from.rank}위 → ${rank}위`}</b>
        </li>
        <li>
          <span>자금</span>
          <b className={cash < 0n ? s.down : s.up}>
            {cash < 0n ? '−' : '+'}
            {format(cash < 0n ? -cash : cash)}
          </b>
        </li>
        <li>
          <span>지금</span>
          <b>{running ? '계속 진행 중' : reason || '멈춤'}</b>
        </li>
      </ul>
      <div className={a.actions}>
        <button data-ui="primary" className={a.primary} onClick={() => controller.clearAway()}>
          확인
        </button>
      </div>
    </Dialog>
  );
}
