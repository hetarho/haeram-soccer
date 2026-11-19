import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayingTab, type LockPort, type TakeoverMessage } from './playingTab';

/** One browser's Web Locks for one name: granted in request order, `ifAvailable` never queued. */
class Locks implements LockPort {
  held = false;
  private queue: (() => void)[] = [];
  request(
    _name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ) {
    const run = async () => {
      this.held = true;
      try {
        await callback({ name: 'writer' });
      } finally {
        this.held = false;
        this.queue.shift()?.();
      }
    };
    if (!this.held) return run();
    if (options.ifAvailable) return callback(null);
    return new Promise<void>((resolve, reject) => {
      const grant = () => void run().then(resolve, reject);
      this.queue.push(grant);
      options.signal?.addEventListener('abort', () => {
        this.queue = this.queue.filter((entry) => entry !== grant);
        reject(new Error('aborted'));
      });
    });
  }
}

/** A tab of the app: its PlayingTab and what it saw. */
interface Tab {
  acquired: boolean[];
  gaveUp: number;
  changes: number;
  playing: PlayingTab;
}
/** A tab whose BroadcastChannel reaches the other `tabs`. */
function tab(locks: Locks, tabs: Tab[], answers = true): Tab {
  const self: Tab = {
    acquired: [],
    gaveUp: 0,
    changes: 0,
    playing: undefined as unknown as PlayingTab,
  };
  const post = (message: TakeoverMessage) => {
    for (const other of tabs) if (other !== self) void other.playing.heard(message);
  };
  self.playing = new PlayingTab(
    locks,
    post,
    {
      acquired: async (moved) => void self.acquired.push(moved),
      giveUp: async () => {
        if (!answers) throw new Error('save failed');
        self.gaveUp++;
      },
      changed: () => self.changes++,
    },
    `tab-${tabs.length}`,
    1000,
  );
  tabs.push(self);
  return self;
}
const tabs: Tab[] = [];
afterEach(() => {
  for (const t of tabs.splice(0)) t.playing.dispose();
  vi.useRealTimers();
});

describe('one playing tab (→SAVE-6)', () => {
  it('plays in the first tab and lets a second one wait without the game', async () => {
    const locks = new Locks();
    const first = tab(locks, tabs),
      second = tab(locks, tabs);
    await first.playing.start();
    await second.playing.start();
    expect(first.playing.playing).toBe(true);
    expect(first.acquired).toEqual([false]);
    expect(second.playing.playing).toBe(false);
    expect(second.playing.elsewhere).toEqual({});
    expect(second.acquired).toEqual([]);
  });

  it('hands the game over on 여기서 이어 하기 and takes it back the same way', async () => {
    const locks = new Locks();
    const first = tab(locks, tabs),
      second = tab(locks, tabs);
    await first.playing.start();
    await second.playing.start();
    second.playing.request();
    await vi.waitFor(() => expect(second.playing.playing).toBe(true));
    expect(first.gaveUp).toBe(1);
    expect(first.playing.playing).toBe(false);
    expect(first.playing.elsewhere).toEqual({ moved: true });
    expect(second.acquired).toEqual([true]);
    expect(second.playing.elsewhere).toBeUndefined();
    // Give-back: the tab that gave the game up asks for it the same way.
    first.playing.request();
    await vi.waitFor(() => expect(first.playing.playing).toBe(true));
    expect(second.gaveUp).toBe(1);
    expect(second.playing.elsewhere).toEqual({ moved: true });
    expect(first.acquired).toEqual([false, true]);
  });

  it('keeps waiting on an unanswered request, says so, and takes the game once the lock frees', async () => {
    vi.useFakeTimers();
    const locks = new Locks();
    const first = tab(locks, tabs, false),
      second = tab(locks, tabs);
    await first.playing.start();
    await second.playing.start();
    second.playing.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.playing.playing).toBe(true);
    expect(second.playing.elsewhere).toEqual({ requested: true, unanswered: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.playing.elsewhere).toEqual({ requested: true, unanswered: true });
    expect(second.playing.playing).toBe(false);
    // The playing tab closes: its lock frees and the waiting tab takes the game.
    first.playing.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.playing.playing).toBe(true);
    expect(second.acquired).toEqual([true]);
  });

  it('ignores its own request and anything that is not one', async () => {
    const locks = new Locks();
    const first = tab(locks, tabs);
    await first.playing.start();
    await first.playing.heard({ type: 'takeover', from: 'tab-0' });
    await first.playing.heard({ revision: 3 });
    expect(first.gaveUp).toBe(0);
    expect(first.playing.playing).toBe(true);
  });
});
