const WIDTHS = [7, 5, 5, 5];
const failure = () => new Error('인물 진로 프로필 열 또는 구간 손상');
/** Version-three profile columns retain every scalar; runs alternate absent/present. */
export function packCareerProfiles(people: unknown[][]): unknown[][] {
  return people.map((values, column) => {
    if (column < 14) return values;
    const width = WIDTHS[column - 14],
      columns = Array.from({ length: width }, () => [] as unknown[]);
    const runs: number[] = [];
    let present = false,
      run = 0;
    for (const value of values) {
      const next = value !== null;
      if (next !== present) {
        runs.push(run);
        run = 0;
        present = next;
      }
      run++;
      if (!next) continue;
      if (!Array.isArray(value) || value.length !== width) throw failure();
      value.forEach((scalar, i) => columns[i].push(scalar));
    }
    runs.push(run);
    return [columns, runs];
  });
}
/** Called only after the containing person count/cell bound has been checked. */
export function readCareerProfiles(people: unknown[][], count: number): unknown[][] {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count * 20 > 16 * 1024 * 1024 ||
    people.length !== 18
  )
    throw failure();
  return people.map((values, column) => {
    if (column < 14) return values;
    if (values.length !== 2) throw failure();
    const [columns, runs] = values,
      width = WIDTHS[column - 14];
    if (
      !Array.isArray(columns) ||
      columns.length !== width ||
      !Array.isArray(runs) ||
      !runs.length ||
      runs.length > count + 1
    )
      throw failure();
    let total = 0,
      present = 0;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!Number.isSafeInteger(run) || run < 0 || (i > 0 && run === 0)) throw failure();
      total += run;
      if (total > count) throw failure();
      if (i % 2) present += run;
    }
    if (total !== count || columns.some((c) => !Array.isArray(c) || c.length !== present))
      throw failure();
    const restored: unknown[] = [];
    let row = 0;
    runs.forEach((run, i) => {
      for (let n = 0; n < run; n++) {
        restored.push(i % 2 ? columns.map((c) => c[row]) : null);
        if (i % 2) row++;
      }
    });
    return restored;
  });
}
