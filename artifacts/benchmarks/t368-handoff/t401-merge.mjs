// T401: merges scripts/match-parity.ts --report --reference parts of one source and round into one
// artifact. The part holding the 16 forced pairings gives the MATCH-29 readings (their paired
// verdicts need every pairing in one run); conditions come in the corpus order of the parts given;
// every part's command, date and wall time are kept in `provenance.parts`.
//   node t401-merge.mjs <out.json> <part.json> ...
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...files] = process.argv.slice(2);
const parts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const first = parts[0];
for (const p of parts) {
  if (p.partial) throw new Error('a part did not finish');
  if (p.provenance.gitHead !== first.provenance.gitHead || p.provenance.gitDirty)
    throw new Error('parts from different or dirty sources');
  if (p.provenance.fingerprint.sha256 !== first.provenance.fingerprint.sha256)
    throw new Error('parts with different fingerprints');
}
const pairing = parts.find((p) => p.tacticPairingParity) ?? first;
const merged = {
  ...pairing,
  provenance: {
    ...first.provenance,
    date: parts.map((p) => p.provenance.date).sort().at(-1),
    parts: parts.map((p) => ({
      date: p.provenance.date,
      command: p.provenance.command,
      elapsedSeconds: p.speed?.elapsedSeconds,
      conditions: p.conditions.map((c) => c.condition),
    })),
  },
  speed: {
    ...pairing.speed,
    elapsedSeconds: parts.reduce((a, p) => a + (p.speed?.elapsedSeconds ?? 0), 0),
    msPerMatch: Object.assign({}, ...parts.map((p) => p.speed?.msPerMatch ?? {})),
  },
  againstArtifact: pairing.againstArtifact && {
    ...pairing.againstArtifact,
    conditions: parts.flatMap((p) => p.againstArtifact?.conditions ?? []),
  },
  conditions: parts.flatMap((p) => p.conditions),
  missing: [...new Set(parts.flatMap((p) => p.missing ?? []))],
};
delete merged.provenance.command;
writeFileSync(out, `${JSON.stringify(merged, null, 1)}\n`);
console.log(`merged ${merged.conditions.length} conditions from ${parts.length} parts`);
