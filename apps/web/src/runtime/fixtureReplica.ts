import type { Club, Player } from '../../../../packages/contracts/src/types';
import { ATTRIBUTES } from '../../../../packages/contracts/src/player';
import {
  FIXTURE_READ_KEYS,
  fixtureRosterKey,
  type FixtureReadCopy,
  type FixtureReadPerson,
} from '../../../../packages/engine/src/fixture-copy';
import type { RoundJob, RoundJobResult } from '../../../../packages/engine/src/round-jobs';

export const FIXTURE_HELPER_PROTOCOL = 3;
export interface HelperJob {
  protocol: number;
  session: string;
  id: number;
  worldRevision: number;
  base: number;
  copy?: string;
  patch?: string;
  jobs: RoundJob[];
}
export interface HelperReply {
  protocol: number;
  session: string;
  id: number;
  worldRevision: number;
  revision: number;
  results?: RoundJobResult[];
  error?: string;
}
interface Changes<T> {
  put: [string, T][];
  drop: string[];
  order?: string[];
}
type Dynamic = Omit<FixtureReadCopy, 'clubs' | 'people' | 'squads'>;
interface Patch {
  state: Dynamic;
  clubs: Changes<Club>;
  people: Changes<FixtureReadPerson>;
  squads: Changes<Player[]>;
  /** Attribute columns alone for growth: no squad/profile retransmission or selection. */
  attributes: [string, [string, number[], number | null][]][];
  hasSquads: boolean;
  hasPeople: boolean;
  rosterChanged: boolean;
}
const identity = (copy: Dynamic) =>
  JSON.stringify([copy.seed, copy.year, copy.playerClub, copy.matchModel]);
const textsOf = <T>(entries: [string, T][]) =>
  new Map(entries.map(([id, value]) => [id, JSON.stringify(value)]));
function changes<T>(
  entries: [string, T][],
  texts: Map<string, string>,
  old: Map<string, string>,
): Changes<T> {
  const order = [...texts.keys()];
  const before = [...old.keys()];
  return {
    put: entries.filter(([id]) => texts.get(id) !== old.get(id)),
    drop: before.filter((id) => !texts.has(id)),
    ...(order.length !== before.length || order.some((id, i) => id !== before[i]) ? { order } : {}),
  };
}

