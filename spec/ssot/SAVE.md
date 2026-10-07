# SAVE Browser persistence and protocol
> r1 | Define the implemented browser-demo behavior for browser persistence and protocol.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Envelope contains schema/engine/catalog/world ID/generation/parentGeneration/codec/checksum/payload. Codec is gzip-base64; checksum is SHA-256 of uncompressed canonical JSON.
- SAVE-3 [o] One active world and previous checkpoint use keys haeram-soccor:slot:a/b and haeram-soccor:manifest; manifest switches only after validated candidate write/readback.
- SAVE-4 [o] Maximum encoded checkpoint is 1.5 MiB conservative UTF-16; total namespaced use <=3.5 MiB. Imports cap file at 4 MiB and decompressed JSON at 16 MiB.
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
- SAVE-6 [o] Exclusive Web Lock owns writing; read-only tabs are notified. Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, codec and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Autosave settled fixture/round and committed management decisions; UI distinguishes active and last persisted revisions.
- SAVE-9 [o] Export/import uses the same envelope; checksum provides corruption detection only. All successful changes remain local.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
