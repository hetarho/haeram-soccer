import type { Player, World } from '../../../../packages/contracts/src/types';
import { ATTRIBUTES } from '../../../../packages/contracts/src/player';
import { message } from '../../../../packages/contracts/src/messages';
import { packBitColumns, readBitColumns, type BitColumns } from './bitpacking';

/** Column values retain nested facts; sparse columns retain exact optional-field presence. */
export interface PackedSquads {
  version: 1;
  clubs: string[];
  counts: number[];
  columns: { key: string; values: unknown[]; at?: number[] }[];
  attrs: BitColumns;
  /** Existing saves may contain precision beyond hundredths; never round those facts away. */
  exactAttrs?: [number, number][];
}
const invalid = () => new Error(message('copy.packing.5ccd8ed532'));
export function packSquads(squads: NonNullable<World['squads']>): PackedSquads {
  const clubs = Object.keys(squads);
  const players = clubs.flatMap((club) => squads[club]!);
  const keys = [...new Set(players.flatMap((p) => Object.keys(p)))].filter(
    (key) => key !== 'attrs',
  );
  const values: number[] = [],
    exactAttrs: [number, number][] = [];
  for (const player of players) {
    if (Object.keys(player.attrs).length !== ATTRIBUTES.length) throw invalid();
    for (const key of ATTRIBUTES) {
      const value = player.attrs[key],
        hundredths = Math.round(value * 100);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw invalid();
      if (hundredths / 100 !== value) exactAttrs.push([values.length, value]);
      values.push(hundredths);
    }
  }
  return {
    version: 1,
    clubs,
    counts: clubs.map((club) => squads[club]!.length),
    columns: keys.map((key) => {
      const at = players.flatMap((player, i) => (Object.hasOwn(player, key) ? [i] : []));
      return {
        key,
        values: at.map((i) => players[i]![key as keyof Player]),
        ...(at.length === players.length ? {} : { at }),
      };
    }),
    attrs: packBitColumns(values, ATTRIBUTES.length),
    ...(exactAttrs.length ? { exactAttrs } : {}),
  };
}
export function unpackSquads(p: PackedSquads): NonNullable<World['squads']> {
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.clubs) ||
    !Array.isArray(p.counts) ||
    p.clubs.length > 20000 ||
    p.clubs.length !== p.counts.length ||
    p.clubs.some((id) => typeof id !== 'string') ||
    new Set(p.clubs).size !== p.clubs.length ||
    p.counts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 20000) ||
    !Array.isArray(p.columns) ||
    p.columns.length > 100
  )
    throw invalid();
  const count = p.counts.reduce((a, b) => a + b, 0);
  if (count > 1_000_000 || !p.attrs || p.attrs.count !== count) throw invalid();
  const players: Record<string, unknown>[] = Array.from({ length: count }, () => ({}));
  const seen = new Set<string>();
  for (const column of p.columns) {
    if (
      !column ||
      typeof column.key !== 'string' ||
      column.key === 'attrs' ||
      seen.has(column.key) ||
      !Array.isArray(column.values) ||
      (column.at !== undefined && !Array.isArray(column.at))
    )
      throw invalid();
    seen.add(column.key);
    const at = column.at ?? players.map((_, i) => i);
    if (
      at.length !== column.values.length ||
      new Set(at).size !== at.length ||
      at.some(
        (n, i) => !Number.isSafeInteger(n) || n < 0 || n >= count || (i > 0 && n <= at[i - 1]!),
      )
    )
      throw invalid();
    at.forEach((row, i) =>
      Object.defineProperty(players[row]!, column.key, {
        value: column.values[i],
        enumerable: true,
        writable: true,
        configurable: true,
      }),
    );
  }
  const attrs = readBitColumns(p.attrs, ATTRIBUTES.length);
  const numbers = attrs.take(count * ATTRIBUTES.length).map((n) => n / 100);
  attrs.done();
  if (p.exactAttrs !== undefined) {
    if (!Array.isArray(p.exactAttrs)) throw invalid();
    const seen = new Set<number>();
    for (const row of p.exactAttrs) {
      if (!Array.isArray(row) || row.length !== 2) throw invalid();
      const [i, value] = row;
      if (
        !Number.isSafeInteger(i) ||
        i < 0 ||
        i >= numbers.length ||
        seen.has(i) ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      )
        throw invalid();
      seen.add(i);
      numbers[i] = value;
    }
  }
  players.forEach((player, i) => {
    player.attrs = Object.fromEntries(
      ATTRIBUTES.map((key, j) => [key, numbers[i * ATTRIBUTES.length + j]]),
    );
  });
  let at = 0;
  return Object.fromEntries(
    p.clubs.map((club, i) => {
      const end = at + p.counts[i]!;
      const squad = players.slice(at, end) as unknown as Player[];
      at = end;
      return [club, squad];
    }),
  );
}
