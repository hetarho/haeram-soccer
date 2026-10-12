# SAVE Browser persistence and protocol
> r20 | Define the implemented browser-demo behavior for browser persistence and protocol.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Envelope contains schema/engine/catalog/world ID/generation/parentGeneration/codec/checksum/payload. Codec is gzip-cjk14: gzip bytes written as 14-bit groups in U+4E00–U+8DFF after a padding header (docs/SAVE-FORMAT.md); checksum is SHA-256 of uncompressed canonical JSON. ← storage is budgeted per UTF-16 code unit, where Base64 carries 6 bits and these characters 14
  - gzip-base64 checkpoints and files are still read, never written.
- SAVE-3 [o] One active world and previous checkpoint use keys haeram-soccor:slot:a/b and haeram-soccor:manifest; manifest switches only after validated candidate write/readback.
- SAVE-4 [o] Maximum encoded checkpoint is 1.5 MiB conservative UTF-16; total namespaced use <=3.5 MiB. Imports cap file at 4 MiB and decompressed JSON at 16 MiB.
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
- SAVE-6 [o] Exclusive Web Lock owns writing; read-only tabs are notified and queue for the lock, so when the writing tab closes a read-only tab reloads the latest checkpoint and becomes the writer. Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, codec and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Owner decisions save at once; automatic progression saves in the background every 30 s of running clock and at once when the clock stops, the tab hides or, as far as the browser allows, the page closes. ← saving every day step held x10 to a few days at a time; unsaved automatic days hold no owner decision and replay identically (→ARCH-5)
  - a checkpoint is built, compressed, checksummed and validated in a background codec worker; neither the simulation nor the UI waits for it.
  - at most one save is in flight: a newer request replaces the waiting one, and an older checkpoint is never written over a newer one.
  - the UI shows when the game was last saved without changing on every day step.
- SAVE-9 [o] Export/import uses the same envelope; checksum provides corruption detection only. All successful changes remain local.

