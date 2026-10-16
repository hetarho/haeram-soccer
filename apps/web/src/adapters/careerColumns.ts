import { z } from 'zod';
import { readCareerOrder } from './careerOrder';
import { readCareerProfiles } from './careerProfiles';
import type { CareerRows } from './careerPacking';
type Job = CareerRows['people'][number][14][number];
export type CareerContext = { clubs: readonly string[]; playerClub: string; seed: string };
type Context = CareerContext;
const integer = z.number().int(),
  index = integer.nonnegative(),
  optional = integer.nullable();
const MAX_ROWS = 1_000_000,
  MAX_CELLS = 16 * 1024 * 1024;
const reference = z.union([
  z.tuple([integer, index]),
  z.tuple([z.null(), index, index, integer, integer, optional, optional]),
]);
const schema = z.strictObject({
  version: z.union([z.literal(2), z.literal(3)]),
  order: z
    .string()
    .max(MAX_ROWS * 4)
    .optional(),
  seed: z.string().max(160),
  calendar: z.array(integer.min(1901 * 366).max(4000 * 366 + 365)).max(MAX_ROWS),
  dictionary: z.array(z.string().max(160)).max(MAX_CELLS),
  people: z.array(z.array(z.unknown()).max(MAX_ROWS)).length(18),
  jobs: z.array(z.array(integer).max(MAX_ROWS)).length(11),
  jobFlags: z.array(index.max(511)).max(MAX_ROWS),
  jobCounts: z.array(index).max(MAX_ROWS),
  mentors: z.array(z.array(reference).max(MAX_ROWS)).max(MAX_ROWS),
  profiles: z.array(z.tuple([index, z.array(z.tuple([index, index, index.nullable()])).min(1)])),
  clubPool: z.array(index).max(MAX_ROWS),
  playerRole: index,
  wageBooks: z.array(z.tuple([integer, index.nullable(), z.array(index).min(1)])),
  draw: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
});
export type PackedCareerColumns = z.infer<typeof schema>;
const failure = () => new Error('인물 이력 압축 참조 또는 차원 손상');
const firstYear = (born: number) => (born >= 1901 && born <= 4000 ? born : 0);
/** Frozen version-two scalar codebook. Never import mutable gameplay generators here. */
function scalarStream(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  let state = hash >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
}
function qualityCodebook(seed: string, person: string) {
  const draw = scalarStream(`${seed}:aptitude:${person}`);
  return Array.from({ length: 3 }, () => {
    const value = draw();
    return value < 0.08 ? 1 : value < 0.3 ? 2 : value < 0.7 ? 3 : value < 0.92 ? 4 : 5;
  });
}
function lowerBound(values: number[], target: number) {
  let low = 0,
    high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}
