// T689 cv04-clr: pnpm exec tsx artifacts/benchmarks/scoring-261109-cv04-clr/analysis/fingerprint.ts — prints the
// computation fingerprint grid-bands.ts records (cv04-ent's `fingerprint.ts`) with the Node version and the
// closure's file count, so a moved fingerprint can be told apart by runtime or by source.
import { measurementIdentity } from '../../../../scripts/lib/measurement-identity';

const id = measurementIdentity('scripts/grid-bands.ts');
console.log(id.sha256.slice(0, 8), id.files, process.version, JSON.stringify(id).length);
