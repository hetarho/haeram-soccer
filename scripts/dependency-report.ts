/** pnpm exec tsx scripts/dependency-report.ts [checkout-root] */
import { resolve } from 'node:path';
import { dependencyReport } from './lib/dependency-report';
console.log(JSON.stringify(dependencyReport(resolve(process.argv[2] ?? '.')), null, 2));
