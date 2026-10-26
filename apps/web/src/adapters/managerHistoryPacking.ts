import {
  managerHistoryFactsSchema,
  managerTenureId,
  type ManagerDeparture,
  type ManagerHistoryFacts,
  type ManagerOutcome,
  type ManagerTenure,
} from '../../../../packages/contracts/src/manager-history';
import { checkpointSchemaFor } from '../../../../packages/contracts/src/match-model';
import type { CareerDate, World } from '../../../../packages/contracts/src/types';
import {
  carriesManagerHistory,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
  SaveCompatibilityError,
  type CheckpointSchema,
} from '../../../../packages/contracts/src/versions';

/**
 * Container-4 own-manager history (→SAVE-24, HIST-18; spec/ssot/SAVE.md): the world's tenure and
 * outcome facts and each own record's tenure link, beside the compact world, which carries none of
 * them inline. Strings (club, manager, person, name, keys, competition) are refs into the packer's
 * shared dictionary; dates and counters are stored exactly, an absent field as its documented zero.
 */
export interface PackedManagerHistory {
  version: 1;
  /** `[club, tracked year, day, revision, coverage, serial]`; coverage 0 founding, 1 activation. */
  header: number[];
  /** `TENURE_WIDTH` columns a tenure, in appointment order (`TENURE_COLUMNS`). */
  tenures: number[];
  /** `OUTCOME_WIDTH` columns an outcome, in settlement order (`OUTCOME_COLUMNS`). */
  outcomes: number[];
  /** Own records' tenures as runs `[ref, length, …]`: ref 0 none, n the n-th tenure. */
  records?: number[];
}

const VERSION = 1;
const HEADER_WIDTH = 6;
/**
 * `[manager, person + 1, name, interim, tracked year, day, appointed year, day, known since,
 * ended year, day, departure + 1, appointment key, departure key + 1]`; an absent date is `0, 0`
 * and an absent ref, year or departure 0.
 */
const TENURE_WIDTH = 14;
/**
 * `[kind, year, tenure, at year, day, …source]`: a league finish `[country, tier, group]`, a cup
 * title `[competition]` and a promotion `[club, from country, tier, group, to country, tier,
 * group]`, the unused source columns 0.
 */
const OUTCOME_WIDTH = 12;
const KINDS = ['league-finish', 'cup-title', 'promotion'] as const;
const COVERAGES = ['founding', 'activation'] as const;
const DEPARTURES: readonly ManagerDeparture[] = ['replaced', 'resigned', 'retired', 'expired'];
/** The world schema's record bound; a century of tracked changes stays far below the others. */
const MAX_RECORDS = 100000;
const MAX_TENURES = 100000;
const MAX_OUTCOMES = 100000;

const corrupt = (detail: string) => new Error(`감독 이력 압축 데이터 손상: ${detail}`);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

/**
 * The container a world is written in: manager history needs its own, whether or not the full
 * match model is active; otherwise the full-model or the current one (`checkpointSchemaFor`).
 */
export const checkpointContainerFor = (
  w: Pick<World, 'managerHistory' | 'matchModel' | 'npcSeason' | 'ownMatches'>,
): CheckpointSchema =>
  carriesManagerHistory(w) ? MANAGER_HISTORY_CHECKPOINT_SCHEMA : checkpointSchemaFor(w);

const date = (d: CareerDate | undefined) => (d ? [d.year, d.day] : [0, 0]);

/**
 * The history streams of `w`, or none for a career not yet tracked. `ref` is the packer's
 * dictionary; the caller removes `managerHistory` from its world copy.
 */
