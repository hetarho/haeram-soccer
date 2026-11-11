# SAVE Browser persistence and protocol
> r67 | Define the browser-demo rules for browser persistence and protocol.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Envelope contains schema/engine/catalog/world ID/generation/parentGeneration/codec/checksum/payload; checksum is SHA-256 of uncompressed canonical compact JSON.
  - Write gzip-cjk14 for compressed payloads at most 1,200,000 bytes. For IndexedDB commits and portable exports, also use gzip-cjk14 when the complete candidate fits both the IndexedDB checkpoint budget and the portable-file limit (→!SAVE-4); otherwise write brotli-bmp127, quality 11/window 24, using the pinned pure-JavaScript worker implementation. ← IndexedDB autosaves must not pay a discontinued fallback layout's compression cost
  - All writes use the IndexedDB checkpoint budget; compression choices never change canonical facts or checksum inputs.
  - brotli-bmp127 uses fixed 64-character base-63198 blocks per 127 bytes, excluding controls/ASCII/surrogates/noncharacters, with an explicit final-byte-count header. Payload is opaque verbatim text; padding/range/length checks precede decompression. The exact byte-to-character mapping and header grammar are defined by `bmpText`/`bmpBytes` in `apps/web/src/adapters/bmp127.ts` and its literal compatibility tests in `bmp127.test.ts`.
  - Continue reading gzip-cjk14 and gzip-base64; never rewrite a file while reading. Existing checkpoint, total, import and decompressed limits remain →SAVE-4.
- SAVE-3 [o] The game in play keeps its active checkpoint and its previous committed checkpoint in IndexedDB (database haeram-soccor, store checkpoints, keys active and previous); haeram-soccor:manifest in localStorage names the committed generation. ← IndexedDB writes do not block the main thread and its allowance is not localStorage's 5 MiB per origin
  - a commit copies the currently committed checkpoint to previous and reads it back equal, then writes the validated candidate to active and reads it back, and only then switches the manifest; a failure at any step, including writes cut short by a closing tab, leaves the committed generation loadable, and a commit is acknowledged only after all three steps complete.
  - load takes the manifest's generation, else the newest valid of active and previous; previous is the recovery predecessor.
  - IndexedDB is required for game checkpoints. If it is unavailable or a write fails, report the storage error and keep any committed checkpoint and exportable in-memory progress; never write a localStorage checkpoint or acknowledge a failed save.
- SAVE-4 [o] IndexedDB active and previous checkpoints each allow at most 6 MiB conservative UTF-16, while every portable file stays at most 8 MiB actual UTF-8 and decompressed JSON at most 32 MiB.
  - Writes verify both the complete checkpoint's UTF-16 budget and actual portable-file byte limit before modifying storage. There is no localStorage checkpoint budget or two-slot fallback.
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
  - Beta storage compatibility and retired cleanup paths follow →!SAVE-29; validation errors never authorize deleting saved data.
- SAVE-6 [o] Exclusive Web Lock owns writing; read-only tabs are notified and queue for the lock, so when the writing tab closes a read-only tab reloads the latest checkpoint and becomes the writer. Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, codec and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Owner decisions save at once; automatic progression saves in the background every 30 s of running clock and at once when the clock stops, the tab hides or, as far as the browser allows, the page closes. ← saving every day step held x10 to a few days at a time; unsaved automatic days hold no owner decision and replay identically (→ARCH-5)
  - a checkpoint is built, compressed, checksummed and validated in a background codec worker; neither the simulation nor the UI waits for it.
  - at most one save is in flight: a newer request replaces the waiting one, and an older checkpoint is never written over a newer one.
  - the UI shows when the game was last saved without changing on every day step.
  - a background save during automatic play may hold days computed ahead of the shown date (→WEB-18); the save on stopping follows once those days are shown, so it holds the date the clock stopped on.
- SAVE-9 [o] Export/import uses the same envelope; checksum provides corruption detection only. All successful changes remain local.

