import type { GameClient } from '../runtime/client';
import { NEWS_LIMITS } from '../../../../packages/contracts/src/news';
import { useState } from 'react';
import { create } from 'zustand';
import type { World } from '../../../../packages/contracts/src/types';
import type { NewsItem, NewsTag } from '../../../../packages/engine/src/news';
import { seasonName } from './format';
import { gameStore, useGameState } from '../runtime/store';
import s from './NewsFeed.module.css';

const NO_NEWS: NewsItem[] = [];
/** The bounded recent feed, prepared by the worker from its retained journal. */
export function useClubNews(): NewsItem[] {
  return useGameState((state) => state.view?.news) ?? NO_NEWS;
}

const SEEN_KEY = 'haeram-soccor:news-seen';
/** The newest item the owner has seen, per browser and world: a convenience, never a game fact. */
interface NewsSeen {
  id: string;
  total?: number;
}
function readSeen(worldId: string): NewsSeen | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, unknown>;
    const item = all[worldId];
    if (typeof item === 'string') return { id: item };
    if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
      const total =
        'total' in item &&
        typeof item.total === 'number' &&
        Number.isSafeInteger(item.total) &&
        item.total >= 0
          ? item.total
          : undefined;
      return { id: item.id, total };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
function writeSeen(worldId: string, id: string, total?: number) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<
      string,
      string | NewsSeen
    >;
    all[worldId] = total === undefined ? id : { id, total };
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    /* Without storage every item simply stays unmarked. */
  }
}

/** Items newer than the newest one seen; an unknown marker (a new season's feed) means all. */
function freshCount(news: NewsItem[], seen?: NewsSeen, total = news.length) {
  if (seen?.total !== undefined) return Math.max(0, total - seen.total);
  const at = seen ? news.findIndex((item) => item.id === seen.id) : -1;
  return seen ? (at < 0 ? total : at) : total;
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
  const view = gameStore.getSnapshot().view;
  if (news[0])
    writeSeen(worldId, news[0].id, view?.world.id === worldId ? view.newsTotal : undefined);
}

export function useUnreadNewsCount() {
  const news = useClubNews();
  const worldId = useGameState((state) => state.view?.world.id);
  const total = useGameState((state) => state.view?.newsTotal);
  useNewsSheet((state) => state.open);
  useNewsSheet((state) => state.tab);
  return worldId ? freshCount(news, readSeen(worldId), total) : 0;
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

/** Stored headlines with tag filters and explicit older-news pages. */
export function NewsList({ w, client }: { w: World; client?: GameClient }) {
  const [tag, setTag] = useState<(typeof TAGS)[number]>('전체');
  const current = useClubNews();
  const [recent] = useState(current);
  const [older, setOlder] = useState<NewsItem[]>([]);
  const [filtered, setFiltered] = useState<NewsItem[]>([]);
  const [ended, setEnded] = useState(false);
  const [allEnded, setAllEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const news =
    tag === '전체' || !client
      ? [...new Map([...recent, ...older].map((item) => [item.id, item])).values()]
      : filtered;
  const loadMore = async () => {
    if (!client || loading) return;
    setLoading(true);
    setError('');
    try {
      const page = await client.newsPage(news.at(-1)?.id, tag === '전체' ? undefined : tag);
      if (tag === '전체') {
        setOlder((previous) => [...previous, ...page.items]);
        setAllEnded(!page.next);
      } else setFiltered((previous) => [...previous, ...page.items]);
      setEnded(!page.next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  const chooseTag = async (value: (typeof TAGS)[number]) => {
    if (loading) return;
    setTag(value);
    setEnded(value === '전체' ? allEnded : false);
    setError('');
    if (value === '전체' || !client) return;
    setFiltered([]);
    setLoading(true);
    try {
      const page = await client.newsPage(undefined, value);
      setFiltered(page.items);
      setEnded(!page.next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  const [seenAtOpen] = useState(() => readSeen(w.id));
  const fresh = new Set(recent.slice(0, freshCount(recent, seenAtOpen)).map((item) => item.id));
  const shown = tag === '전체' || client ? news : news.filter((item) => item.tag === tag);
  return (
    <>
      <div className={s.filters} role="group" aria-label="뉴스 분류">
        {TAGS.map((value) => (
          <button
            key={value}
            aria-pressed={tag === value}
            className={tag === value ? s.selected : undefined}
            disabled={loading}
            onClick={() => void chooseTag(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {loading && <p role="status">소식 불러오는 중…</p>}
      {shown.length ? (
        <ul className={s.feed}>
          {shown.map((item) => (
            <Headline
              key={item.id}
              item={item}
              fresh={
                !seenAtOpen ||
                (seenAtOpen.total !== undefined && item.sequence !== undefined
                  ? item.sequence > seenAtOpen.total
                  : fresh.has(item.id))
              }
            />
          ))}
        </ul>
      ) : (
        <p className={s.empty}>이 분류의 소식이 아직 없어요.</p>
      )}
      {client &&
        !ended &&
        (tag === '전체'
          ? recent.length >= NEWS_LIMITS.recent
          : filtered.length >= NEWS_LIMITS.page) && (
          <button type="button" disabled={loading} onClick={() => void loadMore()}>
            {loading ? '이전 소식 불러오는 중…' : '이전 소식 더 보기'}
          </button>
        )}
      {error && <p role="alert">{error}</p>}
      <NewsQuietToggle />
      <p className={s.note}>
        뉴스는 기록된 경기와 구단 결정에서만 만들어요. 연속 기록·점유율·xG 같은 수치는 사실이고,
        원인을 단정하지 않아요.
      </p>
    </>
  );
}
