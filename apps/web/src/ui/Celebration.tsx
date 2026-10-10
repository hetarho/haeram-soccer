import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameState } from '../runtime/store';
import type { NewsItem } from '../../../../packages/engine/src/news';
import { useClubNews, useNewsQuiet } from './NewsFeed';
import s from './Celebration.module.css';

/** Fixed paper strips so the scene never depends on chance or wall time. */
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i % 8) * 110,
  duration: 1700 + (i % 5) * 260,
  drift: ((i * 53) % 80) - 40,
  tone: i % 3,
}));
/** How long a celebration stays before it clears itself; the last part files it away. */
const SHOW_MS = 5200;
const FILE_MS = 420;

function Celebrating() {
  const news = useClubNews();
  // With "뉴스 표시 안 함" achievements only collect behind the news button.
  const quiet = useNewsQuiet((state) => state.quiet);
  // Achievements already in the career when this view started are history, not news.
  const seen = useRef<Set<string>>(undefined);
  const [queue, setQueue] = useState<NewsItem[]>([]);
  useEffect(() => {
    const achieved = news.filter((item) => item.celebrate);
    if (!seen.current) {
      seen.current = new Set(achieved.map((item) => item.id));
      return;
    }
    const fresh = achieved.filter((item) => !seen.current!.has(item.id)).reverse();
    if (!fresh.length) return;
    for (const item of fresh) seen.current.add(item.id);
    if (!quiet) setQueue((current) => [...current, ...fresh]);
  }, [news, quiet]);
  useEffect(() => {
    if (quiet) setQueue([]);
  }, [quiet]);
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setQueue((items) => items.slice(1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [current]);
  if (!current) return null;
  return (
    <div className={s.layer} data-testid="celebration">
      <div className={s.confetti} aria-hidden="true">
        {CONFETTI.map((piece, i) => (
          <i
            key={i}
            className={s[`tone${piece.tone}`]}
            style={
              {
                left: `${piece.left}%`,
                animationDelay: `${piece.delay}ms`,
                animationDuration: `${piece.duration}ms`,
                '--drift': `${piece.drift}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section
        key={current.id}
        className={s.card}
        style={{ '--file-at': `${SHOW_MS - FILE_MS}ms` } as CSSProperties}
        role="status"
        aria-live="polite"
      >
        <small>축하합니다</small>
        <strong>{current.title}</strong>
        {current.detail && <span>{current.detail}</span>}
      </section>
    </div>
  );
}

/**
 * Achievements the club earned while playing get a short celebration that never blocks play
 * (→WEB-52): it takes no taps, stays clear of the HUD and clock, and files itself into the news
 * button.
 */
export function CelebrationHost() {
  const id = useGameState((state) => state.view?.world.id);
  if (!id) return null;
  return <Celebrating key={id} />;
}
