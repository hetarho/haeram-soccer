/**
 * One tab plays a game at a time (→SAVE-6, →ARCH-17): the tab holding the writer Web Lock plays;
 * another tab waits, never opening the game's database, until its owner asks to continue there.
 * The request goes over the app's BroadcastChannel; the playing tab gives the game up and releases
 * the lock, which the asking tab then takes. A playing tab that does not answer keeps the game until
 * it closes and the lock frees.
 */
export const WRITER_LOCK = 'haeram-soccor:writer';
/** How long the asking tab waits before saying the playing tab does not answer. */
export const UNANSWERED_MS = 5000;

/** The part of the Web Locks API this tab uses. */
export interface LockPort {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown>;
}
/** Another tab's request to continue the game there. */
export interface TakeoverMessage {
  type: 'takeover';
  from: string;
}
export const isTakeover = (data: unknown): data is TakeoverMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'takeover';
/**
 * Why this tab does not play: the game plays in another tab (`moved` once this tab gave it up),
 * and whether this tab asked for it and has waited past UNANSWERED_MS.
 */
export interface Elsewhere {
  moved?: boolean;
  requested?: boolean;
  unanswered?: boolean;
}

export class PlayingTab {
  /** Set while this tab holds the lock: resolving it releases the lock. */
  private release?: () => void;
  private wait?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private givingUp = false;
  private disposed = false;
  elsewhere?: Elsewhere;
  constructor(
    private locks: LockPort,
    private post: (message: TakeoverMessage) => void,
    private handlers: {
      /** This tab now plays: `moved` when it took the game from another tab. */
      acquired: (moved: boolean) => Promise<void>;
      /** Stops, saves and closes the game; a rejection keeps the game here. */
      giveUp: () => Promise<void>;
      /** `elsewhere` changed. */
      changed: () => void;
    },
    private id: string = crypto.randomUUID(),
    private patience = UNANSWERED_MS,
  ) {}
  /** Whether this tab plays the game. */
  get playing() {
    return !!this.release;
  }
  /** Takes the lock when it is free; otherwise this tab waits. Settles once either is known. */
  start() {
    return new Promise<void>((resolve) => {
      void this.locks
        .request(WRITER_LOCK, { ifAvailable: true }, async (lock) => {
          if (!lock || this.disposed) {
            if (!this.disposed) this.elsewhere = {};
            resolve();
            return;
          }
          await this.hold(false, resolve);
        })
        .catch(() => resolve());
    });
  }
  /** Holds the lock until the game is given up or the tab goes. */
  private async hold(moved: boolean, ready?: () => void) {
    clearTimeout(this.timer);
    this.elsewhere = undefined;
    const held = new Promise<void>((done) => (this.release = done));
    try {
      await this.handlers.acquired(moved);
    } finally {
      ready?.();
    }
    await held;
  }
  /** 여기서 이어 하기: asks the playing tab for the game and queues for the lock. */
  request() {
    if (this.playing || this.disposed) return;
    this.elsewhere = { ...this.elsewhere, requested: true, unanswered: false };
    this.handlers.changed();
    this.post({ type: 'takeover', from: this.id });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.playing || !this.elsewhere) return;
      this.elsewhere = { ...this.elsewhere, unanswered: true };
      this.handlers.changed();
    }, this.patience);
    if (this.wait) return;
    const wait = new AbortController();
    this.wait = wait;
    void this.locks
      .request(WRITER_LOCK, { signal: wait.signal }, async (lock) => {
        this.wait = undefined;
        if (!lock || this.disposed) return;
        await this.hold(true);
      })
      .catch(() => {
        // Aborted when the tab goes.
        if (this.wait === wait) this.wait = undefined;
      });
  }
  /** A message on the channel: another tab's request gives the game up when this tab plays. */
  async heard(data: unknown) {
    if (!isTakeover(data) || data.from === this.id || !this.release || this.givingUp) return;
    this.givingUp = true;
    try {
      await this.handlers.giveUp();
    } catch {
      // The game could not be saved: it stays here, and the asking tab keeps waiting.
      return;
    } finally {
      this.givingUp = false;
    }
    this.elsewhere = { moved: true };
    const release = this.release;
    this.release = undefined;
    this.handlers.changed();
    release?.();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.wait?.abort();
    this.release?.();
    this.release = undefined;
  }
}
