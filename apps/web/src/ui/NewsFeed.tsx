import { useMemo, useState } from 'react';
import { create } from 'zustand';
import type { World } from '../../../../packages/contracts/src/types';
import { clubNews, type NewsItem, type NewsTag } from '../../../../packages/engine/src/news';
import { seasonName } from './format';
import { Dialog } from './Dialog';
import { useGameState } from '../runtime/store';
import s from './NewsFeed.module.css';

/** Derived news for the current world; recomputed only when the facts it reads change. */
export function useClubNews(w: World): NewsItem[] {
  return useMemo(
    () => clubNews(w),
    // News reads matches, events, standings and the season; their sizes change with every fact.
    [w.id, w.year, w.round, w.ownMatches.length, w.events.length, w.rankHistory?.length],
  );
}

const SEEN_KEY = 'haeram-soccor:news-seen';
/** The newest item the owner has seen, per browser and world: a convenience, never a game fact. */
function readSeen(worldId: string): string | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
    return typeof all[worldId] === 'string' ? all[worldId] : undefined;
  } catch {
    return undefined;
  }
}
function writeSeen(worldId: string, id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
    all[worldId] = id;
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    /* Without storage every item simply stays unmarked. */
  }
}

export const useNewsSheet = create<{ open: boolean; show: () => void; hide: () => void }>(
  (set) => ({
    open: false,
    show: () => set({ open: true }),
    hide: () => set({ open: false }),
  }),
);

const TAGS: (NewsTag | '전체')[] = [
  '전체',
  '경기',
  '기록',
  '선수',
  '순위',
  '분석',
  '구단',
  '이적',
  '유스',
];

function Headline({ item, fresh }: { item: NewsItem; fresh?: boolean }) {
  return (
    <li className={`${s.item} ${s[item.tone]} ${s[item.weight]}`} data-testid="news-item">
      <span className={s.meta}>
        <b>{item.tag}</b>
        {seasonName(item.year)} · {item.round}R{fresh && <em>NEW</em>}
      </span>
      <strong>{item.title}</strong>
      {item.detail && <small>{item.detail}</small>}
    </li>
  );
}

/** The home card: the three newest headlines and a way into the full feed (→WEB-51). */
export function NewsHeadlines({ w }: { w: World }) {
  const news = useClubNews(w);
  const show = useNewsSheet((state) => state.show);
  const seen = readSeen(w.id);
  const seenIndex = seen ? news.findIndex((item) => item.id === seen) : -1;
  const fresh = seen ? (seenIndex < 0 ? news.length : seenIndex) : news.length;
  return (
    <section className={s.card} aria-label="클럽 뉴스 헤드라인" data-testid="news-headlines">
      <header>
        <h3>헤드라인</h3>
        <button
          onClick={show}
          aria-label={`클럽 뉴스 전체 보기${fresh ? ` · 새 소식 ${fresh}개` : ''}`}
        >
          전체 뉴스{fresh ? <i>{fresh > 99 ? '99+' : fresh}</i> : null}
        </button>
      </header>
      {news.length ? (
        <ul>
          {news.slice(0, 3).map((item, index) => (
            <Headline key={item.id} item={item} fresh={index < fresh} />
          ))}
        </ul>
      ) : (
        <p className={s.empty}>첫 경기가 끝나면 이곳에 경기와 기록 소식이 쌓여요.</p>
      )}
    </section>
  );
}

/** The sheet follows the live world; it is mounted once at the app root. */
export function NewsSheet() {
  const open = useNewsSheet((state) => state.open);
  const w = useGameState((state) => state.view?.world);
  if (!open || !w) return null;
  return <NewsList key={w.id} w={w} />;
}

/** Every headline of the season with tag filters; closing it marks the feed as read. */
function NewsList({ w }: { w: World }) {
  const hide = useNewsSheet((state) => state.hide);
  const news = useClubNews(w);
  const [tag, setTag] = useState<(typeof TAGS)[number]>('전체');
  const [seenAtOpen] = useState(() => readSeen(w.id));
  const seenIndex = seenAtOpen ? news.findIndex((item) => item.id === seenAtOpen) : -1;
  const freshCount = seenAtOpen ? (seenIndex < 0 ? news.length : seenIndex) : news.length;
  const shown = tag === '전체' ? news : news.filter((item) => item.tag === tag);
  const close = () => {
    if (news[0]) writeSeen(w.id, news[0].id);
    hide();
  };
  return (
    <Dialog label="클럽 뉴스" onClose={close} wide>
      <div className={s.filters} role="group" aria-label="뉴스 분류">
        {TAGS.map((value) => (
          <button
            key={value}
            aria-pressed={tag === value}
            className={tag === value ? s.selected : undefined}
            onClick={() => setTag(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className={s.feed}>
          {shown.map((item) => (
            <Headline key={item.id} item={item} fresh={news.indexOf(item) < freshCount} />
          ))}
        </ul>
      ) : (
        <p className={s.empty}>이 분류의 소식이 아직 없어요.</p>
      )}
      <p className={s.note}>
        뉴스는 기록된 경기와 구단 결정에서만 만들어요. 연속 기록·점유율·xG 같은 수치는 사실이고,
        원인을 단정하지 않아요.
      </p>
    </Dialog>
  );
}
