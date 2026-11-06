// T689 cv04-ent: pnpm exec tsx artifacts/benchmarks/scoring-261106-cv04-ent/analysis/fingerprint.ts — prints the
// computation fingerprint grid-bands.ts records (`provenance.computationFingerprint.sha256`), read before any
// measurement so cv04-kpr's `B` and `P` reads are reused only while it equals cv04-kpr's 1e9ada38.
import { measurementIdentity } from '../../../../scripts/lib/measurement-identity';

const id = measurementIdentity('scripts/grid-bands.ts');
console.log(id.sha256.slice(0, 8), JSON.stringify(id).length);