/** Immutable fingerprints only: never retains a live world or its mutable record objects. */
export class FixtureReplicaWriter {
  private previous?: {
    revision: number;
    identity: string;
    roster: string;
    clubs: Map<string, string>;
    people: Map<string, string>;
    squads: Map<string, string>;
    profiles: Map<string, string>;
    attributes: Map<string, Map<string, string>>;
  };
  reset() {
    this.previous = undefined;
  }
  encode(copy: FixtureReadCopy, revision: number) {
    const clubs = copy.clubs.map((c): [string, Club] => [c.id, c]);
    const people = Object.entries(copy.people ?? {});
    const squads = Object.entries(copy.squads ?? {});
    const clubTexts = textsOf(clubs),
      peopleTexts = textsOf(people),
      squadTexts = textsOf(squads);
    if (clubTexts.size !== clubs.length) throw new Error('Duplicate fixture-copy club');
    const key = identity(copy),
      roster = fixtureRosterKey(copy);
    const previous = this.previous?.identity === key ? this.previous : undefined;
    const profiles = new Map<string, string>();
    const attributeTexts = new Map<string, Map<string, string>>();
    for (const [id, players] of squads) {
      if (previous && squadTexts.get(id) === previous.squads.get(id)) {
        profiles.set(id, previous.profiles.get(id)!);
        attributeTexts.set(id, previous.attributes.get(id)!);
        continue;
      }
      profiles.set(
        id,
        JSON.stringify(
          players.map(({ attrs, developed, ...profile }) => {
            void attrs;
            void developed;
            return profile;
          }),
        ),
      );
      attributeTexts.set(
        id,
        textsOf(
          players.map((p): [string, unknown] => [
            p.id,
            [ATTRIBUTES.map((a) => p.attrs[a]), p.developed ?? null],
          ]),
        ),
      );
    }
    let patch: string | undefined;
    if (previous) {
      const squadChanges = changes(squads, squadTexts, previous.squads);
      const columns = new Set(
        squadChanges.put
          .filter(([id]) => profiles.get(id) === previous.profiles.get(id))
          .map(([id]) => id),
      );
      squadChanges.put = squadChanges.put.filter(([id]) => !columns.has(id));
      const { clubs: _clubs, people: _people, squads: _squads, ...state } = copy;
      void _clubs;
      void _people;
      void _squads;
      patch = JSON.stringify({
        state,
        clubs: changes(clubs, clubTexts, previous.clubs),
        people: changes(people, peopleTexts, previous.people),
        hasPeople: copy.people !== undefined,
        squads: squadChanges,
        attributes: squads
          .filter(([id]) => columns.has(id))
          .map(([id, players]) => [
            id,
            players
              .filter(
                (p) => attributeTexts.get(id)!.get(p.id) !== previous.attributes.get(id)?.get(p.id),
              )
              .map((p) => [p.id, ATTRIBUTES.map((a) => p.attrs[a]), p.developed ?? null]),
          ]),
        hasSquads: copy.squads !== undefined,
        rosterChanged: previous.roster !== roster,
      } satisfies Patch);
    }
    this.previous = {
      revision,
      identity: key,
      roster,
      clubs: clubTexts,
      people: peopleTexts,
      squads: squadTexts,
      profiles,
      attributes: attributeTexts,
    };
    let snapshot: string | undefined;
    return {
      base: previous?.revision ?? 0,
      patch,
      snapshot: () => (snapshot ??= JSON.stringify(copy)),
    };
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const invalidRecords = () => new Error('Invalid fixture-copy records');
function assertState(state: unknown): asserts state is Dynamic {
  if (
    !object(state) ||
    typeof state.seed !== 'string' ||
    typeof state.playerClub !== 'string' ||
    !Number.isSafeInteger(state.year) ||
    Object.keys(state).some((k) => !(FIXTURE_READ_KEYS as readonly string[]).includes(k))
  )
    throw new Error('Invalid fixture-copy state');
}
function assertRows<T>(rows: unknown, squads = false): asserts rows is Changes<T> {
  if (
    !object(rows) ||
    !Array.isArray(rows.put) ||
    !Array.isArray(rows.drop) ||
    rows.drop.some((id) => typeof id !== 'string') ||
    rows.put.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 2 ||
        typeof row[0] !== 'string' ||
        (squads
          ? !Array.isArray(row[1]) || row[1].some((p) => !object(p) || typeof p.id !== 'string')
          : !object(row[1]) || row[1].id !== row[0]),
    ) ||
    (rows.order !== undefined &&
      (!Array.isArray(rows.order) || rows.order.some((id) => typeof id !== 'string')))
  )
    throw invalidRecords();
  const put = rows.put as [string, T][];
  if (
    new Set(put.map(([id]) => id)).size !== put.length ||
    new Set(rows.drop).size !== rows.drop.length ||
    rows.drop.some((id) => put.some(([key]) => key === id))
  )
    throw new Error('Duplicate fixture-copy change');
}
function ordered<T>(records: Map<string, T>, order: string[]): T[] {
  if (
    order.length !== records.size ||
    new Set(order).size !== order.length ||
    order.some((id) => !records.has(id))
  )
    throw new Error('Invalid fixture-copy order');
  return order.map((id) => records.get(id)!);
}
/** Replace fields, including removed optional ones, retaining cached club object references. */
function replaceFields(target: object, source: object) {
  const dst = target as Record<string, unknown>,
    src = source as Record<string, unknown>;
  for (const key of Object.keys(dst)) if (!Object.hasOwn(src, key)) delete dst[key];
  for (const [key, value] of Object.entries(src))
    Object.defineProperty(dst, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
}

/** Preserve insertion order and unchanged registry references, including empty registries. */
function applyRegistry<T>(
  current: Record<string, T> | undefined,
  rows: Changes<T>,
  present: boolean,
) {
  if (!present) {
    if (rows.put.length || rows.order?.length) throw new Error('Absent people registry');
    return undefined;
  }
  if (current && !rows.put.length && !rows.drop.length && !rows.order) return current;
  const records = new Map(Object.entries(current ?? {}));
  for (const id of rows.drop) records.delete(id);
  for (const [id, value] of rows.put) records.set(id, value);
  if (rows.order) ordered(records, rows.order);
  else if (
    records.size !== Object.keys(current ?? {}).length ||
    [...records.keys()].some((id) => !Object.hasOwn(current ?? {}, id))
  )
    throw new Error('Missing people order');
  return Object.fromEntries(
    (rows.order ?? [...records.keys()]).map((id) => [id, records.get(id)!]),
  );
}

function applyAttributeColumns(copy: FixtureReadCopy, patch: Patch) {
  const changed = new Set<string>();
  for (const row of patch.attributes) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      changed.has(row[0]) ||
      !Array.isArray(row[1]) ||
      patch.squads.put.some(([id]) => id === row[0])
    )
      throw invalidRecords();
    changed.add(row[0]);
    const players = copy.squads?.[row[0]];
    if (!players) throw invalidRecords();
    const ids = new Set<string>();
    for (const column of row[1]) {
      if (
        !Array.isArray(column) ||
        column.length !== 3 ||
        typeof column[0] !== 'string' ||
        ids.has(column[0]) ||
        !Array.isArray(column[1]) ||
        column[1].length !== ATTRIBUTES.length ||
        column[1].some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 5 || n > 99) ||
        (column[2] !== null &&
          (typeof column[2] !== 'number' ||
            !Number.isFinite(column[2]) ||
            column[2] < 0 ||
            column[2] > 500))
      )
        throw invalidRecords();
      const p = players.find((p) => p.id === column[0]);
      if (!p) throw invalidRecords();
      ids.add(p.id);
      ATTRIBUTES.forEach((a, i) => {
        p.attrs[a] = column[1][i]!;
      });
      if (column[2] === null) delete p.developed;
      else p.developed = column[2];
    }
  }
}

