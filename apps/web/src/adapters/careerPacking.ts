import { z } from 'zod';
import type { PersonCareer } from '../../../../packages/contracts/src/types';
import { personCareerSchema } from '../../../../packages/contracts/src/schema';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { packCareerOrder } from './careerOrder';
import { packCareerProfiles } from './careerProfiles';
import {
  packCareerColumns,
  unpackCareerColumns,
  type CareerContext,
  type PackedCareerColumns,
} from './careerColumns';
const n = z.number().int(),
  index = n.nonnegative(),
  optionalIndex = index.nullable(),
  optionalNumber = n.nullable();
const job = z.tuple([
  index,
  index,
  n,
  n,
  optionalNumber,
  optionalNumber,
  optionalNumber,
  optionalNumber,
  optionalIndex,
  optionalIndex,
  optionalNumber,
]);
const mentor = z.tuple([index, index, optionalIndex, index, n, n, optionalNumber, optionalNumber]);
const row = z.tuple([
  index,
  index,
  n,
  index,
  n,
  n,
  n,
  n,
  index,
  optionalIndex,
  z.boolean().nullable(),
  z.tuple([index, n]).nullable(),
  z.tuple([optionalIndex, n]).nullable(),
  z.array(n).nullable(),
  z.array(job),
  z.array(mentor),
  z
    .tuple([
      n,
      n,
      z.number().finite(),
      z.boolean(),
      optionalNumber,
      optionalNumber,
      z.boolean().nullable(),
    ])
    .nullable(),
  z.tuple([n, n, n, optionalNumber, optionalNumber]).nullable(),
  z.tuple([index, z.number().finite(), z.number().finite(), n, n]).nullable(),
  z.tuple([z.number().finite(), z.number().finite(), index, n, n]).nullable(),
]);
// Share the exact compact scalar/optional shapes without reparsing expanded job/mentor facts.
const baseRow = z.tuple([
  row.def.items[0],
  ...row.def.items.slice(1, 14),
  ...row.def.items.slice(16),
]);
const schema = z.strictObject({ version: z.literal(1), people: z.array(row) });
export type CareerRows = z.infer<typeof schema>;
export type PackedCareers = CareerRows | PackedCareerColumns;
export function packCareers(
  people: Record<string, PersonCareer>,
  context: CareerContext,
): PackedCareerColumns {
  const dictionary: string[] = [],
    indices = new Map<string, number>();
  const id = (value: string) => {
    let index = indices.get(value);
    if (index === undefined) {
      index = dictionary.length;
      dictionary.push(value);
      indices.set(value, index);
    }
    return index;
  };
  const rows = packCareerRows(people, id);
  const grouped = rows.people.map((row, original) => ({ row, original }));
  grouped.sort((a, b) => {
    const count = b.row[14].length - a.row[14].length;
    const year = (a.row[18]?.[3] ?? a.row[2] + 1000) - (b.row[18]?.[3] ?? b.row[2] + 1000);
    const left = dictionary[a.row[0]],
      right = dictionary[b.row[0]];
    return count || year || (left < right ? -1 : left > right ? 1 : 0);
  });
  const packed = packCareerColumns(
    { version: 1, people: grouped.map(({ row }) => row) },
    id,
    (index) => dictionary[index],
    context,
    dictionary,
  );
  return {
    ...packed,
    people: packCareerProfiles(packed.people),
    version: 3,
    order: packCareerOrder(grouped.map(({ original }) => original)),
  };
}
/** Validated row representation; version-1 checkpoints retain this immutable interpretation. */
export function packCareerRows(
  people: Record<string, PersonCareer>,
  id: (value: string) => number,
): CareerRows {
  return {
    version: 1,
    people: Object.entries(people).map(([key, source]) => {
      const p = personCareerSchema.parse(source);
      if (key !== p.id) throw new Error('인물 레지스트리 키 손상');
      return [
        id(p.id),
        id(p.name),
        p.born,
        id(p.position),
        p.professionalism,
        p.qualities.understanding,
        p.qualities.teaching,
        p.qualities.judgement,
        id(p.playing),
        p.club === undefined ? null : id(p.club),
        p.formerOwn ?? null,
        p.origin ? [id(p.origin.club), p.origin.slot] : null,
        p.loan ? [p.loan.club === undefined ? null : id(p.loan.club), p.loan.until] : null,
        p.ownCareer ?? null,
        p.employment.map((j) => [
          id(j.role),
          id(j.club),
          j.from.year,
          j.from.day,
          j.to?.year ?? null,
          j.to?.day ?? null,
          j.contractUntil?.year ?? null,
          j.contractUntil?.day ?? null,
          j.wage === undefined ? null : id(j.wage),
          j.currency === undefined ? null : id(j.currency),
          j.grownThrough ?? null,
        ]),
        p.mentors.map((m) => [
          id(m.manager),
          id(m.name),
          m.school === undefined ? null : id(m.school),
          id(m.club),
          m.from.year,
          m.from.day,
          m.to?.year ?? null,
          m.to?.day ?? null,
        ]),
        p.intention
          ? [
              p.intention.at.year,
              p.intention.at.day,
              p.intention.draw,
              p.intention.willing,
              p.intention.encouraged?.at.year ?? null,
              p.intention.encouraged?.at.day ?? null,
              p.intention.encouraged?.changed ?? null,
            ]
          : null,
        p.retirement
          ? [
              p.retirement.announced.year,
              p.retirement.announced.day,
              p.retirement.year,
              p.retirement.at?.year ?? null,
              p.retirement.at?.day ?? null,
            ]
          : null,
        p.coaching
          ? [
              id(p.coaching.role),
              p.coaching.ability,
              p.coaching.potential,
              p.coaching.at.year,
              p.coaching.at.day,
            ]
          : null,
        p.management
          ? [
              p.management.ability,
              p.management.potential,
              id(p.management.school),
              p.management.at.year,
              p.management.at.day,
            ]
          : null,
      ];
    }),
  };
}
function date(year: number | null, day: number | null) {
  if ((year === null) !== (day === null)) throw new Error('인물 날짜 압축 차원 손상');
  return year === null ? undefined : { year, day: day! };
}
export function unpackCareers(
  input: unknown,
  read: (index: number) => string,
  context?: CareerContext,
  validateExpandedWorld = false,
): Record<string, PersonCareer> {
  const header = z.object({ version: z.number().int() }).safeParse(input);
  if (header.success && header.data.version > 3)
    throw new SaveCompatibilityError(
      '지원하지 않는 인물 이력 압축 버전입니다. 원본 파일을 보관하세요.',
    );
  if (header.success && (header.data.version === 2 || header.data.version === 3)) {
    if (!context) throw new Error('인물 이력 압축 구단 정보 손상');
    const restored = unpackCareerColumns(input, context);
    input = restored.data;
    read = restored.read;
  }
  // Only the private load path defers duplicate row/person parsing to validateWorld.
  // Standalone readers remain strict; compact dimensions/references are always checked above.
  const deferred =
    validateExpandedWorld &&
    header.success &&
    (header.data.version === 2 || header.data.version === 3);
  const data = deferred ? (input as CareerRows) : schema.parse(input);
  const people: Record<string, PersonCareer> = Object.create(null);
  for (const r of data.people) {
    if (deferred) baseRow.parse([...r.slice(0, 14), ...r.slice(16)]);
    if (r[16] && (r[16][4] === null) !== (r[16][6] === null))
      throw new Error('진로 권유 압축 차원 손상');
    const intention = r[16],
      retirement = r[17],
      coaching = r[18],
      management = r[19];
    const value = {
      id: read(r[0]),
      name: read(r[1]),
      born: r[2],
      position: read(r[3]),
      professionalism: r[4],
      qualities: { understanding: r[5], teaching: r[6], judgement: r[7] },
      playing: read(r[8]),
      ...(r[9] === null ? {} : { club: read(r[9]) }),
      ...(r[10] === null ? {} : { formerOwn: r[10] }),
      ...(r[11] ? { origin: { club: read(r[11][0]), slot: r[11][1] } } : {}),
      ...(r[12]
        ? { loan: { ...(r[12][0] === null ? {} : { club: read(r[12][0]) }), until: r[12][1] } }
        : {}),
      ...(r[13] ? { ownCareer: r[13] } : {}),
      employment: r[14].map((j) => ({
        role: read(j[0]),
        club: read(j[1]),
        from: { year: j[2], day: j[3] },
        ...(date(j[4], j[5]) ? { to: date(j[4], j[5]) } : {}),
        ...(date(j[6], j[7]) ? { contractUntil: date(j[6], j[7]) } : {}),
        ...(j[8] === null ? {} : { wage: read(j[8]) }),
        ...(j[9] === null ? {} : { currency: read(j[9]) }),
        ...(j[10] === null ? {} : { grownThrough: j[10] }),
      })),
      mentors: r[15].map((m) => ({
        manager: read(m[0]),
        name: read(m[1]),
        ...(m[2] === null ? {} : { school: read(m[2]) }),
        club: read(m[3]),
        from: { year: m[4], day: m[5] },
        ...(date(m[6], m[7]) ? { to: date(m[6], m[7]) } : {}),
      })),
      ...(intention
        ? {
            intention: {
              at: { year: intention[0], day: intention[1] },
              draw: intention[2],
              willing: intention[3],
              ...(date(intention[4], intention[5])
                ? { encouraged: { at: date(intention[4], intention[5]), changed: intention[6] } }
                : {}),
            },
          }
        : {}),
      ...(retirement
        ? {
            retirement: {
              announced: { year: retirement[0], day: retirement[1] },
              year: retirement[2],
              ...(date(retirement[3], retirement[4])
                ? { at: date(retirement[3], retirement[4]) }
                : {}),
            },
          }
        : {}),
      ...(coaching
        ? {
            coaching: {
              role: read(coaching[0]),
              ability: coaching[1],
              potential: coaching[2],
              at: { year: coaching[3], day: coaching[4] },
            },
          }
        : {}),
      ...(management
        ? {
            management: {
              ability: management[0],
              potential: management[1],
              school: read(management[2]),
              at: { year: management[3], day: management[4] },
            },
          }
        : {}),
    };
    const p = deferred ? (value as PersonCareer) : personCareerSchema.parse(value);
    if (people[p.id]) throw new Error('중복 압축 인물 참조');
    people[p.id] = p;
  }
  return people;
}