export function packManagerHistory(
  w: Pick<World, 'managerHistory' | 'ownMatches'>,
  ref: (value: string) => number,
): PackedManagerHistory | undefined {
  if (!carriesManagerHistory(w)) return undefined;
  const facts = w.managerHistory;
  if (!facts) throw corrupt('사실 없는 경기 연결');
  const index = new Map(facts.tenures.map((t, i) => [t.id, i]));
  const packed: PackedManagerHistory = {
    version: VERSION,
    header: [
      ref(facts.club),
      facts.trackedFrom.year,
      facts.trackedFrom.day,
      facts.trackedFrom.revision,
      COVERAGES.indexOf(facts.coverage),
      facts.serial,
    ],
    tenures: facts.tenures.flatMap((t) => [
      ref(t.manager),
      t.person === undefined ? 0 : ref(t.person) + 1,
      ref(t.name),
      t.interim ? 1 : 0,
      ...date(t.trackedFrom),
      ...date(t.appointed),
      t.knownSince ?? 0,
      ...date(t.ended),
      t.departure === undefined ? 0 : DEPARTURES.indexOf(t.departure) + 1,
      ref(t.appointmentKey),
      t.departureKey === undefined ? 0 : ref(t.departureKey) + 1,
    ]),
    outcomes: facts.outcomes.flatMap((o) => {
      const tenure = index.get(o.tenure);
      if (tenure === undefined) throw corrupt('성과 감독 참조');
      const s = o.source;
      const source =
        s.kind === 'league-finish'
          ? [ref(s.country), s.tier, s.group, 0, 0, 0, 0]
          : s.kind === 'cup-title'
            ? [ref(s.competition), 0, 0, 0, 0, 0, 0]
            : [
                ref(s.club),
                ref(s.from.country),
                s.from.tier,
                s.from.group,
                ref(s.to.country),
                s.to.tier,
                s.to.group,
              ];
      return [KINDS.indexOf(s.kind), s.year, tenure, ...date(o.at), ...source];
    }),
  };
  if (w.ownMatches.some((m) => m.managerTenure !== undefined)) {
    const runs: number[] = [];
    for (const m of w.ownMatches) {
      const tenure = m.managerTenure === undefined ? undefined : index.get(m.managerTenure);
      if (m.managerTenure !== undefined && tenure === undefined) throw corrupt('경기 감독 참조');
      const r = tenure === undefined ? 0 : tenure + 1;
      if (runs.length && runs[runs.length - 2] === r) runs[runs.length - 1]++;
      else runs.push(r, 1);
    }
    packed.records = runs;
  }
  return packed;
}

/**
 * Bounded preflight of a compact payload's history section, before anything is unpacked: a newer
 * section version is a compatibility failure (→SAVE-11), any other version corruption.
 */
export function readManagerHistoryFormat(section: unknown) {
  if (!isObject(section)) throw corrupt('형식');
  const { version } = section;
  if (isCount(version) && version > VERSION)
    throw new SaveCompatibilityError(
      '이 저장은 더 새로운 감독 이력 형식으로 기록되었습니다. 원본 파일을 내보내 보관하세요.',
    );
  if (version !== VERSION) throw corrupt('버전');
}

function rows(values: unknown, width: number, max: number, what: string) {
  if (
    !Array.isArray(values) ||
    values.length % width ||
    values.length > width * max ||
    !values.every((n) => isCount(n))
  )
    throw corrupt(`${what} 차원`);
  return Array.from({ length: values.length / width }, (_, i) =>
    (values as number[]).slice(i * width, (i + 1) * width),
  );
}
/** A stored date pair; `optional` allows the absent `0, 0`, nothing else may be partly zero. */
function readDate(year: number, day: number, optional: boolean, what: string) {
  if (optional && year === 0) {
    if (day !== 0) throw corrupt(`${what} 날짜`);
    return undefined;
  }
  return { year, day };
}

export interface UnpackedManagerHistory {
  facts: ManagerHistoryFacts;
  /** Per own record in order: its tenure ID, or undefined for none. */
  records: (string | undefined)[];
}
/**
 * The facts and record links of a history section. Every dimension, ref, run and zero column is
 * checked and every stream read to its end, so a section has exactly one encoding; the rebuilt
 * facts then pass T304's strict validator (identities, unique sources, order, tenure bounds)
 * before anything activates. Dangling, duplicate or malformed data is corruption.
 */
