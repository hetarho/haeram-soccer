import type { World } from '../../../../packages/contracts/src/types';
import { useLocale } from '../presentation/react';
import { number } from './format';
import { gameOverFacts } from './ownerSheet';
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
  const { t } = useLocale();
  const facts = gameOverFacts(w);
  return (
    <section
      data-surface="sheet"
      className={s.gameOver}
      data-testid="game-over"
      data-cause={facts.cause}
      aria-label="게임 오버"
    >
      <small>GAME OVER</small>
      <h2>{facts.title}</h2>
      {facts.club && <strong className={s.club}>{facts.club}</strong>}
      <p>{facts.line}</p>
      <ul>
        <li>
          <span>함께한 시즌</span>
          <b>{facts.seasons}</b>
        </li>
        <li>
          <span>최고 성적</span>
          <b>{facts.best}</b>
        </li>
        <li>
          <span>우승</span>
          <b>{facts.titles}</b>
        </li>
        <li>
          <span>최다 서포터</span>
          <b>{number(facts.peak)}</b>
        </li>
      </ul>
      <div className={s.actions}>
        <button onClick={onExport}>기록 내보내기</button>
        <button onClick={onSlots}>{t('slots.title')}</button>
        <button data-ui="primary" className={app.primary} onClick={onNew}>
          이 슬롯에서 새 게임
        </button>
      </div>
    </section>
  );
}
