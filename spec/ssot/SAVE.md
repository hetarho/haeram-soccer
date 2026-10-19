# SAVE Browser persistence and protocol
> r49 | Define the browser-demo rules for browser persistence and protocol.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Envelope contains schema/engine/catalog/world ID/generation/parentGeneration/codec/checksum/payload; checksum is SHA-256 of uncompressed canonical compact JSON.
  - Write gzip-cjk14 for compressed payloads at most 1,200,000 bytes; otherwise write brotli-bmp127, quality 11/window 24, using a pinned pure-JavaScript worker implementation.
  - brotli-bmp127 uses fixed 64-character base-63198 blocks per 127 bytes, excluding controls/ASCII/surrogates/noncharacters, with an explicit final-byte-count header (docs/SAVE-FORMAT.md). Payload is opaque verbatim text; padding/range/length checks precede decompression.
  - Continue reading gzip-cjk14 and gzip-base64; never rewrite a file while reading. Existing checkpoint, total, import and decompressed limits remain →SAVE-4.
- SAVE-3 [o] The game in play keeps one active checkpoint in localStorage (haeram-soccor:slot:a) and its previous committed checkpoint in IndexedDB (database haeram-soccor, store checkpoints, key previous); haeram-soccor:manifest names the committed generation. ← one large checkpoint fits a 5 MiB origin with room, two copies of it would not
  - a commit copies the currently committed checkpoint to IndexedDB and reads it back equal, then writes the validated candidate to the active key and reads it back, and only then switches the manifest; a failure at any step leaves the committed generation loadable.
  - load takes the manifest's generation, else the newest valid of the active key and the IndexedDB previous copy; the previous copy is the recovery predecessor.
  - IndexedDB unavailable ⇒ the active and previous checkpoints use localStorage keys slot:a/b while both fit the total budget (→SAVE-4), with the previous copy verified before the active checkpoint is overwritten.
  - if a committed checkpoint exists and no verified previous copy can be kept within the budget, fail before overwriting it: retain the committed checkpoint and manifest, preserve exportable in-memory progress and offer export/retry; never report save success. A first checkpoint without a committed predecessor may still be written within →SAVE-4.
- SAVE-4 [o] Maximum encoded checkpoint is 3 MiB conservative UTF-16, for the active and the previous copy alike; total namespaced localStorage use ≤ 3.5 MiB. Imports cap the file at 8 MiB and decompressed JSON at 32 MiB.
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
  - the explicitly bounded legacy-gameplay reset at the new-career feature release follows →SAVE-18; it is not general permission to clear data on a validation error.
- SAVE-6 [o] Exclusive Web Lock owns writing; read-only tabs are notified and queue for the lock, so when the writing tab closes a read-only tab reloads the latest checkpoint and becomes the writer. Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, codec and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Owner decisions save at once; automatic progression saves in the background every 30 s of running clock and at once when the clock stops, the tab hides or, as far as the browser allows, the page closes. ← saving every day step held x10 to a few days at a time; unsaved automatic days hold no owner decision and replay identically (→ARCH-5)
  - a checkpoint is built, compressed, checksummed and validated in a background codec worker; neither the simulation nor the UI waits for it.
  - at most one save is in flight: a newer request replaces the waiting one, and an older checkpoint is never written over a newer one.
  - the UI shows when the game was last saved without changing on every day step.
- SAVE-9 [o] Export/import uses the same envelope; checksum provides corruption detection only. All successful changes remain local.

- SAVE-10 [o] Current engine rules are 4.0.0; only 4.0.0 gameplay checkpoints are accepted (→SAVE-19). Earlier gameplay is never converted; the bounded recognized-legacy reset and future/unrecognized-version protection follow →SAVE-19 and →SAVE-11.
  - A supported world pinned to recognized catalog 2026-demo-1 or 2026-demo-2 moves to 2026-demo-3 on writer activation; prices and the football index are unchanged, so recorded facts stay.
  - Supported writer activation upgrades metadata/world revision through a pure transformation preserving all retained facts and missing optional defaults, committed through →SAVE-3. Failure preserves old disk data and exportable new memory state; read-only views do not perform disk upgrades.
  - Device strategy-library compatibility remains →SAVE-15 and →ECON-22; it grants no legacy-gameplay conversion. Historical rules and transformations are recorded in chg.

- SAVE-11 [o] Unsupported selected save versions/catalogs are compatibility failures, not corruption-recovery permission. Do not automatically fall back to an older checkpoint and overwrite a newer incompatible career; preserve raw slots/manifest and expose export/import recovery. Actual corrupted compatible checkpoints may recover the validated predecessor.
  - recognized legacy gameplay at the new-career release boundary is the specific reset exception in →SAVE-18. Future or unrecognized incompatible saves retain the protection above.