function dateAnchor(prior: Job | undefined, coaching: unknown, born: number) {
  if (prior?.[4] !== null && prior?.[4] !== undefined) return prior[4] * 366 + prior[5]!;
  if (
    Array.isArray(coaching) &&
    coaching.length === 5 &&
    Number.isSafeInteger(coaching[3]) &&
    Number.isSafeInteger(coaching[4])
  )
    return coaching[3] * 366 + coaching[4];
  return firstYear(born) * 366;
}
/** A fixed quarter-density dictionary selector, independent of future market rules. */
function selectedDate(seed: string, owner: string, ordinal: number) {
  return (
    scalarStream(
      `${seed}:coaching-market:${owner}:${Math.floor(ordinal / 366)}:${ordinal % 366}`,
    )() < 0.25
  );
}
/** Fixed calendar arithmetic used only after an exact endpoint comparison by the encoder. */
function twoYears(year: number, day: number): [number, number] {
  const date = new Date(Date.UTC(year, 7, 1) + day * 86400000);
  const end = new Date(Date.UTC(date.getUTCFullYear() + 2, date.getUTCMonth(), date.getUTCDate()));
  const season = end.getUTCFullYear() - (end.getUTCMonth() < 7 ? 1 : 0);
  return [season, (end.getTime() - Date.UTC(season, 7, 1)) / 86400000];
}
function columns<T>(rows: T[][], width: number): T[][] {
  return Array.from({ length: width }, (_, c) => rows.map((r) => r[c]));
}
/** Reversible string templates share the already stored origin; arbitrary IDs stay literals. */
function compactStrings(data: PackedCareerColumns) {
  const source = data.dictionary,
    dictionary: string[] = [],
    ids = new Map<string, number>();
  const read = (value: unknown) => {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      typeof source[value] !== 'string'
    )
      throw failure();
    return source[value];
  };
  const intern = (value: string) => {
    let index = ids.get(value);
    if (index === undefined) {
      index = dictionary.length;
      dictionary.push(value);
      ids.set(value, index);
    }
    return index;
  };
  const ref = (value: unknown) => intern(read(value));
  const nullable = (value: unknown) => (value === null ? null : ref(value));
  for (let p = 0; p < data.jobCounts.length; p++) {
    const id = read(data.people[0][p]),
      name = read(data.people[1][p]);
    const origin = data.people[11][p] as [number, number] | null;
    let encoded: unknown;
    if (origin) {
      const club = read(origin[0]);
      for (const [kind, token] of [
        [0, 'p'],
        [1, 'vacancy'],
      ] as const) {
        const prefix = `${club}:${token}:${origin[1]}:`;
        if (!id.startsWith(prefix)) continue;
        const parts = id.slice(prefix.length).split(':').map(Number);
        if (
          (kind === 0 ? parts.length === 1 : parts.length === 1 || parts.length === 2) &&
          parts.every((value) => Number.isSafeInteger(value) && value >= 0) &&
          prefix + parts.join(':') === id
        )
          encoded = [kind, ...parts];
      }
      data.people[11][p] = [ref(origin[0]), origin[1]];
    }
    data.people[0][p] = encoded ?? ref(data.people[0][p]);
    const space = name.indexOf(' ');
    data.people[1][p] =
      space < 0 ? intern(name) : [intern(name.slice(0, space)), intern(name.slice(space + 1))];
    for (const column of [3, 8]) data.people[column][p] = ref(data.people[column][p]);
    data.people[9][p] = nullable(data.people[9][p]);
    const loan = data.people[12][p] as [number | null, number] | null;
    if (loan) data.people[12][p] = [nullable(loan[0]), loan[1]];
    const coaching = data.people[16][p] as unknown[] | null;
    if (coaching) data.people[16][p] = [ref(coaching[0]), ...coaching.slice(1)];
    const manager = data.people[17][p] as unknown[] | null;
    if (manager)
      data.people[17][p] = [manager[0], manager[1], ref(manager[2]), ...manager.slice(3)];
  }
  data.jobs[0] = data.jobs[0].map((value, i) => (data.jobFlags[i] & 128 ? 0 : ref(value)));
  data.jobs[1] = data.jobs[1].map((value) => (value! < 0 ? -ref(-value! - 1) - 1 : value));
  data.jobs[9] = data.jobs[9].map((value, i) => (data.jobFlags[i] & 32 ? ref(value) : 0));
  data.profiles = data.profiles.map(([club, group]) => [
    ref(club),
    group.map(([manager, name, school]) => [ref(manager), ref(name), nullable(school)]),
  ]);
  data.mentors = data.mentors.map((mentors) =>
    mentors.map((mentor) =>
      mentor[0] === null
        ? [null, ref(mentor[1]), mentor[2], mentor[3], mentor[4], mentor[5], mentor[6]]
        : mentor,
    ),
  );
  data.clubPool = data.clubPool.map(ref);
  data.playerRole = ref(data.playerRole);
  data.wageBooks = data.wageBooks.map(([year, currency, values]) => [
    year,
    nullable(currency),
    values.map(ref),
  ]);
  data.dictionary = dictionary;
  return data;
}
function restoreStrings(
  main: unknown[],
  read: (i: number) => string,
  intern: (s: string) => number,
) {
  const descriptor = main[0];
  if (Array.isArray(descriptor)) {
    const [kind, ...parts] = descriptor,
      origin = main[11];
    if (
      (kind !== 0 && kind !== 1) ||
      (kind === 0 ? parts.length !== 1 : parts.length !== 1 && parts.length !== 2) ||
      !parts.every((v) => Number.isSafeInteger(v) && v >= 0) ||
      !Array.isArray(origin) ||
      origin.length !== 2 ||
      typeof origin[0] !== 'number' ||
      !Number.isSafeInteger(origin[1]) ||
      origin[1] < 0 ||
      origin[1] > 25
    )
      throw failure();
    const value = `${read(origin[0])}:${kind === 0 ? 'p' : 'vacancy'}:${origin[1]}:${parts.join(':')}`;
    if (value.length > 100) throw failure();
    main[0] = intern(value);
  }
  const name = main[1];
  if (Array.isArray(name)) {
    if (name.length !== 2 || !name.every((v) => typeof v === 'number')) throw failure();
    const value = `${read(name[0])} ${read(name[1])}`;
    if (value.length > 160) throw failure();
    main[1] = intern(value);
  }
}
function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function bytes(text: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))
    throw failure();
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
/** Availability ranks are references to an explicitly stored vocabulary, not game simulation. */
class Vacancies {
  private tree: Int32Array;
  private counts: Int32Array;
  constructor(private size: number) {
    this.tree = new Int32Array(size + 1);
    this.counts = new Int32Array(size);
    for (let i = 1; i <= size; i++) this.tree[i] = i & -i;
  }
  rank(position: number) {
    let result = 0;
    for (let i = position; i; i -= i & -i) result += this.tree[i];
    return result;
  }
  free(position: number) {
    return !this.counts[position];
  }
  at(rank: number) {
    if (!Number.isSafeInteger(rank) || rank < 0 || rank >= this.rank(this.size)) throw failure();
    let position = 0,
      step = 1;
    while (step * 2 <= this.size) step *= 2;
    for (; step; step = Math.floor(step / 2)) {
      const next = position + step;
      if (next <= this.size && this.tree[next] <= rank) {
        position = next;
        rank -= this.tree[next];
      }
    }
    return position;
  }
  change(position: number, delta: 1 | -1) {
    const previous = this.counts[position],
      next = previous + delta;
    if (next < 0) throw failure();
    this.counts[position] = next;
    const movement = Number(next === 0) - Number(previous === 0);
    for (let i = position + 1; movement && i <= this.size; i += i & -i) this.tree[i] += movement;
  }
}
function poolNames(context: Context) {
  if (
    !Array.isArray(context.clubs) ||
    !context.clubs.every((id) => typeof id === 'string') ||
    typeof context.playerClub !== 'string' ||
    !context.clubs.includes(context.playerClub) ||
    new Set(context.clubs).size !== context.clubs.length
  )
    throw failure();
  return context.clubs.filter((id) => id !== context.playerClub).sort();
}
function clubs(
  rows: { owner: string; jobs: Job[] }[],
  pool: number[],
  playerRole: number,
  decode: boolean,
) {
  const locations = new Map(pool.map((id, i) => [id, i]));
  const inventories = new Map<number, Vacancies>();
  const records = rows.flatMap((person) =>
    person.jobs.map((job, seq) => ({ job, owner: person.owner, seq })),
  );
  const events = records
    .filter(({ job }) => job[0] !== playerRole)
    .flatMap((record) => {
      const job = record.job,
        from = job[2] * 366 + job[3],
        to = job[4] === null ? null : job[4] * 366 + job[5]!;
      if (!Number.isSafeInteger(from) || (to !== null && (!Number.isSafeInteger(to) || to < from)))
        throw failure();
      return [
        { at: from, start: true, record },
        ...(to === null || to === from ? [] : [{ at: to, start: false, record }]),
      ];
    })
    .sort(
      (a, b) =>
        a.at - b.at ||
        Number(a.start) - Number(b.start) ||
        (a.record.owner < b.record.owner ? -1 : a.record.owner > b.record.owner ? 1 : 0) ||
        a.record.seq - b.record.seq,
    );
  const encoded = new Map<Job, number>();
  for (const event of events) {
    const job = event.record.job;
    let inventory = inventories.get(job[0]);
    if (!inventory) inventories.set(job[0], (inventory = new Vacancies(pool.length)));
    if (event.start && decode) job[1] = job[1] < 0 ? -job[1] - 1 : pool[inventory.at(job[1])];
    const position = locations.get(job[1]);
    if (!event.start) {
      if (position !== undefined) inventory.change(position, -1);
      continue;
    }
    if (!decode)
      encoded.set(
        job,
        position !== undefined && inventory.free(position) ? inventory.rank(position) : -job[1] - 1,
      );
    if (position !== undefined && (job[4] === null || job[4] !== job[2] || job[5] !== job[3]))
      inventory.change(position, 1);
  }
  for (const { job } of records) {
    if (job[0] === playerRole) {
      if (decode) {
        if (job[1] >= 0) throw failure();
        job[1] = -job[1] - 1;
      } else encoded.set(job, -job[1] - 1);
    }
  }
  return encoded;
}
export function packCareerColumns(
  data: CareerRows,
  id: (s: string) => number,
  read: (i: number) => string,
  context: Context,
  dictionary: string[],
): PackedCareerColumns {
  const pool = poolNames(context).map(id),
    playerRole = id('player');
  const persons = data.people.map((row) => ({ owner: read(row[0]), jobs: row[14] }));
  const clubCodes = clubs(persons, pool, playerRole, false);
  const calendar = [
    ...new Set(
      persons.flatMap(({ jobs }) =>
        jobs
          .filter((job) => job[0] !== playerRole && read(job[1]) !== context.playerClub)
          .map((job) => job[2] * 366 + job[3]),
      ),
    ),
  ].sort((a, b) => a - b);
  let dateWork = MAX_CELLS;
  const profiles = new Map<number, [number, number, number | null][]>();
  const mentors = data.people.map((row) =>
    row[15].map((m, i) => {
      let group = profiles.get(m[3]);
      if (!group) profiles.set(m[3], (group = []));
      let profile = group.findIndex((p) => p[0] === m[0] && p[1] === m[1] && p[2] === m[2]);
      if (profile < 0) {
        profile = group.length;
        group.push([m[0], m[1], m[2]]);
      }
      const job = row[14].findIndex(
        (j) => j[1] === m[3] && j[2] === m[4] && j[3] === m[5] && j[4] === m[6] && j[5] === m[7],
      );
      return job >= 0
        ? ([job - i, profile] as [number, number])
        : ([null, m[3], profile, m[4], m[5], m[6], m[7]] as [
            null,
            number,
            number,
            number,
            number,
            number | null,
            number | null,
          ]);
    }),
  );
  const books = new Map<string, { year: number; currency: number | null; values: number[] }>();
  for (const { jobs } of persons)
    for (const j of jobs)
      if (j[8] !== null) {
        const key = `${j[2]}:${j[9]}`;
        let book = books.get(key);
        if (!book) books.set(key, (book = { year: j[2], currency: j[9], values: [] }));
        if (!book.values.includes(j[8])) book.values.push(j[8]);
      }
  for (const book of books.values())
    book.values.sort((a, b) =>
      BigInt(read(a)) < BigInt(read(b))
        ? -1
        : BigInt(read(a)) > BigInt(read(b))
          ? 1
          : read(a) < read(b)
            ? -1
            : read(a) > read(b)
              ? 1
              : 0,
    );
  const jobFlags: number[] = [];
  const jobs = data.people.flatMap((row) => {
    let priorRank = 0;
    return row[14].map((j, i) => {
      const prior = row[14][i - 1],
        literalFrom = j[2] - (prior ? (prior[4] ?? prior[2]) : firstYear(row[2]));
      let from = literalFrom,
        day = j[3],
        calendarReference = false;
      const actual = j[2] * 366 + j[3],
        at = lowerBound(calendar, actual),
        anchor = dateAnchor(prior, row[18], row[2]);
      if (j[0] !== playerRole && actual >= anchor && calendar[at] === actual && dateWork > 0) {
        let rank = 0;
        for (let c = lowerBound(calendar, anchor); c <= at && dateWork > 0; c++) {
          dateWork--;
          if (!selectedDate(context.seed, read(row[0]), calendar[c])) continue;
          if (c === at) {
            from = rank;
            day = 0;
            calendarReference = true;
            break;
          }
          rank++;
        }
      }
      let wage = 0;
      if (j[8] !== null) {
        const rank = books.get(`${j[2]}:${j[9]}`)!.values.indexOf(j[8]);
        wage = rank - priorRank;
        priorRank = rank;
      }
      const hasTo = j[4] !== null,
        hasContract = j[6] !== null,
        same = hasTo && hasContract && j[4] === j[6] && j[5] === j[7],
        predicted = twoYears(j[2], j[3]),
        fixed = hasContract && j[6] === predicted[0] && j[7] === predicted[1],
        roleReference = !!row[18] && j[0] === row[18][0];
      jobFlags.push(
        Number(hasTo) +
          2 * Number(hasContract) +
          4 * Number(same) +
          8 * Number(fixed) +
          16 * Number(j[8] !== null) +
          32 * Number(j[9] !== null) +
          64 * Number(j[10] !== null) +
          128 * Number(roleReference) +
          256 * Number(calendarReference),
      );
      return [
        roleReference ? 0 : j[0],
        clubCodes.get(j)!,
        from,
        day,
        hasTo && !same ? j[4]! - (j[6] ?? j[2]) : 0,
        hasTo && !same ? j[5]! - (j[7] ?? j[3]) : 0,
        hasContract && !fixed ? j[6]! - j[2] : 0,
        hasContract && !fixed ? j[7]! - j[3] : 0,
        wage,
        j[9] ?? 0,
        j[10] === null ? 0 : j[10] - (j[4] ?? j[6] ?? j[2]),
      ];
    });
  });
  const draw = Array.from({ length: 4 }, () => new Uint8Array(data.people.length));
  let binary = false;
  const main = data.people.map((row, i) => {
    const result: unknown[] = [...row.slice(0, 14), ...row.slice(16)];
    const person = read(row[0]),
      qualities = qualityCodebook(context.seed, person);
    if (qualities.every((value, i) => value === row[5 + i]))
      for (let i = 5; i <= 7; i++) result[i] = null;
    const intention = row[16];
    if (
      intention &&
      intention[2] === scalarStream(`${context.seed}:coaching-intention:${person}`)()
    ) {
      result[14] = [...intention];
      (result[14] as unknown[])[2] = null;
    } else if (
      intention &&
      intention[2] >= 0 &&
      intention[2] < 1 &&
      Number.isInteger(intention[2] * 2 ** 32)
    ) {
      const value = intention[2] * 2 ** 32;
      for (let b = 0; b < 4; b++) draw[b][i] = Math.floor(value / 2 ** (8 * b)) % 256;
      result[14] = [...intention];
      (result[14] as unknown[])[2] = true;
      binary = true;
    }
    return result;
  });
  return compactStrings({
    version: 2,
    seed: context.seed,
    calendar,
    dictionary,
    people: columns(main, 18),
    jobs: columns(jobs, 11),
    jobFlags,
    jobCounts: data.people.map((r) => r[14].length),
    mentors,
    profiles: [...profiles],
    clubPool: pool,
    playerRole,
    wageBooks: [...books.values()].map((b) => [b.year, b.currency, b.values]),
    ...(binary ? { draw: draw.map(base64) as [string, string, string, string] } : {}),
  });
}
export function unpackCareerColumns(input: unknown, context: Context) {
  const data = schema.parse(input),
    count = data.jobCounts.length,
    total = data.jobCounts.reduce((n, v) => n + v, 0);
  if (count * 20 > MAX_CELLS || total * 11 > MAX_CELLS) throw failure();
  if (data.version === 2 ? data.order !== undefined : data.order === undefined) throw failure();
  const order = data.order === undefined ? undefined : readCareerOrder(data.order, count);
  if (data.version === 3) data.people = readCareerProfiles(data.people, count);
  if (
    data.mentors.length !== count ||
    data.people.some((c) => c.length !== count) ||
    data.jobs.some((c) => c.length !== total) ||
    data.jobFlags.length !== total
  )
    throw failure();
  const read = (i: number) => {
    const value = data.dictionary[i];
    if (!Number.isSafeInteger(i) || i < 0 || typeof value !== 'string') throw failure();
    return value;
  };
  const virtual = new Map(data.dictionary.map((value, index) => [value, index]));
  const intern = (value: string) => {
    let index = virtual.get(value);
    if (index === undefined) {
      index = data.dictionary.length;
      data.dictionary.push(value);
      virtual.set(value, index);
    }
    return index;
  };
  const expectedPool = poolNames(context);
  if (data.calendar.some((value, i) => i > 0 && value <= data.calendar[i - 1])) throw failure();
  if (
    data.seed !== context.seed ||
    read(data.playerRole) !== 'player' ||
    data.clubPool.length !== expectedPool.length ||
    data.clubPool.some((value, i) => read(value) !== expectedPool[i])
  )
    throw failure();
  const profiles = new Map<number, (typeof data.profiles)[number][1]>();
  for (const [club, group] of data.profiles) {
    if (profiles.has(club)) throw failure();
    profiles.set(club, group);
  }
  const books = new Map<string, number[]>();
  for (const [year, currency, values] of data.wageBooks) {
    const key = `${year}:${currency}`;
    if (books.has(key)) throw failure();
    let previous = -1n,
      previousText = '';
    for (const value of values) {
      const text = read(value);
      if (
        !/^\d{1,80}$/.test(text) ||
        BigInt(text) < previous ||
        (BigInt(text) === previous && text <= previousText)
      )
        throw failure();
      previous = BigInt(text);
      previousText = text;
    }
    books.set(key, values);
  }
  const draw = data.draw?.map(bytes);
  if (draw?.some((b) => b.length !== count)) throw failure();
  let offset = 0;
  let dateWork = MAX_CELLS;
  const persons = data.jobCounts.map((jobCount, person) => {
    const main = data.people.map((c) => c[person]);
    restoreStrings(main, read, intern);
    if (
      typeof main[0] !== 'number' ||
      typeof main[2] !== 'number' ||
      !Number.isSafeInteger(main[2])
    )
      throw failure();
    const owner = read(main[0]);
    if ([5, 6, 7].every((i) => main[i] === null))
      qualityCodebook(data.seed, owner).forEach((value, i) => {
        main[5 + i] = value;
      });
    const intention = main[14];
    const binaryMarker = Array.isArray(intention) && intention[2] === true;
    if (Array.isArray(intention) && intention[2] === null) {
      const restored = [...intention];
      restored[2] = scalarStream(`${data.seed}:coaching-intention:${owner}`)();
      main[14] = restored;
    } else if (binaryMarker) {
      if (!draw) throw failure();
      const restored = [...intention];
      restored[2] = draw.reduce((n, b, i) => n + b[person] * 2 ** (8 * i), 0) / 2 ** 32;
      main[14] = restored;
    }
    if (!binaryMarker && draw?.some((b) => b[person] !== 0)) throw failure();
    const jobs: Job[] = [];
    let priorRank = 0;
    for (let j = 0; j < jobCount; j++) {
      const raw = data.jobs.map((c) => c[offset]),
        flags = data.jobFlags[offset];
      offset++;
      if (
        (flags & 4 && (flags & 3) !== 3) ||
        (flags & 8 && !(flags & 2)) ||
        ((!(flags & 1) || flags & 4) && (raw[4] !== 0 || raw[5] !== 0)) ||
        ((!(flags & 2) || flags & 8) && (raw[6] !== 0 || raw[7] !== 0)) ||
        (!(flags & 16) && raw[8] !== 0) ||
        (!(flags & 32) && raw[9] !== 0) ||
        (!(flags & 64) && raw[10] !== 0) ||
        (flags & 256 && raw[3] !== 0) ||
        (flags & 128 && raw[0] !== 0)
      )
        throw failure();
      const prior = jobs.at(-1);
      let role = raw[0];
      if (flags & 128) {
        const coaching = main[16];
        if (!Array.isArray(coaching) || coaching.length !== 5 || typeof coaching[0] !== 'number')
          throw failure();
        role = coaching[0];
        if (role === data.playerRole) throw failure();
      }
      let from = raw[2] + (prior ? (prior[4] ?? prior[2]) : firstYear(main[2])),
        day = raw[3];
      if (flags & 256) {
        if (role === data.playerRole || raw[2] < 0) throw failure();
        let rank = raw[2],
          found = false;
        for (
          let c = lowerBound(data.calendar, dateAnchor(prior, main[16], main[2]));
          c < data.calendar.length;
          c++
        ) {
          if (--dateWork < 0) throw failure();
          const ordinal = data.calendar[c];
          if (!selectedDate(data.seed, owner, ordinal)) continue;
          if (rank-- > 0) continue;
          from = Math.floor(ordinal / 366);
          day = ordinal % 366;
          found = true;
          break;
        }
        if (!found) throw failure();
      }
      if (from < 1901 || from > 4000 || day < 0 || day > 365) throw failure();
      const predicted = twoYears(from, day),
        until = flags & 2 ? (flags & 8 ? predicted[0] : from + raw[6]) : null,
        untilDay = flags & 2 ? (flags & 8 ? predicted[1] : day + raw[7]) : null,
        to = flags & 1 ? (flags & 4 ? until : (until ?? from) + raw[4]) : null,
        toDay = flags & 1 ? (flags & 4 ? untilDay : (untilDay ?? day) + raw[5]) : null,
        currency = flags & 32 ? raw[9] : null;
      let wage: number | null = null;
      if (flags & 16) {
        const book = books.get(`${from}:${currency}`),
          rank = priorRank + raw[8];
        if (!book || !Number.isSafeInteger(rank) || rank < 0 || rank >= book.length)
          throw failure();
        wage = book[rank];
        priorRank = rank;
      }
      jobs.push([
        role,
        raw[1],
        from,
        day,
        to,
        toDay,
        until,
        untilDay,
        wage,
        currency,
        flags & 64 ? raw[10] + (to ?? until ?? from) : null,
      ]);
    }
    return { main, jobs, owner };
  });
  clubs(persons, data.clubPool, data.playerRole, true);
  const people = persons.map(({ main, jobs }, person) => {
    const mentors = data.mentors[person].map((m, i) => {
      const job = m[0] === null ? undefined : jobs[m[0] + i];
      if (m[0] !== null && !job) throw failure();
      const club = m[0] === null ? m[1] : job![1],
        profile = profiles.get(club)?.[m[0] === null ? m[2] : m[1]];
      if (!profile) throw failure();
      return [
        ...profile,
        club,
        ...(m[0] === null ? m.slice(3) : [job![2], job![3], job![4], job![5]]),
      ];
    });
    return [...main.slice(0, 14), jobs, mentors, ...main.slice(14)];
  });
  const ordered = order ? Array.from({ length: count }, () => people[0]) : people;
  if (order) order.forEach((original, stored) => (ordered[original] = people[stored]));
  return { data: { version: 1, people: ordered }, read };
}
