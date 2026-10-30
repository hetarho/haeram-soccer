import type { Club, PersonCareer } from '../../../../packages/contracts/src/types';
import {
  FIXTURE_READ_KEYS,
  fixtureRosterKey,
  type FixtureReadCopy,
} from '../../../../packages/engine/src/fixture-copy';
import type { RoundJob, RoundJobResult } from '../../../../packages/engine/src/round-jobs';

export const FIXTURE_HELPER_PROTOCOL = 1;
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
type Dynamic = Omit<FixtureReadCopy, 'clubs' | 'people'>;
interface Patch {
  state: Dynamic;
  clubs: Changes<Club>;
  people: Changes<PersonCareer>;
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
  };
  reset() {
    this.previous = undefined;
  }
  encode(copy: FixtureReadCopy, revision: number) {
    const clubs = copy.clubs.map((c): [string, Club] => [c.id, c]);
    const people = Object.entries(copy.people ?? {});
    const clubTexts = textsOf(clubs),
      peopleTexts = textsOf(people);
    if (clubTexts.size !== clubs.length) throw new Error('Duplicate fixture-copy club');
    const key = identity(copy),
      roster = fixtureRosterKey(copy);
    const previous = this.previous?.identity === key ? this.previous : undefined;
    let patch: string | undefined;
    if (previous) {
      const { clubs: _clubs, people: _people, ...state } = copy;
      void _clubs;
      void _people;
      patch = JSON.stringify({
        state,
        clubs: changes(clubs, clubTexts, previous.clubs),
        people: changes(people, peopleTexts, previous.people),
        hasPeople: copy.people !== undefined,
        rosterChanged: previous.roster !== roster,
      } satisfies Patch);
    }
    this.previous = { revision, identity: key, roster, clubs: clubTexts, people: peopleTexts };
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
function assertRows<T extends { id: string }>(rows: unknown): asserts rows is Changes<T> {
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
        !object(row[1]) ||
        row[1].id !== row[0],
    ) ||
    (rows.order !== undefined &&
      (!Array.isArray(rows.order) || rows.order.some((id) => typeof id !== 'string')))
  )
    throw new Error('Invalid fixture-copy records');
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
          identity(parsed.state) !== identity(this.copy) ||
          typeof parsed.hasPeople !== 'boolean' ||
          typeof parsed.rosterChanged !== 'boolean'
        )
          throw new Error('Invalid patch identity');
        assertRows<Club>(parsed.clubs);
        assertRows<PersonCareer>(parsed.people);
        const patch = parsed as unknown as Patch;
        const copy = this.copy;
        const root = copy as unknown as Record<string, unknown>;
        for (const key of FIXTURE_READ_KEYS)
          if (key !== 'clubs' && key !== 'people' && !Object.hasOwn(patch.state, key))
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
        if (!patch.hasPeople) {
          if (patch.people.put.length) throw new Error('Absent people registry');
          delete copy.people;
        } else if (
          !copy.people ||
          patch.people.put.length ||
          patch.people.drop.length ||
          patch.people.order
        ) {
          const people = new Map(Object.entries(copy.people ?? {}));
          for (const id of patch.people.drop) people.delete(id);
          for (const [id, value] of patch.people.put) people.set(id, value);
          if (patch.people.order) ordered(people, patch.people.order);
          else if (
            people.size !== Object.keys(copy.people ?? {}).length ||
            [...people.keys()].some((id) => !Object.hasOwn(copy.people ?? {}, id))
          )
            throw new Error('Missing people order');
          copy.people = Object.fromEntries(
            (patch.people.order ?? [...people.keys()]).map((id) => [id, people.get(id)!]),
          );
        }
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