- SAVE-12 [o] Browser checkpoint storage uses an injected worker validator; compression and world-schema validation remain in the worker codec path. Existing codec/repository imports preserve their public save API, and compatibility errors remain typed across the bridge.

- SAVE-13 [o] Lossless compact encoding must retain the complete canonical career and support existing compact checkpoints. The baseline and active-management 100-season profiles, including a settled active round after the century, must remain within →SAVE-4 without pruning records. Invalid compact metadata fails before activation.

  - Career representation version 3 may group people for compression only with a validated complete permutation restoring the exact original registry order before activation; version 1/2 readers and all literal/reference semantics remain supported. Version-three optional career profiles use bounded sparse scalar columns and exact presence runs; every stored scalar and nested career array survives, while invalid dimensions, presence runs or future metadata cannot activate.

- SAVE-14 [o] Three game slots (→WEB-62) are listed in a slot index (localStorage haeram-soccor:games): per slot its game ID, world ID, display summary and last-played time, plus the active slot. The game in play keeps its active checkpoint and previous copy (→SAVE-3); every other occupied slot keeps its latest validated checkpoint envelope, unchanged, in IndexedDB (database haeram-soccor, store games, keyed by game ID). ← only the game in play needs the synchronous localStorage copy; parked games are export envelopes the browser keeps
  - switching parks the game in play first: its committed checkpoint is written to IndexedDB and read back equal before the next game is activated through the import path (→SAVE-5, →SAVE-10), so a failed switch leaves the game in play untouched.
  - only the writer tab (→SAVE-6) switches, starts, imports or deletes games.
  - a save present without an index (earlier versions) becomes slot 1.
  - the index follows the loaded world: a world listed under another slot makes that slot active; an unlisted world takes the active slot.
  - ordinary game deletion removes its parked checkpoint, and for the game in play its active keys, only after confirmation (→WEB-62). The recognized legacy-gameplay release reset is →SAVE-18.
  - IndexedDB unavailable ⇒ saving the game in play follows →SAVE-3's bounded fallback and failure protection; switching and new slots say why they are unavailable.
- SAVE-15 [o] Device-owned data — the strategy library (→WEB-61), each saved direction keeping its cards and every other row (dials, ticket price, direction rows), an entry saved before holding only cards — lives per browser profile in localStorage (haeram-soccor:strategies) under an owner record { kind: device, id } whose random ID is kept in haeram-soccor:device, with stable item IDs and created/updated times, so an account can later adopt and merge it (→ARCH-29). Malformed entries are skipped, never fatal; nothing leaves the browser.

- SAVE-16 [o] Rules 2.0.0 start new careers; earlier-rule checkpoints, parked games and imports are never converted. ← a clean player model beats converting five attributes into fourteen guesses
  - until the feature boundary in →SAVE-18, earlier rules cause compatibility failure (→SAVE-11): the slot lists 이전 규칙 with export and delete only, imports name the rules they need, and nothing overwrites the career.
  - the new-career feature boundary instead permits the recognized legacy-gameplay reset in →SAVE-18.
  - the 100-season profiles of SAVE-13 are measured again on the new model and must still fit SAVE-4.
- SAVE-17 [o] A game's persisted career includes its seven business responsibilities, progression mode and observation triggers; its standing director/manager support policy; aptitude/person continuity and staff-career facts; and outstanding/resolved mediation promises (→WEB-45/5, →STAFF-26, →HIST-14/15).
  - save/export/import preserve outstanding commitments and the linked person's actual age/history, without duplicate fulfilment, appointments or payments on reload.
  - unapplied policy drafts remain session UI work (→WEB-74), not applied policy or portable game-save facts.
  - retain existing corruption/compatibility protection and 100-season lossless budgets (→SAVE-4/11/13). Feature activation and compatibility for existing careers require →SAVE-18.