- SAVE-10 [o] Current engine rules are 1.15.0 (one day order for every progression mode with draws named by what they settle, the amateur exchange by the amateur table, currency conversion of every live amount and market lists per settings, an outgoing bid keeping its offer as `offer`; 1.14.0 continental legs on each era's gap, no new fields; 1.13.0 a strategy reserved for the next season, buildNext, and the manager market, managerMarket; 1.12.0 made season archives keep scorers, per-round ranks, the Elo spread and cup brackets, packed as a bracketTies stream with bracketCounts; manager candidates drawn within their school's bands and a firefighter who leaves unless renewed; 1.11.0 added manager and coach careers with ages and ceilings, supporters following reputation with a global fan income, 20 facility levels, bankruptcy; a save beyond 20 facility levels loads at 20; 1.10.0 added a transfer stance per player and coaching investment per department, a 1.9 listing loading as listed and a club-wide level as every department's; 1.9.0 added 1950 amateur founding, in-season domestic cups and continental knockouts, Club Elo, evolving clubs, injuries, retirement announcements, the transfer list, coaching investment and recalibrated match outcomes; 1.8.0 added the six-slot club build replacing club visions, a stored vision loading as its preset; 1.7.0 added the delegated staff sale bar; 1.6.0 added advanced match counters, tactic defensive lines and transitions, manager styles, owner requests, club visions and academy investment; 1.5.0 added fair founding strength, XI ratings for every club, excess-only fatigue, faster recovery, recorded match xG; 1.4.0 added player-duel matches and care actions; 1.3.0 added season close after the final round, summer window from the close, 46-game league income, business delegation, cash warnings). Versions 1.0.0 through 1.14.0 checkpoints remain accepted; a bid pending from before 1.15.0 has no `offer` and is answered as the earlier rules did; a season in progress without domestic cups plays its cups out at the close; writer activation upgrades only rules metadata/revision through a pure transformation, preserves all retained facts and missing optional defaults, and commits through the existing two-slot protocol. Failure preserves old disk data and exportable new memory state; read-only views do not perform disk upgrades.

- SAVE-11 [o] Unsupported selected save versions/catalogs are compatibility failures, not corruption-recovery permission. Do not automatically fall back to an older checkpoint and overwrite a newer incompatible career; preserve raw slots/manifest and expose export/import recovery. Actual corrupted compatible checkpoints may recover the validated predecessor.

- SAVE-12 [o] Browser checkpoint storage uses an injected worker validator; compression and world-schema validation remain in the worker codec path. Existing codec/repository imports preserve their public save API, and compatibility errors remain typed across the bridge.

- SAVE-13 [o] Lossless compact encoding must retain the complete canonical career and support existing compact checkpoints. The baseline and active-management 100-season profiles, including a settled active round after the century, must remain within →SAVE-4 without pruning records or raising budgets. Invalid compact metadata fails before activation.

- SAVE-14 [o] Three game slots (→WEB-62) are listed in a slot index (localStorage haeram-soccor:games): per slot its game ID, world ID, display summary and last-played time, plus the active slot. The game in play keeps the active two-slot checkpoint (→SAVE-3); every other occupied slot keeps its latest validated checkpoint envelope, unchanged, in IndexedDB (database haeram-soccor, store games, keyed by game ID). ← only the game in play needs the synchronous two-slot store; parked games are export envelopes the browser keeps
  - switching parks the game in play first: its committed checkpoint is written to IndexedDB and read back equal before the next game is activated through the import path (→SAVE-5, →SAVE-10), so a failed switch leaves the game in play untouched.
  - only the writer tab (→SAVE-6) switches, starts, imports or deletes games.
  - a save present without an index (earlier versions) becomes slot 1.
  - the index follows the loaded world: a world listed under another slot makes that slot active; an unlisted world takes the active slot.
  - deleting a game removes its parked checkpoint, and for the game in play its active keys, only after confirmation (→WEB-62).
  - IndexedDB unavailable ⇒ the game in play still saves; switching and new slots say why they are unavailable.
- SAVE-15 [o] Device-owned data — the strategy library (→WEB-61) — lives per browser profile in localStorage (haeram-soccor:strategies) under an owner record { kind: device, id } whose random ID is kept in haeram-soccor:device, with stable item IDs and created/updated times, so an account can later adopt and merge it (→ARCH-29). Malformed entries are skipped, never fatal; nothing leaves the browser.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r20 261012 SAVE-8✎ autosave settled fixture/round→owner decisions at once, automatic progression every 30 s of running clock and on stop, hide and close, built and validated in a background codec worker
- r19 261012 SAVE-10✎ current rules 1.14.0→1.15.0, accepting 1.0.0–1.14.0 checkpoints; outgoing bids may carry `offer`, older pending bids answered as before
- r18 261012 SAVE-10✎ current rules 1.13.0→1.14.0, accepting 1.0.0–1.13.0 checkpoints; no format change
- r17 261012 SAVE-10✎ current rules 1.12.0→1.13.0, accepting 1.0.0–1.12.0 checkpoints; worlds may carry buildNext and managerMarket
- r16 261012 SAVE-14+ three game slots: slot index, parked checkpoints in IndexedDB, park-then-activate switching, legacy save as slot 1; SAVE-15+ device strategy library with owner record
- r15 261012 SAVE-10✎ current rules 1.11.0→1.12.0, accepting 1.0.0–1.11.0 checkpoints; archives may carry scorers, ranks, eloRange and brackets (tie rows in the bracketTies stream)
- r14 261012 SAVE-10✎ current rules 1.10.0→1.11.0, accepting 1.0.0–1.10.0 checkpoints; facilities beyond 20 load at 20; worlds may carry insolvent and bankrupt
- r13 261011 SAVE-10✎ current rules 1.9.0→1.10.0, accepting 1.0.0–1.9.0 checkpoints; 1.9 listings and club-wide coaching levels load into the new fields
- r12 261011 SAVE-10✎ current rules 1.8.0→1.9.0, accepting 1.0.0–1.8.0 checkpoints
- r11 261010 SAVE-10✎ current rules 1.6.0→1.8.0, accepting 1.0.0–1.7.0 checkpoints; a stored club vision loads as the matching build preset
- r10 261010 SAVE-10✎ current rules 1.5.0→1.6.0, accepting 1.0.0–1.5.0 checkpoints; matches may carry advanced counters
- r9 261010 SAVE-2✎ codec gzip-base64→gzip-cjk14 (Base64 still read); worst century checkpoint 1,645,134→781,878 bytes of the 1,572,864 limit
- r8 261009 SAVE-10✎ current rules 1.4.0→1.5.0, accepting 1.0.0–1.4.0 checkpoints; match records may carry xG
- r7 261009 SAVE-10✎ current rules 1.3.0→1.4.0, accepting 1.0.0–1.3.0 checkpoints
- r6 261009 SAVE-10✎ current rules 1.2.0→1.3.0, accepting 1.0.0, 1.1.0 and 1.2.0 checkpoints
- r5 261009 SAVE-6✎ read-only until reload→read-only tabs take over writing when the writer closes
- r4 261008 SAVE-10✎ current rules 1.1.0→1.2.0, accepting 1.0.0 and 1.1.0 checkpoints
- r3 261008 SAVE-13+ century boundary-only compaction→lossless full-career compaction verified during active play after100 seasons
- r2 261008 SAVE-10+ SAVE-11+ SAVE-12+ single1.0.0 decoder and genericfallback→compatible1.1.0 metadata upgrade with no silent future-save downgrade and lean browser repository
- r1 261007 initial