- SAVE-10 [o] The game is version 0.7.0, a beta before 1.0: the app and its engine rules carry that one version, raised with each release, and a match-model revision (→SAVE-23) ships inside a version. Rules-4.0.0 checkpoints are the same rules line and load as 0.7.0, only their version label rewritten; only 0.7.0 gameplay checkpoints are accepted after that (→SAVE-19). ← one number the player sees and the save checks; 1.0 is kept for the release Earlier gameplay is never converted; unsupported-version protection follows →SAVE-11; retired storage compatibility follows →!SAVE-29.
  - A supported world pinned to recognized catalog 2026-demo-4 moves to 2026-demo-5 on writer activation whatever its country: 2026-demo-5 changes only the person-name pools (→WORLD-12), so recorded facts and stored names stay and only generated people not yet retained show their new names.
  - A supported world pinned to recognized catalog 2026-demo-1, 2026-demo-2 or 2026-demo-3 whose club is English moves to 2026-demo-5 on writer activation; England's prices, money and football index are unchanged, so recorded facts stay. A career in another country pinned to them is a compatibility failure (→SAVE-11): 2026-demo-4 re-levelled its money (→ECON-35), so its recorded amounts would mix two levels.
  - Supported writer activation upgrades metadata/world revision through a pure transformation preserving all retained facts and missing optional defaults, committed through →SAVE-3. Failure preserves old disk data and exportable new memory state; read-only views do not perform disk upgrades.
  - Historical rules and transformations are recorded in chg.

- SAVE-11 [o] Unsupported selected save versions/catalogs are compatibility failures, not corruption-recovery permission. Do not automatically fall back to an older checkpoint and overwrite a newer incompatible career; preserve raw slots/manifest and expose export/import recovery. Actual corrupted compatible checkpoints may recover the validated predecessor.
  - No automatic legacy-gameplay reset runs; unsupported careers remain protected under this rule (→!SAVE-29).

- SAVE-12 [o] Browser checkpoint storage uses an injected worker validator; compression and world-schema validation remain in the worker codec path. Existing codec/repository imports preserve their public save API, and compatibility errors remain typed across the bridge.

- SAVE-13 [o] Lossless compact encoding must retain the complete canonical career and support existing compact checkpoints. The baseline and active-management 100-season profiles, including a settled active round after the century, must remain within →SAVE-4 without pruning records. Invalid compact metadata fails before activation.

  - Career representation version 3 may group people for compression only with a validated complete permutation restoring the exact original registry order before activation; version 1/2 readers and all literal/reference semantics remain supported. Version-three optional career profiles use bounded sparse scalar columns and exact presence runs; every stored scalar and nested career array survives, while invalid dimensions, presence runs or future metadata cannot activate.

- SAVE-14 [o] Three game slots (→WEB-62) are listed in a slot index (localStorage haeram-soccor:games): per slot its game ID, world ID, display summary and last-played time, plus the active slot. The game in play keeps its active checkpoint and previous copy (→SAVE-3); every other occupied slot keeps its latest validated checkpoint envelope, unchanged, in IndexedDB (database haeram-soccor, store games, keyed by game ID). ← only the game in play keeps a recovery predecessor and autosaves; parked games are export envelopes the browser keeps
  - switching parks the game in play first: its committed checkpoint is written to IndexedDB and read back equal before the next game is activated through the import path (→SAVE-5, →SAVE-10), so a failed switch leaves the game in play untouched.
  - only the writer tab (→SAVE-6) switches, starts, imports or deletes games.
  - the index follows the loaded world: a world listed under another slot makes that slot active; an unlisted world takes the active slot.
  - ordinary game deletion removes its parked checkpoint, and for the game in play its active keys, only after confirmation (→WEB-62). No legacy release cleanup runs (→!SAVE-29).
  - IndexedDB unavailable ⇒ checkpoint writes and slot switching report that IndexedDB is required (→!SAVE-3); there is no alternate game-storage layout.
- SAVE-15 [x] Device-owned data — the strategy library (→WEB-61), each saved direction keeping its cards and every other row (dials, ticket price, direction rows), an entry saved before holding only cards — lives per browser profile in localStorage (haeram-soccor:strategies) under an owner record { kind: device, id } whose random ID is kept in haeram-soccor:device, with stable item IDs and created/updated times, so an account can later adopt and merge it (→ARCH-29). Malformed entries are skipped, never fatal; nothing leaves the browser.

- SAVE-16 [o] Rules 2.0.0 start new careers; earlier-rule checkpoints, parked games and imports are never converted. ← a clean player model beats converting five attributes into fourteen guesses
  - until the feature boundary in →SAVE-18, earlier rules cause compatibility failure (→SAVE-11): the slot lists 이전 규칙 with export and delete only, imports name the rules they need, and nothing overwrites the career.
  - Historical release-reset behavior is retired (→!SAVE-29).
  - the 100-season profiles of SAVE-13 are measured again on the new model and must still fit SAVE-4.
