/**
 * Who keeps winning (T803): pure counts over a list of one competition's winners, a season each —
 * a country's league champions (`era-wage-spread.ts --champions-runs`) or a world's Ballon d'Or
 * winners (`ballon-dor-podiums.ts`). A list holds the seasons played only, so the war's gap
 * (1939/40–1945/46 not played, →WORLD-14) breaks no run: consecutive entries are consecutive
 * seasons, as the generation digest reads league runs (→WEB-115, →HIST-13).
 */

/** One season's winner: the season (its starting year) and who won it. */
export interface Won {
  year: number;
  who: string;
}
/** Consecutive seasons one winner took: its first and last season and how many. */
export interface Run {
  who: string;
  from: number;
  to: number;
  titles: number;
}

/** The list in season order; a season listed twice is an error, not a tie. */
export function seasonOrder(list: readonly Won[]): Won[] {
  const ordered = [...list].sort((a, b) => a.year - b.year);
  for (let i = 1; i < ordered.length; i++)
    if (ordered[i]!.year === ordered[i - 1]!.year)
      throw new Error(`season ${ordered[i]!.year} has two winners`);
  return ordered;
}

/** The seasons `from`–`to` of the list, both included. */
export const within = (list: readonly Won[], from: number, to: number) =>
  list.filter((won) => won.year >= from && won.year <= to);

/** Every run in season order: a winner's consecutive entries, a single title a run of one. */
export function titleRuns(list: readonly Won[]): Run[] {
  const runs: Run[] = [];
  for (const won of seasonOrder(list)) {
    const last = runs.at(-1);
    if (last && last.who === won.who) {
      last.to = won.year;
      last.titles++;
    } else runs.push({ who: won.who, from: won.year, to: won.year, titles: 1 });
  }
  return runs;
}

/** The longest run's length and every run of that length, earliest first; 0 and none for an empty list. */
export function longestRuns(list: readonly Won[]) {
  const runs = titleRuns(list);
  const titles = Math.max(0, ...runs.map((run) => run.titles));
  return { titles, runs: runs.filter((run) => run.titles === titles && titles > 0) };
}

/** How many runs reach `length` titles or more. */
export const runsOfAtLeast = (list: readonly Won[], length: number) =>
  titleRuns(list).filter((run) => run.titles >= length).length;

/**
 * The most titles one winner takes in any `seasons` consecutive entries (the whole list when it is
 * shorter), with every winner reaching it in the order they first do, and the first season of the
 * first window where one does.
 */
export function mostInWindow(list: readonly Won[], seasons: number) {
  const ordered = seasonOrder(list);
  const span = Math.min(seasons, ordered.length);
  let titles = 0,
    from: number | undefined,
    who: string[] = [];
  for (let start = 0; start + span <= ordered.length && span > 0; start++) {
    const counts = new Map<string, number>();
    for (const won of ordered.slice(start, start + span))
      counts.set(won.who, (counts.get(won.who) ?? 0) + 1);
    for (const [name, count] of counts) {
      if (count > titles) {
        titles = count;
        from = ordered[start]!.year;
        who = [name];
      } else if (count === titles && !who.includes(name)) who.push(name);
    }
  }
  return { titles, who, from };
}

/** The median of `values`, the mean of the two middle ones for an even count; NaN when empty. */
export function median(values: readonly number[]) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
