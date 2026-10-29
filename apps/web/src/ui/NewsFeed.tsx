import { useState } from 'react';
import { create } from 'zustand';
import type { World } from '../../../../packages/contracts/src/types';
import type { NewsItem, NewsTag } from '../../../../packages/engine/src/news';
import { seasonName } from './format';
import { useGameState } from '../runtime/store';
import s from './NewsFeed.module.css';

const NO_NEWS: NewsItem[] = [];
/** News the worker derived from the full career; the projected world is too short for records. */
export function useClubNews(): NewsItem[] {
  return useGameState((state) => state.view?.news) ?? NO_NEWS;
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

/** Items newer than the newest one seen; an unknown marker (a new season's feed) means all. */
function freshCount(news: NewsItem[], seen?: string) {
  const at = seen ? news.findIndex((item) => item.id === seen) : -1;
  return seen ? (at < 0 ? news.length : at) : news.length;
}

export type NewsTab = 'notifications' | 'news';
export const useNewsSheet = create<{
  open: boolean;
  tab: NewsTab;
  show: (tab?: NewsTab) => void;
  hide: () => void;
}>((set) => ({
  open: false,
  tab: 'notifications',
  show: (tab = 'news') => set({ open: true, tab }),
  hide: () => set({ open: false }),
}));

export function markNewsSeen(worldId: string, news: NewsItem[]) {
  if (news[0]) writeSeen(worldId, news[0].id);
}

export function useUnreadNewsCount() {
  const news = useClubNews();
  const worldId = useGameState((state) => state.view?.world.id);
  useNewsSheet((state) => state.open);
  useNewsSheet((state) => state.tab);
  return worldId ? freshCount(news, readSeen(worldId)) : 0;
}

const QUIET_KEY = 'haeram-soccor:news-quiet';
function readQuiet() {
  try {
    return localStorage.getItem(QUIET_KEY) === '1';
  } catch {
    return false;
  }
}
/** "뉴스 표시 안 함": no banners, headlines only collect behind the news button (per browser). */
export const useNewsQuiet = create<{ quiet: boolean; setQuiet: (quiet: boolean) => void }>(
  (set) => ({
    quiet: readQuiet(),
    setQuiet: (quiet) => {
      try {
        localStorage.setItem(QUIET_KEY, quiet ? '1' : '0');
      } catch {
        /* Without storage the choice lasts for this visit. */
      }
      set({ quiet });
    },
  }),
);

export function NewsQuietToggle() {
  const quiet = useNewsQuiet((state) => state.quiet);
  const setQuiet = useNewsQuiet((state) => state.setQuiet);
  return (
    <label data-surface="inset" className={s.quiet}>
      <input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
      <span>
        <b>뉴스 표시 안 함</b>
        <small>축하 배너를 띄우지 않고 오른쪽 아래 알림·뉴스의 뉴스 탭에만 쌓아요</small>
      </span>
    </label>
  );
}

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

/** Every headline of the season with tag filters; closing it marks the feed as read. */
export function NewsList({ w }: { w: World }) {
  const news = useClubNews();
  const [tag, setTag] = useState<(typeof TAGS)[number]>('전체');
  const [seenAtOpen] = useState(() => readSeen(w.id));
  const fresh = freshCount(news, seenAtOpen);
  const shown = tag === '전체' ? news : news.filter((item) => item.tag === tag);
  return (
    <>
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
            <Headline key={item.id} item={item} fresh={news.indexOf(item) < fresh} />
          ))}
        </ul>
      ) : (
        <p className={s.empty}>이 분류의 소식이 아직 없어요.</p>
      )}
      <NewsQuietToggle />
      <p className={s.note}>
        뉴스는 기록된 경기와 구단 결정에서만 만들어요. 연속 기록·점유율·xG 같은 수치는 사실이고,
        원인을 단정하지 않아요.
      </p>
    </>
  );
}
