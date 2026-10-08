import { expect, it } from 'vitest';
import { encodeCsv } from './csv';
it('escapes Unicode, quotes and multiline text while neutralizing spreadsheet formulas', () => {
  const csv = encodeCsv(
    ['name', 'count'],
    [
      ['해람, "FC"\n다음 줄', 3],
      ['=HYPERLINK("https://example.invalid")', 1],
      ['  @SUM(1,2)', 2],
      ['\tformula', 0],
      [-3, '900719925474099312345'],
      ['-900719925474099312345', 0],
    ],
  );
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv).toContain('"해람, ""FC""\n다음 줄","3"');
  expect(csv).toContain('"\'=HYPERLINK');
  expect(csv).toContain('"\'  @SUM');
  expect(csv).toContain('"\'\tformula"');
  expect(csv).toContain('"-3","900719925474099312345"');
  expect(csv).toContain('"-900719925474099312345","0"');
  expect(() => encodeCsv(['n'], [[NaN]])).toThrow();
});