export function unpackManagerHistory(
  section: unknown,
  str: (n: number) => string,
  recordCount: number,
): UnpackedManagerHistory {
  readManagerHistoryFormat(section);
  const p = section as unknown as PackedManagerHistory;
  const h = p.header;
  if (!Array.isArray(h) || h.length !== HEADER_WIDTH || !h.every((n) => isCount(n)))
    throw corrupt('머리말');
  const coverage = COVERAGES[h[4]];
  if (!coverage) throw corrupt('관측 범위');
  const tenures = rows(p.tenures, TENURE_WIDTH, MAX_TENURES, '감독').map((t, i): ManagerTenure => {
    const optional = (value: number) => (value === 0 ? undefined : str(value - 1));
    if (t[3] > 1) throw corrupt('대행 표시');
    const departure = t[11] === 0 ? undefined : DEPARTURES[t[11] - 1];
    if (t[11] !== 0 && !departure) throw corrupt('떠난 이유');
    const person = optional(t[1]),
      appointed = readDate(t[6], t[7], true, '선임'),
      ended = readDate(t[9], t[10], true, '퇴임'),
      departureKey = optional(t[13]);
    return {
      id: managerTenureId(str(h[0]), i + 1),
      manager: str(t[0]),
      ...(person !== undefined ? { person } : {}),
      name: str(t[2]),
      interim: t[3] === 1,
      trackedFrom: readDate(t[4], t[5], false, '추적')!,
      ...(appointed ? { appointed } : {}),
      ...(t[8] !== 0 ? { knownSince: t[8] } : {}),
      ...(ended ? { ended } : {}),
      ...(departure ? { departure } : {}),
      appointmentKey: str(t[12]),
      ...(departureKey !== undefined ? { departureKey } : {}),
    };
  });
  const outcomes = rows(p.outcomes, OUTCOME_WIDTH, MAX_OUTCOMES, '성과').map(
    (o): ManagerOutcome => {
      const kind = KINDS[o[0]],
        tenure = tenures[o[2]];
      if (!kind) throw corrupt('성과 종류');
      if (!tenure) throw corrupt('성과 감독 참조');
      const s = o.slice(5);
      const used = kind === 'league-finish' ? 3 : kind === 'cup-title' ? 1 : 7;
      if (s.slice(used).some((n) => n !== 0)) throw corrupt('성과 빈 열');
      const year = o[1];
      return {
        source:
          kind === 'league-finish'
            ? { kind, year, country: str(s[0]), tier: s[1], group: s[2] }
            : kind === 'cup-title'
              ? { kind, year, competition: str(s[0]) }
              : {
                  kind,
                  year,
                  club: str(s[0]),
                  from: { country: str(s[1]), tier: s[2], group: s[3] },
                  to: { country: str(s[4]), tier: s[5], group: s[6] },
                },
        tenure: tenure.id,
        at: readDate(o[3], o[4], false, '성과')!,
      };
    },
  );
  const parsed = managerHistoryFactsSchema.safeParse({
    club: str(h[0]),
    trackedFrom: { year: h[1], day: h[2], revision: h[3] },
    coverage,
    serial: h[5],
    tenures,
    outcomes,
  });
  if (!parsed.success) throw corrupt(parsed.error.issues[0]?.message ?? '사실');
  const records: (string | undefined)[] = [];
  if (p.records !== undefined) {
    const runs = p.records;
    if (!Array.isArray(runs) || runs.length % 2 || runs.length > 2 * MAX_RECORDS)
      throw corrupt('경기 감독 구간');
    for (let i = 0; i < runs.length; i += 2) {
      const [r, length] = [runs[i], runs[i + 1]];
      if (
        !isCount(r, tenures.length) ||
        !isCount(length, MAX_RECORDS) ||
        length < 1 ||
        (i && runs[i - 2] === r) ||
        records.length + length > recordCount
      )
        throw corrupt('경기 감독 구간');
      const tenure = r === 0 ? undefined : tenures[r - 1]!.id;
      for (let n = 0; n < length; n++) records.push(tenure);
    }
    if (records.length !== recordCount || records.every((t) => t === undefined))
      throw corrupt('경기 감독 구간');
  } else records.push(...Array<undefined>(recordCount).fill(undefined));
  return { facts: parsed.data, records };
}