- SAVE-17 [o] A game's persisted career includes its seven business responsibilities, progression mode and observation triggers; the waiting days of each owner-held approval (→STAFF-48), absent in older saves, which start counting at 0; its standing director/manager support policy; aptitude/person continuity and staff-career facts; and outstanding/resolved mediation promises (→WEB-45/5, →STAFF-26, →HIST-14/15).
  - save/export/import preserve outstanding commitments and the linked person's actual age/history, without duplicate fulfilment, appointments or payments on reload.
  - retain existing corruption/compatibility protection and 100-season lossless budgets (→SAVE-4/11/13). Feature activation and compatibility for existing careers require →SAVE-18.

- SAVE-18 [o] The responsibility/progression/second-career/mediation feature set, with the squad rules (→CLUB-40–44, the 단장's closer trait →STAFF-20) and club reputation (→LEAGUE-14), started new careers at an incompatible rules 3.0.0 boundary; the current boundary is →SAVE-19.
  - Unsupported careers are not converted or automatically reset; current protection follows →!SAVE-11/29.
  - new careers initialize all seven responsibilities, automatic mode, match eve on/window opening off and balanced director/manager support under their owning rules (→WEB-45/5, →STAFF-26). Aptitude and person careers begin from new-career generation; legacy pending decisions and promises are not carried over.
  - new-rule saves retain normal validation, export/recovery, confirmed deletion/replacement and lossless 100-season budgets (→SAVE-4/5/11/13/14). No automatic legacy reset runs.

- SAVE-19 [o] The grid match engine (→MATCH-1, →MATCH-14–25) with the 16-attribute player model (→PLAYER-2), discipline and unavailability (→MATCH-19, →CLUB-45, →LEAGUE-15) and post-match material (→MATCH-5) starts new careers at an incompatible rules 4.0.0 boundary; active engine rules are 4.0.0. ← one engine to maintain; earlier players have no 판단력 or 침착성 to convert
  - Historical release cleanup is retired; unsupported careers follow →!SAVE-11/29.
  - a legacy file import is refused with its required rules; future or unrecognized incompatible files/slots still follow →SAVE-5/11.
  - a 4.0.0 career persists the current season's post-match material, the season heat maps, the spatial counter and discipline totals, current bans and every club's unavailable list, within →SAVE-4 and a passing 100-season benchmark (→HIST-9).

- SAVE-20 [o] A game's saved state reproduces its applied club representative colours, crest compositions, home/away/third kits with their shorts and socks, and the goalkeeper kit (→KIT-1/2/3/8/11), including custom colours and patterns, and an explicit own-kit selection for its named forthcoming fixture (→KIT-6).
  - Reload, slot parking/restoration and export/import recover the same designs and applicable fixture choice; do not reroll another colour, emblem or pattern on read.
  - Identity apply and an explicit fixture-level kit choice are owner decisions under →SAVE-8. Unapplied editor drafts remain session UI work under →WEB-74/86.
  - Existing writer ownership, validation, recoverable-save protection and lossless storage budgets remain →SAVE-4/5/6/11/13. Invalid identity data cannot overwrite a good career.
- SAVE-21 [o] A supported career without identity information follows →KIT-15: preserve its visible crests, representative colours and gameplay facts and supply only missing shirt, shorts and socks designs reproducibly.
  - Apply supported-career identity adoption only through the existing writer-owned validated activation path (→SAVE-3/5/6/11); failure preserves the prior save and recovery/export access. Reading from a read-only tab performs no disk upgrade.
  - Unsupported gameplay rules remain governed by →SAVE-19. Adding identity grants no further career-reset or legacy-conversion permission.
- SAVE-22 [o] Retained playback preserves the actual crest, outfield-shirt and goalkeeper appearance under →KIT-12 through save/export/import, within existing playback lifetimes and storage limits.
  - Identity edits never rewrite a recorded appearance, including the currently observed settled match.
  - Playback without historical identity information retains that absence and displays the unrecorded status; never backfill an invented historical kit from today's design.

- SAVE-23 [o] A match model (→MATCH-1/22/26/38/39) activates prospectively in supported rules-4.0.0 careers without resetting retained gameplay.
  - a later match-model revision activates the same way: a career on an earlier revision moves to the new one prospectively at the next safe boundary, every settled match keeps the revision that settled it as a label on its record, replays from that record alone (→WEB-23), and no match is resimulated; an earlier revision's match code is therefore not kept. ← one football for every career going forward
  - persist a declared match-model revision and the first tracked boundary of newly available counters. New careers start with full coverage; supported older careers preserve settled scores, contributions, designs, money, dates, personnel and history, and use the new model only for future unsettled fixtures. No backfill or resimulation of settled matches is allowed.
  - model activation is one validated writer upgrade through →SAVE-3/6/10. A queued or already revealed own-match playback completes under its settled model; activation waits for that safe boundary. Read-only views do not write or switch a career's persisted model.
  - checkpoints carrying the new aggregates/model metadata declare a container version that an older reader must refuse instead of silently dropping fields. Preserve supported older container readers, future-version protection and failed-write/export recovery (→SAVE-5/11/13).
  - activating the full model requires →ARCH-31's throughput and capacity evidence; its →MATCH-28 accuracy is measured and reported, not a gate. New full-model checkpoints round-trip all aggregate values, tracking boundaries, saved appearances and settled facts within →SAVE-4/13; a failed gate cannot be replaced by clearing careers or raising the limits.

- SAVE-24 [o] Own-manager tenure/result attribution (→HIST-18/19) activates prospectively in supported careers and survives save, reload, export and import.
  - new careers track from founding. A supported older career begins attribution at a recorded writer-activation boundary, retaining all older match/season/event/person facts and known service dates. Do not parse saved prose to invent missing identities, replay old fixtures, fabricate zero achievements or reset a career.
  - activation follows the validated writer-upgrade and commit rules (→SAVE-3/6/10); a queued or revealed own-match playback completes before its attribution boundary changes. Read-only views neither activate tracking nor write an upgrade. Failure preserves the previous disk checkpoint and exportable in-memory state.
  - persist tenure identities, exact tracking/date precision, match links and unique accomplishment-source attribution in a declared checkpoint container that older readers refuse. Continue reading supported pre-feature containers and preserve full-model metadata and future-version protection (→SAVE-11/23).
  - derived totals and display text are not a second persisted accomplishment database. Retain all source facts losslessly within the existing century and capacity limits (→SAVE-4/13), including repeated/interim appointments and a settled round after the century.

- SAVE-25 [o] A supported career saved before the owner's interventions were removed still opens with every other fact kept. On load it drops the state only those interventions used — the coaches' training orders and their strain, care effects and a pending win bonus, tactic requests with the manager's request history, and an owner-set lineup — so the club plays on the coaches' and manager's own calls; the values they set stay as saved: policy dials, direction rows and cards, the ticket price (→ECON-16/17/22/25). ← removing an owner control must not end a career
  - the drop is part of the validated writer activation (→SAVE-10); a failure preserves the previous checkpoint and exportable state (→SAVE-3/6).
  - The retired device strategy library is neither read nor cleaned up at startup (→!SAVE-29); the current device ID and game-slot index remain (→ARCH-29, →SAVE-14).

- SAVE-26 [o] The takeover start (→OWNER, →WORLD-13) begins new careers at an incompatible rules 5.0.0 boundary; earlier-rule careers are never converted, unsupported slots follow →!SAVE-11 without conversion or automatic reset and their export files stay. ← a career founded in an amateur league has no owner fortune, traits, books or pre-takeover past to convert into
- SAVE-27 [o] A career saves the owner's tier, traits, fortune, stake, dividend share, 팬 민심 and both crisis counts, the FFP window's injections, the takeover's facts and loan, and every club's books (→ECON-36) within the storage budget (→SAVE-4); the seasons played before the takeover are kept as season archives (→HIST-2), never as match detail.

- SAVE-28 [o] Persist the fact-backed news journal and incremental read summaries (→!HIST-11/22) as optional, versioned save data.
  - supported worlds without them remain loadable; writer activation reconstructs missing summaries once from retained facts, while read-only inspection never upgrades disk state.
  - saved cursors and summary fields are bounded and validated.
  - A recognized obsolete own-career card summary may be discarded as optional derived data before current-schema validation; writer activation reconstructs the current summary from retained source facts. Compatibility with the obsolete summary contents is not required. The recognized formats are defined in `packages/contracts/src/career-reads.ts`.
  - Other unsupported formats, unknown/future formats and malformed current summaries fail explicitly without replacing a committed checkpoint. This exception never discards or rewrites canonical matches, incidents, events or other game facts.
  - export/import and checkpoint replay preserve the journal, record totals and stable IDs; existing generation ordering, recovery, size limits and original-fact retention remain →!SAVE-2/3/4/5.

- SAVE-29 [o] This beta does not maintain earlier localStorage game-storage layouts. Remove their slot readers/writers, IndexedDB migration, fallback quotas and startup legacy-reset/strategy-cleanup paths; do not migrate or delete old browser keys.
  - Current device preferences, notification/read markers, game index and the commit manifest may still use localStorage; they are current metadata, never game-checkpoint payloads.
  - IndexedDB checkpoints retain generation ordering, verified previous-copy recovery, unsupported-save protection and explicit deletion (→!SAVE-3/5/6/11). This policy supersedes historical release-reset clauses, without changing simulation rules or pruning career facts.

## chg
- r67 261111 SAVE-23✎ the continuous-match and complete aggregate-result model→a match model; a settled match replays under its revision→keeps the revision as a label and replays from its record alone, earlier revisions' match code not kept
- r66 261110 SAVE-28✎ every unsupported summary refused→recognized obsolete career-card cache omitted and reconstructed once; obsolete-content compatibility not required, current validation and unknown/future rejection preserved
- r65 261103 SAVE-2/3/4/5/10/11/14/16/18/19/25/26✎ retire localStorage checkpoint compatibility, fallback and startup cleanup; SAVE-29+ beta IndexedDB-only checkpoints, current device metadata retained
- r64 261103 SAVE-2✎ gzip threshold only then maximum Brotli→also accept budget-verified gzip for IndexedDB/export; SAVE-4✎ all stores 3 MiB UTF-16→IndexedDB 6 MiB, fallback 3 MiB with unchanged 3.5 MiB total; portable file 8 MiB and decompressed 32 MiB unchanged
- r63 261103 SAVE-28+ optional versioned news journal and incremental summaries, one-time supported-save reconstruction and existing checkpoint safeguards
- r62 261103 SAVE-26+ takeover rules 5.0.0 start new careers, earlier careers not converted; SAVE-27+ saved owner state, crisis counts, FFP window, takeover loan and every club's books; pre-takeover seasons as archives only
- r61 261102 SAVE-10✎ device strategy-library compatibility line→removed; SAVE-15- device strategy library removed; SAVE-17✎ unapplied policy drafts stay session UI work→removed (no policy drafts); SAVE-25+ a career saved before the owner's interventions were removed opens with their state dropped (training orders and strain, care effects and win bonus, tactic requests and history, owner-set lineup), the values they set kept, the device strategy library removed
- r60 261102 SAVE-10✎ catalog writer pin target 2026-demo-4→2026-demo-5; +a 2026-demo-4 world of any country moves too (only name pools changed, →WORLD-12)
- r59 261101 SAVE-17✎ +each owner-held approval's waiting days (→STAFF-48), absent in older saves→counting from 0
- r58 261101 SAVE-10✎ catalog writer pin 2026-demo-1/2→2026-demo-3 to 2026-demo-1/2/3→2026-demo-4 for English careers only; another country's career pinned to them→a compatibility failure (its money re-levelled, →ECON-35)
- r57 261028 SAVE-10✎ current engine rules 4.0.0→game version 0.7.0 (beta) shared by the app and the engine rules, raised each release, match-model revisions shipping inside it; 4.0.0 checkpoints load as 0.7.0 with the label rewritten
- r56 261028 SAVE-20✎ applied shirts and own-shirt selection→kits with shorts/socks, the goalkeeper kit and own-kit selection; SAVE-21✎ missing shirt designs supplied→missing shirt/shorts/socks designs supplied
- r55 261027 SAVE-8+ background saves may hold days computed ahead of the shown date; the stop save waits until they are shown
- r54 261026 SAVE-3✎ active checkpoint localStorage slot:a→IndexedDB key active, moved on the first commit; SAVE-4✎ checkpoint cap→every store, localStorage total→settings and fallback only; SAVE-14✎ reason localStorage copy→predecessor and autosaves
- r53 261025 SAVE-23✎ one model revision→later revisions activate prospectively at the next safe boundary; settled matches keep and replay under their revision
- r52 261024 SAVE-23✎ activation required →MATCH-28 and →ARCH-31 evidence→→ARCH-31 throughput and capacity evidence, →MATCH-28 accuracy reported, not a gate
- r51 261021 SAVE-24+ prospective own-manager history activation, lossless attribution round trips and older-reader protection within existing budgets
- r50 261020 SAVE-23+ prospective versioned full-match-model activation for supported careers, exact aggregates and coverage, safe playback boundary and older-reader protection
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
