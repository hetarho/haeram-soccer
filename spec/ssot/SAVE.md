# SAVE Browser persistence and protocol
> r8 | Define the implemented browser-demo behavior for browser persistence and protocol.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Envelope contains schema/engine/catalog/world ID/generation/parentGeneration/codec/checksum/payload. Codec is gzip-base64; checksum is SHA-256 of uncompressed canonical JSON.
- SAVE-3 [o] One active world and previous checkpoint use keys haeram-soccor:slot:a/b and haeram-soccor:manifest; manifest switches only after validated candidate write/readback.
- SAVE-4 [o] Maximum encoded checkpoint is 1.5 MiB conservative UTF-16; total namespaced use <=3.5 MiB. Imports cap file at 4 MiB and decompressed JSON at 16 MiB.
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
- SAVE-6 [o] Exclusive Web Lock owns writing; read-only tabs are notified and queue for the lock, so when the writing tab closes a read-only tab reloads the latest checkpoint and becomes the writer. Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, codec and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Autosave settled fixture/round and committed management decisions; UI distinguishes active and last persisted revisions.
- SAVE-9 [o] Export/import uses the same envelope; checksum provides corruption detection only. All successful changes remain local.

- SAVE-10 [o] Current engine rules are 1.5.0 (fair founding strength, XI ratings for every club, excess-only fatigue, faster recovery, recorded match xG; 1.4.0 added player-duel matches and care actions; 1.3.0 added season close after the final round, summer window from the close, 46-game league income, business delegation, cash warnings). Versions 1.0.0 through 1.4.0 checkpoints remain accepted; writer activation upgrades only rules metadata/revision through a pure transformation, preserves all retained facts and missing optional defaults, and commits through the existing two-slot protocol. Failure preserves old disk data and exportable new memory state; read-only views do not perform disk upgrades.

- SAVE-11 [o] Unsupported selected save versions/catalogs are compatibility failures, not corruption-recovery permission. Do not automatically fall back to an older checkpoint and overwrite a newer incompatible career; preserve raw slots/manifest and expose export/import recovery. Actual corrupted compatible checkpoints may recover the validated predecessor.

- SAVE-12 [o] Browser checkpoint storage uses an injected worker validator; compression and world-schema validation remain in the worker codec path. Existing codec/repository imports preserve their public save API, and compatibility errors remain typed across the bridge.

- SAVE-13 [o] Lossless compact encoding must retain the complete canonical career and support existing compact checkpoints. The baseline and active-management 100-season profiles, including a settled active round after the century, must remain within →SAVE-4 without pruning records or raising budgets. Invalid compact metadata fails before activation.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r8 261009 SAVE-10✎ current rules 1.4.0→1.5.0, accepting 1.0.0–1.4.0 checkpoints; match records may carry xG
- r7 261009 SAVE-10✎ current rules 1.3.0→1.4.0, accepting 1.0.0–1.3.0 checkpoints
- r6 261009 SAVE-10✎ current rules 1.2.0→1.3.0, accepting 1.0.0, 1.1.0 and 1.2.0 checkpoints
- r5 261009 SAVE-6✎ read-only until reload→read-only tabs take over writing when the writer closes
- r4 261008 SAVE-10✎ current rules 1.1.0→1.2.0, accepting 1.0.0 and 1.1.0 checkpoints
- r3 261008 SAVE-13+ century boundary-only compaction→lossless full-career compaction verified during active play after100 seasons
- r2 261008 SAVE-10+ SAVE-11+ SAVE-12+ single1.0.0 decoder and genericfallback→compatible1.1.0 metadata upgrade with no silent future-save downgrade and lean browser repository
- r1 261007 initial
