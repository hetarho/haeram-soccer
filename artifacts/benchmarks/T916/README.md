# T916 generation repair recipe (prepared by T943)

Frozen recipe for T916's four-variant experiment, rebuilt from retained Git objects because the
original temporary proposals (`.tmp/nf14-evidence/model-repair-resume/proposal.md`,
`c2-proposal.md`) no longer exist. Nothing here has run a world. No result, model pass or timing is
claimed.

| file | role |
|---|---|
| `scripts/natural-football/generation-repair.mjs` | CLI: `prepare [--write]` (Git objects only) and `execute` (host action) |
| `scripts/natural-football/generation-repair-recipe.ts` | frozen constants and fail-closed checks |
| `scripts/natural-football/generation-repair-run.ts` | the child run, bundled from each patched historical export |
| `control.patch`, `c1.patch`, `c2.patch`, `c1-c2.patch` | the exact candidate patches (control is empty) |
| `manifest.json` | source, control, runtime trees, transitive closure, anchors, patches, toolchain, oracle and recipe hashes |

The recipe hash and the manifest hash a review must name are printed by
`pnpm exec tsx scripts/natural-football/generation-repair.mjs prepare`. The manifest records the
recipe hash. The manifest hash is the SHA-256 of the manifest's canonical JSON (sorted keys).

## Review receipt

`execute` refuses without a JSON receipt like this, written by a session other than the author's:

```json
{
  "task": "T943",
  "recipeHash": "<recipe.hash from manifest.json>",
  "manifestHash": "<manifestHash printed by prepare>",
  "patches": { "control": "e3b0c442…", "c1": "eb09a8a9…", "c2": "413ba80a…", "c1-c2": "1e026a6e…" },
  "reviewer": { "provider": "codex", "session": "<review session id>" },
  "author": { "provider": "claude", "session": "<authoring session id>" },
  "approved": true
}
```

Patch hashes must be the full values in `manifest.json`. The surviving reviews of the war replay
(`19dd8ae6…`) and of the 1950 continuation (`323bc389…`) cover other workloads and do not match.

## Inspection checklist for the independent reviewer

1. `prepare` (without `--write`) prints `ok`, with the same recipe and manifest hashes as the
   receipt. It fails closed on a missing or changed commit, anchor, patch, runtime tree or manifest.
2. Source `6e9b05dc…` and control `fc5d4c26…` runtime trees (`packages`, root manifests, lockfile,
   `tsconfig.json`, `.node-version`) differ only in `material.test.ts` and
   `persisted-world.integration.test.ts`. These blob comparisons come from Git, not from labels.
3. Anchors: historical `world.ts` (blob `0c029d77…`, sha256 `59405eea…`) and `npc-careers.ts` (blob
   `93dbabb8…`, sha256 `38829e41…`) match the 1950 continuation's recorded source hashes.
4. C1: `generatedPlayer` always uses the existing `spreadHeadroom(age)` and floors the generated
   player's potential at his historical `mainOvr` before the wage is set. It still makes one headroom
   draw, so the draw count is unchanged. `makePlayer` keeps `RELEASED_HEADROOM`, initial ability stays
   flat (no `SQUAD_SPREAD` level spread), and IDs, names and attributes are unchanged.
5. C2: NPC youth subtracts exactly 11 from the single existing raw potential draw. Width, order,
   count, headroom and draws stay the same. C1+C2 is the union of both hunks. No other coefficient
   is involved.
6. Run (`generation-repair-run.ts`): a fresh `historyWorld('persisted-world-invariants')`,
   one `advanceRound(w, undefined, false)`, then `advanceDays(w, 1, undefined, false)` until 1950
   day 0. Every first-day country/tier row is kept, along with the potential, wage and value sums.
   Every strict-order failure is kept, with no 1946–1948 exception. All 1950 cells are compared with
   the control's original 1930 baseline at ±5. A missing cell counts as outside the band.
7. Endpoint: `sha256(utf8(JSON.stringify(world)))` with its byte count. The oracle is
   `9a3d6e96…568be2` (26,404,832 bytes). This serializer is declared, not proved. Only an exact
   control reproduction proves it. A mismatch is recorded as unresolved and the oracle never
   changes.
8. Isolation: each variant gets its own fresh `git archive` export and patch. Its esbuild bundle
   may take inputs only from that export or from third-party `node_modules`. Production source is
   never touched, and no checkpoint, cache or borrowed output is used.
9. Execution: `execute --review <receipt> --heavy-lock <installed gusta src/check-cache.mjs> --out
   <fresh dir>` takes the CLI's own shared `withHeavyLock` (a flag alone is not a lock). It runs at
   most four owned children through `runVerificationStage`, which cleans up descendants, within
   T916's 30-minute cap. A timeout cancels the children and leaves them unfinished. Each run
   records its inputs, completion, endpoint and order failures. The execution report records
   whether each variant's 1930 baseline equals the control's, plus the cells.

## Limits

- `manifest.json` was prepared on Node v26.8.1, not the pinned `.node-version` 24.22.1. The
  closure fingerprint includes the Node version, so execution under any other Node fails the
  manifest check until the recipe is prepared again and re-reviewed.
- The closure is the run entry's transitive import graph in the historical export (216 files) plus
  the declared catalog and root inputs. Each variant's bundle drew exactly 216 sources from its
  own export during preparation.
- T916's failed-gate history, its 30-minute cap and every original world/model gate are unchanged.
  A surviving one-seed candidate would still need the full 1930–1970 case and the five-seed joint
  targets.
