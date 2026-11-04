import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import type { World } from '../../../../packages/contracts/src/types';
import { useLocale } from '../presentation/react';
import { number } from './format';
import { gameOverFacts } from './ownerFigures';
import app from './App.module.css';
import s from './GameOver.module.css';

/**
 * The end of a career (→WEB-56, OWNER-16): its cause — 구단 파산, 구단주 파산 or 구단주 퇴진 — the
 * season it ended in, what the club achieved before it, its records to keep and a new game.
 */
export function GameOver({
  w,
  onExport,
  onNew,
  onSlots,
}: {
  w: World;
  onExport: () => void;
  onNew: () => void;
  onSlots: () => void;
}) {
  useTextLocale();
  const { t } = useLocale();
  const facts = gameOverFacts(w);
  return (
    <section
      data-surface="sheet"
      className={s.gameOver}
      data-testid="game-over"
      data-cause={facts.cause}
      aria-label={displayMessage('copy.catalog.f041a37093')}
    >
      <small>{richMessage('copy.GameOver.6f391555cf')}</small>
      <h2>{localizeValue(facts.title)}</h2>
      {localizeValue(facts.club && <strong className={s.club}>{localizeValue(facts.club)}</strong>)}
      <p>{localizeValue(facts.line)}</p>
      <ul>
        <li>
          <span>{richMessage('copy.GameOver.83a2c32286')}</span>
          <b>{localizeValue(facts.seasons)}</b>
        </li>
        <li>
          <span>{richMessage('copy.CareerRecordBook.3dba8e06e7')}</span>
          <b>{localizeValue(facts.best)}</b>
        </li>
        <li>
          <span>{richMessage('copy.CupHistory.31e52393f3')}</span>
          <b>{localizeValue(facts.titles)}</b>
        </li>
        <li>
          <span>{richMessage('copy.GameOver.c320bee1f5')}</span>
          <b>{localizeValue(number(facts.peak))}</b>
        </li>
      </ul>
      <div className={s.actions}>
        <button onClick={onExport}>{richMessage('save.export')}</button>
        <button onClick={onSlots}>{localizeValue(t('slots.title'))}</button>
        <button data-ui="primary" className={app.primary} onClick={onNew}>
          {richMessage('copy.GameOver.fcd78ecc40')}
        </button>
      </div>
    </section>
  );
}