/** One reader per served channel. Errors discard the replica; the active world is never touched. */
export class FixtureReplicaReader {
  private copy?: FixtureReadCopy;
  private clubs = new Map<string, Club>();
  private session = '';
  revision = 0;
  clear() {
    this.copy = undefined;
    this.clubs.clear();
    this.session = '';
    this.revision = 0;
  }
  apply(job: HelperJob): { copy: FixtureReadCopy; rosterChanged: boolean } {
    try {
      if (
        job.protocol !== FIXTURE_HELPER_PROTOCOL ||
        typeof job.session !== 'string' ||
        !job.session.length ||
        !Number.isSafeInteger(job.id) ||
        job.id < 1 ||
        !Number.isSafeInteger(job.worldRevision) ||
        job.worldRevision < 0 ||
        !Array.isArray(job.jobs) ||
        (typeof job.copy === 'string') === (typeof job.patch === 'string')
      )
        throw new Error('Invalid helper envelope');
      if (this.session === job.session && job.id <= this.revision)
        throw new Error('Stale helper request');
      let rosterChanged = true;
      if (job.copy !== undefined) {
        if (job.base !== 0) throw new Error('Invalid snapshot base');
        const parsed: unknown = JSON.parse(job.copy);
        assertState(parsed);
        const copy = parsed as FixtureReadCopy;
        if (
          !Array.isArray(copy.clubs) ||
          copy.clubs.some((c) => !object(c) || typeof c.id !== 'string') ||
          (copy.squads !== undefined &&
            (!object(copy.squads) ||
              Object.values(copy.squads).some(
                (ps) =>
                  !Array.isArray(ps) || ps.some((p) => !object(p) || typeof p.id !== 'string'),
              ))) ||
          (copy.people !== undefined &&
            (!object(copy.people) ||
              Object.entries(copy.people).some(([id, p]) => !object(p) || p.id !== id)))
        )
          throw new Error('Invalid fixture snapshot');
        const clubs = new Map(copy.clubs.map((c) => [c.id, c]));
        if (clubs.size !== copy.clubs.length) throw new Error('Duplicate snapshot club');
        this.copy = copy;
        this.clubs = clubs;
        this.session = job.session;
      } else {
        if (!this.copy || this.session !== job.session || job.base !== this.revision)
          throw new Error('Missing helper base');
        const parsed: unknown = JSON.parse(job.patch!);
        if (!object(parsed)) throw new Error('Invalid helper patch');
        assertState(parsed.state);
        if (
          'clubs' in parsed.state ||
          'people' in parsed.state ||
          'squads' in parsed.state ||
          typeof parsed.hasSquads !== 'boolean' ||
          identity(parsed.state) !== identity(this.copy) ||
          typeof parsed.hasPeople !== 'boolean' ||
          typeof parsed.rosterChanged !== 'boolean'
        )
          throw new Error('Invalid patch identity');
        assertRows<Player[]>(parsed.squads, true);
        if (!Array.isArray(parsed.attributes)) throw invalidRecords();
        assertRows<Club>(parsed.clubs);
        assertRows<FixtureReadPerson>(parsed.people);
        const patch = parsed as unknown as Patch;
        const copy = this.copy;
        const root = copy as unknown as Record<string, unknown>;
        for (const key of FIXTURE_READ_KEYS)
          if (
            key !== 'clubs' &&
            key !== 'people' &&
            key !== 'squads' &&
            !Object.hasOwn(patch.state, key)
          )
            delete root[key];
        Object.assign(copy, patch.state);
        for (const id of patch.clubs.drop) this.clubs.delete(id);
        for (const [id, value] of patch.clubs.put) {
          const existing = this.clubs.get(id);
          if (existing) replaceFields(existing, value);
          else this.clubs.set(id, value);
        }
        if (patch.clubs.order) copy.clubs = ordered(this.clubs, patch.clubs.order);
        else if (
          this.clubs.size !== copy.clubs.length ||
          copy.clubs.some((c) => this.clubs.get(c.id) !== c)
        )
          throw new Error('Missing club order');
        copy.people = applyRegistry(copy.people, patch.people, patch.hasPeople);
        copy.squads = applyRegistry(copy.squads, patch.squads, patch.hasSquads);
        applyAttributeColumns(copy, patch);
        if (!patch.hasPeople) delete copy.people;
        if (!patch.hasSquads) delete copy.squads;
        rosterChanged = patch.rosterChanged;
      }
      this.revision = job.id;
      return { copy: this.copy!, rosterChanged };
    } catch (error) {
      this.clear();
      throw error;
    }
  }
}