- SAVE-18 [o] The responsibility/progression/second-career/mediation feature set, with the squad rules (→CLUB-40–44, the 단장's closer trait →STAFF-20) and club reputation (→LEAGUE-14), started new careers at an incompatible rules 3.0.0 boundary; the current boundary is →SAVE-19.
  - legacy gameplay data from recognized rules through 2.0.0 may be cleared on writer activation: active/previous checkpoints, parked career envelopes, game-slot entries and their career records. No conversion, archive retention or export-first requirement is imposed for this boundary. Reset cannot depend on a read-only tab performing writes (→SAVE-6).
  - a legacy file import is refused with its required rules; do not import or convert it into a new-rule career. Future or unrecognized incompatible files/slots still follow →SAVE-5/11 rather than the legacy-reset exception.
  - new careers initialize all seven responsibilities, automatic mode, match eve on/window opening off and balanced director/manager support under their owning rules (→WEB-45/5, →STAFF-26). Aptitude and person careers begin from new-career generation; legacy pending decisions and promises are not carried over.
  - new-rule saves retain normal validation, export/recovery, confirmed deletion/replacement and lossless 100-season budgets (→SAVE-4/5/11/13/14). The legacy release reset does not relax these rules for new-rule careers.

- SAVE-19 [o] The grid match engine (→MATCH-1, →MATCH-14–25) with the 16-attribute player model (→PLAYER-2), discipline and unavailability (→MATCH-19, →CLUB-45, →LEAGUE-15) and post-match material (→MATCH-5) starts new careers at an incompatible rules 4.0.0 boundary; active engine rules are 4.0.0. ← one engine to maintain; earlier players have no 판단력 or 침착성 to convert
  - legacy gameplay data from recognized rules through 3.0.0 may be cleared on writer activation, as →SAVE-18 allows: active/previous checkpoints, parked career envelopes, game-slot entries and their career records. No conversion, archive retention or export-first requirement is imposed. Reset cannot depend on a read-only tab performing writes (→SAVE-6); the reset is announced once as an app notice (→WEB-66).
  - a legacy file import is refused with its required rules; future or unrecognized incompatible files/slots still follow →SAVE-5/11.
  - a 4.0.0 career persists the current season's post-match material, the season heat maps, the spatial counter and discipline totals, current bans and every club's unavailable list, within →SAVE-4 and a passing 100-season benchmark (→HIST-9).

- SAVE-20 [o] A game's saved state reproduces its applied club representative colours, crest compositions and home/away/third shirts (→KIT-1/2/3/11), including custom colours and patterns, and an explicit own-shirt selection for its named forthcoming fixture (→KIT-6).
  - Reload, slot parking/restoration and export/import recover the same designs and applicable fixture choice; do not reroll another colour, emblem or pattern on read.
  - Identity apply and an explicit fixture-level kit choice are owner decisions under →SAVE-8. Unapplied editor drafts remain session UI work under →WEB-74/86.
  - Existing writer ownership, validation, recoverable-save protection and lossless storage budgets remain →SAVE-4/5/6/11/13. Invalid identity data cannot overwrite a good career.
- SAVE-21 [o] A supported career without identity information follows →KIT-15: preserve its visible crests, representative colours and gameplay facts and supply only missing shirt designs reproducibly.
  - Apply supported-career identity adoption only through the existing writer-owned validated activation path (→SAVE-3/5/6/11); failure preserves the prior save and recovery/export access. Reading from a read-only tab performs no disk upgrade.
  - Unsupported gameplay rules remain governed by →SAVE-19. Adding identity grants no further career-reset or legacy-conversion permission.
- SAVE-22 [o] Retained playback preserves the actual crest, outfield-shirt and goalkeeper appearance under →KIT-12 through save/export/import, within existing playback lifetimes and storage limits.
  - Identity edits never rewrite a recorded appearance, including the currently observed settled match.
  - Playback without historical identity information retains that absence and displays the unrecorded status; never backfill an invented historical kit from today's design.

## chg
- r49 261019 SAVE-3✎ IndexedDB-unavailable commit without a previous copy→verified localStorage predecessor or refusal before overwrite, preserving disk data/exportable memory; SAVE-14✎ always saves without IndexedDB→SAVE-3 bounded fallback and failure protection
- r48 261019 SAVE-3✎ two localStorage slots a/b→one active localStorage checkpoint plus the previous copy in IndexedDB (slots a/b only without IndexedDB); SAVE-4✎ checkpoint 1.5→3 MiB, import file 4→8 MiB, decompressed 16→32 MiB, total 3.5 MiB unchanged; SAVE-13✎ without raising budgets→budgets per SAVE-4; SAVE-14✎ two-slot wording→active plus previous copy
- r47 261019 SAVE-21✎ open→preserve supported careers and add only missing shirts through validated writer activation; SAVE-22✎ open→retain actual playback appearance and disclose missing historical kits; gameplay boundary and storage limits unchanged
- r46 261019 SAVE-20+ applied identities and fixture kit choices round-trip; SAVE-21/22+ open supported-career identity adoption and historical playback appearance; SAVE-19 boundary unchanged
- r45 261019 SAVE-10✎ current rules 3.0.0→4.0.0, accepted checkpoints 3.0.0→4.0.0; SAVE-18✎ active rules 3.0.0→historical boundary; SAVE-19+ rules 4.0.0 grid-engine boundary, legacy through 3.0.0 cleared, new persisted facts within the budget
- r44 261017 SAVE-13✎ v3 profile rows→bounded sparse scalar columns/presence runs; exact facts, original registry order and v1/v2 readers unchanged
- r43 261017 SAVE-13✎ career v2 rows→v3 grouped rows with exact registry-order restoration; v1/v2 readers, facts and budgets unchanged
- r42 261017 SAVE-2✎ gzip-cjk14 writer→adaptive gzip-cjk14/brotli-bmp127; existing readers, checksum, facts and limits unchanged
- r41 261017 SAVE-10/18✎ active rules 2.0.0→3.0.0; only current-rule loads, approved bounded legacy reset on writer activation
- r40 261017 SAVE-10✎ recognized catalog writer pin 2026-demo-1→2026-demo-2 to 2026-demo-1/2→2026-demo-3; historical prices/index and recorded facts unchanged
- r39 261016 SAVE-18✎ squad rules CLUB-40–43→CLUB-40–44 (+registration limits)
- r38 261016 SAVE-18✎ rules 3.0.0 feature set responsibility/progression/second-career/mediation→+squad target, replacement and call-up (CLUB-40–43), the closer trait and LEAGUE-14 reputation
- r37 261016 SAVE-5/11/14/16✎ every legacy slot preserved/exportable→bounded legacy-gameplay reset exception; SAVE-18✎ compatibility open→new careers at rules 3.0.0, recognized older gameplay may be cleared, no conversion
- r36 261016 SAVE-17+ retain responsibility/mode/triggers, support policy, person careers and promises; SAVE-18+ open feature-version and existing-career compatibility policy; current released rules remain 2.0.0
- r35 261015 SAVE-10✎ rules 1.22.0→2.0.0 (the player model); SAVE-16+ earlier-rules careers are not converted: listed with export and delete only, imports refused, the 100-season profiles re-measured
- r34 261014 SAVE-10✎ rules 1.21.0→1.22.0: the 단장 post, a negotiator chief scout moving to it, the shortlist and requests
- r33 261014 SAVE-10✎ rules 1.20.0→1.21.0: the 글로벌 스카우팅 synergy and a founding direction; SAVE-15✎ library entries hold cards→cards and every other row, older entries cards only
- r32 261014 SAVE-10✎ rules 1.19.0→1.20.0: staff signings, bids marked `staff`; nothing converts
- r31 261014 SAVE-10✎ rules 1.18.0→1.19.0: bases and the 지역/글로벌 policy keys, marketing loads as 해외 마케팅, 글로벌 브랜드 dropped
- r30 261014 SAVE-10✎ rules 1.17.0→1.18.0: youth rows in `direction`, 1군 직행 경로 loads as 데뷔 시점 빠른 데뷔
- r29 261014 SAVE-10✎ rules 1.16.0→1.17.0: direction rows (`direction`) replace `talkRule` and `hiring`, a load maps them to the nearest rows with an inbox item, the level keeps its number on the new ladder
- r28 261013 SAVE-10✎ 1.16.0 one facility level (`facilities`)→stadium step, training ground and academy facilities with works in progress; load maps `facilities`
- r27 261013 SAVE-10✎ 1.16.0 the owner's focus (`training`)→the coaches' with `trainingOrders` and coach `strain`; load drops `training`
- r26 261013 SAVE-10✎ 1.16.0 a lock per slot (`buildChanged`)→no lock, load drops `buildChanged`
- r25 261013 SAVE-10✎ 1.16.0 staff switches per decision (`delegation`, keys `coach:<department>`)→the intervention level (`intervention` 1–4); load maps the coach-hiring switch to every department→load maps every staff switch to a level (4/2/1); activation delegating contract talks where the academy is→removed (the load mapping covers it)
- r24 261013 SAVE-10✎ 1.16.0 distributions on the broadcasting index→+cup and continental prizes on it, facilities prices→football index, operating expenses a turnover share over a floor→the larger of the division amount and the share, the division amount after a relegation, +the delegated 65% wage-bill check
- r23 261013 SAVE-10✎ 1.16.0 delegation of the manager post with its rule→talk rule, hiring criteria, per-department coach delegation, strategy applied at once with per-slot locks, squad investment scaling operating expenses; +load maps the coach-hiring switch, coaching levels and the yearly lock; +activation delegates contract talks where the academy is and drops a reservation with an inbox item
- r22 261013 SAVE-10✎ 1.16.0 +talks at window openings with improved contracts, agents and contract clauses, the broadcasting index and `operatingExpenses`; activation metadata only→+agents drawn from each player's id, no clauses on running contracts, the floor until `operatingExpenses` is first written
- r21 261012 SAVE-10✎ current rules 1.15.0→1.16.0, accepting 1.0.0–1.15.0 checkpoints; catalog 2026-demo-1→2026-demo-2 on writer activation; a single sponsor becomes its slot's contract
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
