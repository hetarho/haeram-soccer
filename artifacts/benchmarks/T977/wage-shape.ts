import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { marketWageUnits, wageDivision } from '../../../packages/engine/src/market-prices';
import { setTunables } from '../../../scripts/lib/market-tunables';

const output = Object.fromEntries(
  process.argv.slice(2).map((path) => {
    const config = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const tunables = setTunables(config);
    const secondTier = wageDivision('ENG', 1, 70);
    return [
      basename(path, '.json'),
      {
        tunables,
        ability80To60: marketWageUnits(0, 80, 30, 80) / marketWageUnits(0, 60, 30, 60),
        secondToTop: marketWageUnits(secondTier, 70, 30, 70) / marketWageUnits(0, 70, 30, 70),
      },
    ];
  }),
);
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
