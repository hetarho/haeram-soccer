import type { World } from '../../../../packages/contracts/src/types';
import { europeanEras } from '../../../../packages/engine/src/europe';
/** Continental lineages under one key whatever the competition was called that season. */
export const LINEAGES = [
  { key: 'ucl', first: 'European Cup', founded: 1955 },
  { key: 'uel', first: 'UEFA Cup', founded: 1971 },
  { key: 'uecl', first: 'Europa Conference League', founded: 2021 },
  { key: 'cwc', first: 'Cup Winners Cup', founded: 1960 },
];
/** A lineage as it is called now: this season's name, else the last one played, else its first. */
export function lineageName(w: World, { key, first }: (typeof LINEAGES)[number]) {
  return (
    europeanEras(w.year).find((era) => era.key === key)?.name ??
    w.history
      .findLast((h) => h.europe.some((e) => e.kind === key))
      ?.europe.find((e) => e.kind === key)?.name ??
    first
  );
}
