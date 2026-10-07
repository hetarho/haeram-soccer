# Portable v1 save format

The envelope carries schema `1`, engine/catalog IDs, catalog hash, world ID, generation, parent generation, codec `gzip-base64`, SHA-256 checksum and payload. Payload is gzip over UTF-8 canonical compact JSON, encoded as standard Base64. The checksum covers the uncompressed canonical compact JSON, not the envelope or gzip implementation.

Canonical JSON sorts object keys by raw UTF-16 order, retains array order, drops undefined object fields, uses finite JSON numbers and encodes exact money as decimal strings. It rejects unsupported values. The complete inflated representation must fit 16 MiB; imports cap 4 MiB. Header, version, checksum, world schema, references, currency and pinned catalog hash are checked before activation.

## Lossless compact representation

`apps/web/src/adapters/packing.ts` is the reference codec. `compact1` keeps current world metadata, a shared string dictionary, owned-match tuples, binary statistics and standings counts. It omits reproducible domestic fixture definitions: reconstruct with the pinned engine's `prepareSeason(world, false)` and apply saved score tuples by fixture index. European fixtures remain explicit.

Match tuples preserve fixture identity/year/round/kind/home/away/country/group/score, owned player IDs, recorded highlights and tactics. Numeric streams use column-transposed unsigned LEB128 without truncation. Current encoding groups actor dimensions, player IDs, highlights and tactics into separate streams; the reader also accepts the former combined actor stream and older explicit match tuples.

Statistics use declared-width bit columns: width 156 for uniform 11-player owned matches (13 rows × 12 counters), otherwise width 12. Exact per-column minima and bit ranges preserve all safe integer bits. The optional `planes` layout groups equivalent bit positions for gzip; omitted layout retains the earlier column interpretation. Optional residual flags encode failed passes/off-target shots and signed interception-versus-tackle differences. Decode restores the original counters; unsafe values, unknown layouts, truncated streams, invalid dimensions and unconsumed data fail validation.

Domestic and European phase standing rows each have width 6, stored in a separate column-transposed unsigned-LEB128 stream with optional signed column deltas. Per-season domestic row counts and per-tournament first/second phase counts reconstruct every row. Event templates and variable-string dictionaries preserve complete event details. String dictionaries and tuples are bounded; unused/missing stream elements fail decoding. No pruning or lossy rounding is allowed.

Archived movement frames are not save facts. Historical goal playback uses preserved goal minutes; only the final recorded counters are displayed in that summary playback.

## Commit and recovery

Application keys: `haeram-soccor:slot:a`, `haeram-soccor:slot:b`, `haeram-soccor:manifest`. The manifest selects the current slot/world/generation and parent generation. Write/readback-verify the inactive slot, switch/readback-verify the manifest, then acknowledge. The old active slot remains available on quota/write failure.

Validate manifest lineage when present. A valid previous-generation compatible checkpoint may recover the previous world after corruption. Corrupt/missing manifests trigger deterministic validated-slot recovery. Unsupported selected schemas, engine versions or catalogs are compatibility failures: preserve and export the selected raw career instead of silently falling back to an older one. Loading/recovery does not erase source slots. Export uses the same envelope and can preserve in-memory progress when browser quota prevents a new checkpoint.

Only one Web Lock owner writes. Commands use protocol/session/request/expected revision; duplicate effects are prevented by acknowledgments/receipts and stale revision checks. Main-thread adapters perform storage I/O; the worker validates, projects, compresses and hashes.

Engine rules `1.1.0` accept `1.0.0` careers. Writer activation upgrades only engine metadata and revision through a pure transformation and the two-slot protocol; old match/player/economic facts and absent optional fields remain unchanged. Read-only views do not upgrade metadata or disk. Upgrade write failure keeps the old committed career and exportable upgraded memory, with an explicit retry. Unsupported versions/catalogs require an explicit future migration or matching engine. No legacy Flutter JSON importer or automatic downgrade is claimed.
