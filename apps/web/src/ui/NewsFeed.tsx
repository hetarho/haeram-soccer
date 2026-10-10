import { useState } from 'react';
import { create } from 'zustand';
import type { World } from '../../../../packages/contracts/src/types';
import type { NewsItem, NewsTag } from '../../../../packages/engine/src/news';
import { seasonName } from './format';
import { Dialog } from './Dialog';
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

export const useNewsSheet = create<{ open: boolean; show: () => void; hide: () => void }>(
  (set) => ({
    open: false,
    show: () => set({ open: true }),
    hide: () => set({ open: false }),
  }),
);

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
    <label className={s.quiet}>
      <input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
      <span>
        <b>뉴스 표시 안 함</b>
        <small>축하 배너를 띄우지 않고 오른쪽 아래 뉴스 버튼에만 쌓아요</small>
      </span>
    </label>
  );
}

/** The bottom-right news button: every headline waits here with its NEW count (→WEB-51). */
export function NewsButton() {
  const news = useClubNews();
  const show = useNewsSheet((state) => state.show);
  // Closing the sheet moves the seen marker, so the count is re-read when it closes.
  useNewsSheet((state) => state.open);
  const worldId = useGameState((state) => state.view?.world.id);
  if (!worldId) return null;
  const fresh = freshCount(news, readSeen(worldId));
  return (
    <button
      className={s.fab}
      data-testid="news-button"
      aria-label={`클럽 뉴스${fresh ? ` · 새 소식 ${fresh}개` : ''}`}
      onClick={(event) => {
        event.currentTarget.focus();
        show();
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M17 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 9h6M7.5 12.5h6M7.5 16h4"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      {fresh > 0 && (
        <b key={fresh} aria-hidden="true">
          {fresh > 99 ? '99+' : fresh}
        </b>
      )}
    </button>
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

/** The home card: the three newest headlines and a way into the full feed (→WEB-51). */
export function NewsHeadlines({ w }: { w: World }) {
  const news = useClubNews();
  const show = useNewsSheet((state) => state.show);
  useNewsSheet((state) => state.open);
  const fresh = freshCount(news, readSeen(w.id));
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
  const news = useClubNews();
  const [tag, setTag] = useState<(typeof TAGS)[number]>('전체');
  const [seenAtOpen] = useState(() => readSeen(w.id));
  const fresh = freshCount(news, seenAtOpen);
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
    </Dialog>
  );
}
