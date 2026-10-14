import {
  BUILD_OPTIONS,
  STRATEGY_NAME_LIMIT,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import type { StoragePort } from './repository';

// Plain guards keep the save schema and its validator out of the entry bundle (→ARCH-28).
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
/** A build with known slots and cards only, or undefined. */
export function strategyBuild(value: unknown): ClubBuild | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const build: Record<string, string> = {};
  for (const [slot, card] of Object.entries(value)) {
    const options = (BUILD_OPTIONS as Record<string, readonly string[]>)[slot];
    if (!Object.hasOwn(BUILD_OPTIONS, slot) || typeof card !== 'string' || !options.includes(card))
      return undefined;
    build[slot] = card;
  }
  return build as ClubBuild;
}

/**
 * Owner-scoped data (→ARCH-29, →SAVE-15). Today the owner is this browser profile; once sign-in
 * exists an account adapter adopts these records and merges them by ID and update time, so every
 * record carries its owner, a stable ID and when it last changed.
 */
export interface Owner {
  kind: 'device' | 'account';
  id: string;
}
export const DEVICE_KEY = 'haeram-soccor:device';
export const STRATEGIES_KEY = 'haeram-soccor:strategies';
/** A library is a shortcut list, not an archive: a dozen keeps the picker readable. */
export const STRATEGY_LIMIT = 12;

export function ownerOf(value: unknown): Owner | undefined {
  const owner = value as Partial<Owner> | null;
  return owner &&
    typeof owner === 'object' &&
    (owner.kind === 'device' || owner.kind === 'account') &&
    text(owner.id, 100)
    ? { kind: owner.kind, id: owner.id }
    : undefined;
}

/** This browser's owner record, created once with a random ID. */
export function deviceOwner(storage: StoragePort): Owner {
  let id = storage.getItem(DEVICE_KEY);
  if (!id || id.length > 100) {
    id = crypto.randomUUID();
    try {
      storage.setItem(DEVICE_KEY, id);
    } catch {
      /* Without storage the ID lasts for this session only. */
    }
  }
  return { kind: 'device', id };
}

/**
 * The rows a saved direction keeps beyond its cards (→SAVE-15): dials, the ticket price and the
 * direction rows. Entries saved before directions kept rows have none and apply their cards only.
 */
export interface SavedRows {
  policy?: Partial<Record<string, number>>;
  ticket?: number;
  direction?: Partial<Record<string, string>>;
}
export interface SavedStrategy {
  id: string;
  name: string;
  build: ClubBuild;
  rows?: SavedRows;
  createdAt: string;
  updatedAt: string;
}
/**
 * Rows of a known shape, or undefined: dials as whole levels 1–5, a ticket price of 0.01–0.5 and
 * direction options as short names; the engine refuses an option it does not know when applied.
 */
export function strategyRows(value: unknown): SavedRows | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { policy, ticket, direction, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return undefined;
  const record = (input: unknown, fits: (item: unknown) => boolean) =>
    input === undefined ||
    (!!input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      Object.entries(input).every(([key, item]) => key.length <= 30 && fits(item)));
  const level = (item: unknown) =>
    Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 5;
  if (!record(policy, level) || !record(direction, (item) => text(item, 30))) return undefined;
  if (ticket !== undefined && (typeof ticket !== 'number' || ticket < 0.01 || ticket > 0.5))
    return undefined;
  return {
    ...(policy ? { policy: policy as SavedRows['policy'] } : {}),
    ...(ticket !== undefined ? { ticket } : {}),
    ...(direction ? { direction: direction as SavedRows['direction'] } : {}),
  };
}
/**
 * Cards that left (→ECON-22): a saved direction holding one loads without it instead of being
 * skipped.
 */
function withoutLeftCards(build: unknown) {
  if (!build || typeof build !== 'object') return build;
  const rest = { ...(build as Record<string, unknown>) };
  // 1군 직행 경로 left with rules 1.18, 글로벌 브랜드 with rules 1.19 (→SAVE-10).
  if (rest.youth === 'pathway') delete rest.youth;
  if (rest.fans === 'global') delete rest.fans;
  return rest;
}
function strategyOf(value: unknown): SavedStrategy | undefined {
  const item = value as Partial<SavedStrategy> | null;
  if (!item || typeof item !== 'object') return undefined;
  const build = strategyBuild(withoutLeftCards(item.build));
  // Malformed rows drop the rows and keep the cards.
  const rows = item.rows === undefined ? undefined : strategyRows(item.rows);
  return build &&
    text(item.id, 100) &&
    text(item.name, STRATEGY_NAME_LIMIT) &&
    item.name.trim() === item.name &&
    text(item.createdAt, 40) &&
    text(item.updatedAt, 40)
    ? {
        id: item.id,
        name: item.name,
        build,
        ...(rows ? { rows } : {}),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    : undefined;
}

/**
 * The owner's saved operating strategies (→WEB-61). They belong to the device, not to a game, so
 * every slot lists them and they outlive new and deleted games. Malformed entries are skipped.
 */
export class StrategyLibrary {
  constructor(
    private storage: StoragePort,
    private now = () => new Date().toISOString(),
  ) {}
  private read(): { owner: Owner; items: SavedStrategy[] } {
    let raw: unknown;
    try {
      raw = JSON.parse(this.storage.getItem(STRATEGIES_KEY) || 'null');
    } catch {
      raw = null;
    }
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const items = Array.isArray(record.items) ? record.items : [];
    return {
      owner: ownerOf(record.owner) ?? deviceOwner(this.storage),
      items: items.flatMap((item) => strategyOf(item) ?? []),
    };
  }
  private write(owner: Owner, items: SavedStrategy[]) {
    try {
      this.storage.setItem(STRATEGIES_KEY, JSON.stringify({ v: 1, owner, items }));
    } catch {
      throw new Error('브라우저 저장 공간이 부족해 방향을 저장하지 못했어요.');
    }
  }
  /** Most recently changed first. */
  list(): SavedStrategy[] {
    return this.read().items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /** Adds a strategy, or replaces the one with `id`; names stay unique on this device. */
  save(input: { id?: string; name: string; build: ClubBuild; rows?: SavedRows }): SavedStrategy {
    const name = input.name.trim();
    if (!name) throw new Error('방향 이름을 적어 주세요.');
    if (name.length > STRATEGY_NAME_LIMIT)
      throw new Error(`방향 이름은 ${STRATEGY_NAME_LIMIT}자까지예요.`);
    const build = strategyBuild(input.build);
    if (!build) throw new Error('알 수 없는 방향 카드가 있어요.');
    const rows = input.rows === undefined ? undefined : strategyRows(input.rows);
    if (input.rows !== undefined && !rows) throw new Error('알 수 없는 방향 줄이 있어요.');
    const { owner, items } = this.read();
    const existing = input.id ? items.find((item) => item.id === input.id) : undefined;
    if (items.some((item) => item.id !== existing?.id && item.name === name))
      throw new Error('같은 이름의 방향이 이미 있어요.');
    if (!existing && items.length >= STRATEGY_LIMIT)
      throw new Error(
        `방향은 ${STRATEGY_LIMIT}개까지 저장할 수 있어요. 안 쓰는 방향을 지워 주세요.`,
      );
    const time = this.now();
    const saved: SavedStrategy = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      build,
      ...(rows ? { rows } : {}),
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    this.write(
      owner,
      existing ? items.map((item) => (item === existing ? saved : item)) : [...items, saved],
    );
    return saved;
  }
  remove(id: string) {
    const { owner, items } = this.read();
    this.write(
      owner,
      items.filter((item) => item.id !== id),
    );
  }
}
