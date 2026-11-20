# SAVE Game persistence and protocol
> r74 | Define the game database, its saves, backups and portable files, shared by the web and the app.

## decisions
- SAVE-1 [o] Protocol and save schema start at version 1; engine/catalog versions and world revision are explicit and checked.
- SAVE-2 [o] Each game is one SQLite database (→!ARCH-11) whose metadata carries the schema version, engine and catalog versions, catalog hash, world ID and world revision, checked when it opens (→SAVE-1/5). ← one save file that the app opens unchanged
  - every fact is stored once in its row, keyed by stable IDs (→ARCH-8); no compact packing, text encoding or compression inside the database.
- SAVE-3 [o] A save writes the rows changed since the previous save in one transaction; a save cut short — a closing tab, a crash, a failed write — leaves the previous save whole, and only a committed save is acknowledged. ← a save's cost follows what changed, not the career's length (measured 261119: 18 s to save a whole 2000-takeover world on the measuring host)
  - the engine worker writes its own game's database between simulation steps (→!ARCH-6); there is no codec worker, candidate copy, previous checkpoint or commit manifest.
  - a committed transaction verifies a save; the whole world is validated when a game opens or is imported (→SAVE-5), not on every save.
  - storage unavailable or a failed write ⇒ report the storage error, keep the last committed save and the exportable in-memory progress, never acknowledge the failed save.
- SAVE-4 [o] A game's database has no application size budget: the browser's actual storage quota bounds it, and a quota failure is a storage error (→SAVE-3). An export file is at most 256 MiB and the database it carries at most 1 GiB; import stops decompressing at that limit. ← the browser's database quota, not a fixed text budget, is the real limit
- SAVE-5 [o] Validate DTO schema and world references before load/import; unsupported versions, wrong checksum, corrupted slots and missing catalogs are actionable errors and cannot overwrite a good save.
  - Beta storage compatibility and retired cleanup paths follow →!SAVE-29; validation errors never authorize deleting saved data.
- SAVE-6 [o] One tab at a time plays a game, holding an exclusive Web Lock on its open database (→!ARCH-17). Another tab of the app shows that the game is playing in another tab, with 여기서 이어 하기: the playing tab saves, closes the database and releases it, then this tab opens the game and becomes the writer. There is no read-only view of a game in play. ← the database opens in one tab only, and a mirrored read-only view costs more than it gives
  - the tab that gave the game up shows that it moved to another tab and offers to take it back the same way.
  - a playing tab that does not answer keeps the game until it closes; the other tab says so and takes the game once the lock frees.
  - Commands carry session/request/expected revision; duplicates return the stored acknowledgment or fail stale without repeated effects.
- SAVE-7 [o] Worker initialization, serialized command processing, snapshots, saves, export, import and recoverable typed errors use one public bridge contract.
- SAVE-8 [o] Owner decisions save at once; automatic progression saves in the background every 30 s of running clock and at once when the clock stops, the tab hides or, as far as the browser allows, the page closes. ← saving every day step held x10 to a few days at a time; unsaved automatic days hold no owner decision and replay identically (→ARCH-5)
  - a save writes the changed rows in the engine worker between simulation steps (→SAVE-3); the UI never waits for it.
  - saves run one at a time in world order; a newer request replaces a waiting one.
  - the UI shows when the game was last saved without changing on every day step.
  - a background save during automatic play may hold days computed ahead of the shown date (→WEB-18); the save on stopping follows once those days are shown, so it holds the date the clock stopped on.
- SAVE-9 [o] Export writes the game's database compressed with gzip behind a header carrying the file format, schema/engine/catalog versions, catalog hash, world ID and the SHA-256 of the uncompressed database, as a `.haeram-save` file (→!ARCH-12). Exporting the game in play saves it first. The checksum detects corruption only; all successful changes remain local.
  - import checks the header, the limits (→SAVE-4), the checksum, the database's own integrity check and its versions, then validates the world (→SAVE-5) before it takes a slot (→SAVE-14); any failure leaves every slot untouched.

- SAVE-10 [o] The beta's app and engine rules carry one current game version, defined by `CURRENT_ENGINE_VERSION` in `packages/contracts/src/versions.ts`; 1.0 is reserved for the release. The root and all workspace package versions match it, and a release raises them coherently before final verification. A match-model revision (→SAVE-23) ships inside a version. ← one number the player sees and the save checks
  - The rules-5.0.0 takeover line accepts its explicitly listed compatible patch labels, including 0.8.0, alongside the current label. Writer activation rewrites a supported earlier label to the current version while preserving every game fact and absent optional field; only rule/catalog metadata and world revision may change. A semver range or an arbitrary earlier label is never compatibility permission.
  - Earlier incompatible gameplay, including rules-4.0.0 and 0.7.0, is never converted (→!SAVE-26); unsupported-version protection follows →!SAVE-11 and retired storage compatibility follows →!SAVE-29.
  - A supported world pinned to recognized catalog 2026-demo-4 moves to 2026-demo-5 on writer activation whatever its country: 2026-demo-5 changes only the person-name pools (→WORLD-12), so recorded facts and stored names stay and only generated people not yet retained show their new names.
  - A supported world pinned to recognized catalog 2026-demo-1, 2026-demo-2 or 2026-demo-3 whose club is English moves to 2026-demo-5 on writer activation; England's prices, money and football index are unchanged, so recorded facts stay. A career in another country pinned to them is a compatibility failure (→SAVE-11): 2026-demo-4 re-levelled its money (→ECON-35), so its recorded amounts would mix two levels.
  - Supported writer activation upgrades metadata/world revision through a pure transformation preserving all retained facts and missing optional defaults, committed through →SAVE-3 after a backup (→SAVE-31). Failure preserves old disk data and exportable new memory state.
  - Historical rules and transformations are recorded in chg.

- SAVE-11 [o] Unsupported save versions, catalogs and schemas are compatibility failures, not corruption-recovery permission. Never fall back to the backup or overwrite an incompatible career; keep its database untouched and expose export. Only an actually corrupted compatible database may recover from its backup (→SAVE-31).
  - No automatic legacy-gameplay reset runs; unsupported careers remain protected under this rule (→!SAVE-29).

- SAVE-12 [x] Browser checkpoint storage uses an injected worker validator; compression and world-schema validation remain in the worker codec path. Existing codec/repository imports preserve their public save API, and compatibility errors remain typed across the bridge.

- SAVE-13 [o] A career keeps every retained fact losslessly, without pruning (→ARCH-25). The baseline and active-management 100-season profiles, including a settled active round after the century, save, reopen and export within →SAVE-4 on a recorded benchmark (→ARCH-14).

- SAVE-14 [o] Three game slots (→WEB-62) are listed in a slot index (localStorage haeram-soccor:games): per slot its game ID, world ID, display summary and last-played time, plus the active slot. Each occupied slot is its game's database with its backup (→SAVE-31); a game not in play stays as last saved. ← switching games only closes one database and opens another
  - switching saves and closes the game in play, then opens the next game's database and validates it (→SAVE-5, →SAVE-10); a failed open leaves both games' files untouched and the previous game reopenable.
  - only the playing tab (→SAVE-6) switches, starts, imports or deletes games.
  - the index follows the loaded world: a world listed under another slot makes that slot active; an unlisted world takes the active slot.
  - deleting a game removes its database and backup only after confirmation (→WEB-62). No legacy release cleanup runs (→!SAVE-29).
  - OPFS or SQLite unavailable ⇒ starting, opening and switching report that they are required (→ARCH-11); there is no alternate game store.
- SAVE-15 [x] Device-owned data — the strategy library (→WEB-61), each saved direction keeping its cards and every other row (dials, ticket price, direction rows), an entry saved before holding only cards — lives per browser profile in localStorage (haeram-soccor:strategies) under an owner record { kind: device, id } whose random ID is kept in haeram-soccor:device, with stable item IDs and created/updated times, so an account can later adopt and merge it (→ARCH-29). Malformed entries are skipped, never fatal; nothing leaves the browser.

- SAVE-16 [o] Rules 2.0.0 start new careers; earlier-rule checkpoints, parked games and imports are never converted. ← a clean player model beats converting five attributes into fourteen guesses
  - until the feature boundary in →SAVE-18, earlier rules cause compatibility failure (→SAVE-11): the slot lists 이전 규칙 with export and delete only, imports name the rules they need, and nothing overwrites the career.
  - Historical release-reset behavior is retired (→!SAVE-29).
  - the 100-season profiles of SAVE-13 are measured again on the new model and must still fit SAVE-4.
- SAVE-17 [o] A game's persisted career includes its seven business responsibilities, progression mode and observation triggers; the waiting days of each owner-held approval (→STAFF-48), absent in older saves, which start counting at 0; its standing director/manager support policy; the owner's spending request per delegated decision that spends money, absent at 적당히 (→ECON-33); the 단장's season plan — its season, the income it rests on and the season's player sales when made — which, absent or from another season, is made at the next settled league round (→ECON-40); aptitude/person continuity and staff-career facts; and outstanding/resolved mediation promises (→WEB-45/5, →STAFF-26, →HIST-14/15).
  - save/export/import preserve outstanding commitments and the linked person's actual age/history, without duplicate fulfilment, appointments or payments on reload.
  - retain existing corruption/compatibility protection and 100-season lossless budgets (→SAVE-4/11/13). Feature activation and compatibility for existing careers require →SAVE-18.

- SAVE-18 [o] The responsibility/progression/second-career/mediation feature set, with the squad rules (→CLUB-40–44, the 단장's closer trait →STAFF-20) and club reputation (→LEAGUE-14), started new careers at an incompatible rules 3.0.0 boundary; the current boundary is →SAVE-19.
  - Unsupported careers are not converted or automatically reset; current protection follows →!SAVE-11/29.
  - new careers initialize all seven responsibilities, automatic mode, match eve on/window opening off and balanced director/manager support under their owning rules (→WEB-45/5, →STAFF-26). Aptitude and person careers begin from new-career generation; legacy pending decisions and promises are not carried over.
  - new-rule saves retain normal validation, export/recovery, confirmed deletion/replacement and lossless 100-season budgets (→SAVE-4/5/11/13/14). No automatic legacy reset runs.

- SAVE-19 [o] The grid match engine (→MATCH-1, →MATCH-14–25) with the 16-attribute player model (→PLAYER-2), discipline and unavailability (→MATCH-19, →CLUB-45, →LEAGUE-15) and post-match material (→MATCH-5) starts new careers at an incompatible rules 4.0.0 boundary; active engine rules are 4.0.0. ← one engine to maintain; earlier players have no 판단력 or 침착성 to convert
  - Historical release cleanup is retired; unsupported careers follow →!SAVE-11/29.
  - a legacy file import is refused with its required rules; future or unrecognized incompatible files/slots still follow →SAVE-5/11.
  - a 4.0.0 career persists the current season's post-match material of watched matches, the spatial counter and discipline totals, current bans and every club's unavailable list, within →SAVE-4 and a passing 100-season benchmark (→HIST-9).

- SAVE-20 [o] A game's saved state reproduces its applied club representative colours, crest compositions, home/away/third kits with their shorts and socks, and the goalkeeper kit (→KIT-1/2/3/8/11), including custom colours and patterns, and an explicit own-kit selection for its named forthcoming fixture (→KIT-6).
  - Reload, slot parking/restoration and export/import recover the same designs and applicable fixture choice; do not reroll another colour, emblem or pattern on read.
  - Identity apply and an explicit fixture-level kit choice are owner decisions under →SAVE-8. Unapplied editor drafts remain session UI work under →WEB-74/86.
  - Existing writer ownership, validation, recoverable-save protection and lossless storage budgets remain →SAVE-4/5/6/11/13. Invalid identity data cannot overwrite a good career.
- SAVE-21 [o] A supported career without identity information follows →KIT-15: preserve its visible crests, representative colours and gameplay facts and supply only missing shirt, shorts and socks designs reproducibly.
  - Apply supported-career identity adoption only through the existing writer-owned validated activation path (→SAVE-3/5/6/11); failure preserves the prior save and recovery/export access.
  - Unsupported gameplay rules remain governed by →SAVE-19. Adding identity grants no further career-reset or legacy-conversion permission.
- SAVE-22 [o] Retained playback preserves the actual crest, outfield-shirt and goalkeeper appearance under →KIT-12 through save/export/import, within existing playback lifetimes and storage limits.
  - Identity edits never rewrite a recorded appearance, including the currently observed settled match.
  - Playback without historical identity information retains that absence and displays the unrecorded status; never backfill an invented historical kit from today's design.

- SAVE-23 [o] A match model (→MATCH-1/22/26/38/39) activates prospectively in supported rules-4.0.0 careers without resetting retained gameplay.
  - a later match-model revision activates the same way: a career on an earlier revision moves to the new one prospectively at the next safe boundary, every settled match keeps the revision that settled it as a label on its record, replays from that record alone (→WEB-23), and no match is resimulated; an earlier revision's match code is therefore not kept. ← one football for every career going forward
  - persist a declared match-model revision and the first tracked boundary of newly available counters. New careers start with full coverage; supported older careers preserve settled scores, contributions, designs, money, dates, personnel and history, and use the new model only for future unsettled fixtures. No backfill or resimulation of settled matches is allowed.
  - model activation is one validated writer upgrade through →SAVE-3/6/10. A queued or already revealed own-match playback completes under its settled model; activation waits for that safe boundary.
  - an older reader refuses a newer database schema instead of silently dropping fields; future-version protection and failed-write/export recovery remain (→SAVE-5/11/13).
  - activating the full model requires →ARCH-31's throughput and capacity evidence; its →MATCH-28 accuracy is measured and reported, not a gate. Saves round-trip all aggregate values, tracking boundaries, saved appearances and settled facts within →SAVE-4/13; a failed gate cannot be replaced by clearing careers or raising the limits.

- SAVE-24 [o] Own-manager tenure/result attribution (→HIST-18/19) activates prospectively in supported careers and survives save, reload, export and import.
  - new careers track from founding. A supported older career begins attribution at a recorded writer-activation boundary, retaining all older match/season/event/person facts and known service dates. Do not parse saved prose to invent missing identities, replay old fixtures, fabricate zero achievements or reset a career.
  - activation follows the validated writer-upgrade and commit rules (→SAVE-3/6/10); a queued or revealed own-match playback completes before its attribution boundary changes. Failure preserves the last committed save and exportable in-memory state.
  - persist tenure identities, exact tracking/date precision, match links and unique accomplishment-source attribution; an older reader refuses the schema and future-version protection remains (→SAVE-11/23).
  - derived totals and display text are not a second persisted accomplishment database. Retain all source facts losslessly within the existing century and capacity limits (→SAVE-4/13), including repeated/interim appointments and a settled round after the century.

- SAVE-25 [o] A supported career saved before the owner's interventions were removed still opens with every other fact kept. On load it drops the state only those interventions used — the coaches' training orders and their strain, care effects and a pending win bonus, tactic requests with the manager's request history, and an owner-set lineup — so the club plays on the coaches' and manager's own calls; the values they set stay as saved: policy dials, direction rows and cards, the ticket price (→ECON-16/17/22/25). ← removing an owner control must not end a career
  - the drop is part of the validated writer activation (→SAVE-10); a failure preserves the last committed save and exportable state (→SAVE-3/6).
  - The retired device strategy library is neither read nor cleaned up at startup (→!SAVE-29); the current device ID and game-slot index remain (→ARCH-29, →SAVE-14).

- SAVE-26 [o] The takeover start (→OWNER, →WORLD-13) begins new careers at an incompatible rules 5.0.0 boundary; earlier-rule careers are never converted, unsupported slots follow →!SAVE-11 without conversion or automatic reset and their export files stay. ← a career founded in an amateur league has no owner fortune, traits, books or pre-takeover past to convert into
- SAVE-27 [o] A career saves the owner's tier, traits, fortune, stake, dividend share, 팬 민심 and both crisis counts, the FFP window's injections, the takeover's facts and loan, and every club's books (→ECON-36) within the storage budget (→SAVE-4); the seasons played before the takeover are kept as season archives (→HIST-2), never as match detail.

  - New NPC closed books may retain operating-income components and owner capital (→!ECON-36/42). Both are optional in older checkpoints: preserve absence, validate present money as exact nonnegative integer strings, and preserve every amount through save/load. Support applies prospectively, never rewriting closed books.
  - Closing Club OVR (→=HIST-12/13) is optional data in the existing season archive row. The own club's identity associates the row's existing season rating with its snapshot. Other league champions' ratings are keyed by club ID. Validate recorded references and whole-number XI ratings and retain them through reopening and export/import. Earlier archives preserve absence; this field is written only when a season closes and requires no storage migration (→!SAVE-10/29).

- SAVE-28 [o] Persist the fact-backed news journal and incremental read summaries (→!HIST-11/22) as optional, versioned save data.
  - supported worlds without them remain loadable; writer activation reconstructs missing summaries once from retained facts.
  - saved cursors and summary fields are bounded and validated.
  - A recognized obsolete own-career card summary may be discarded as optional derived data before current-schema validation; writer activation reconstructs the current summary from retained source facts. Compatibility with the obsolete summary contents is not required. The recognized formats are defined in `packages/contracts/src/career-reads.ts`.
  - Other unsupported formats, unknown/future formats and malformed current summaries fail explicitly without replacing a committed save. This exception never discards or rewrites canonical matches, incidents, events or other game facts.
  - export/import and reopening preserve the journal, record totals and stable IDs; recovery, size limits and original-fact retention remain →!SAVE-2/3/4/5.

- SAVE-29 [o] This beta does not maintain earlier game-storage layouts: localStorage slots, IndexedDB checkpoints and parked games are neither read, migrated nor deleted, and earlier export files are refused as unsupported. ← no player outside the team holds a career yet
  - Current device preferences, notification/read markers and the game index may still use localStorage; they are current metadata, never game data. A slot index entry without its game database reads as an empty slot.
  - game databases keep transaction-safe saves, the season backup, unsupported-save protection and explicit deletion (→!SAVE-3/5/6/11/31). This policy supersedes historical release-reset clauses, without changing simulation rules or pruning career facts.

- SAVE-30 [o] A supported career saved with per-decision 재정 기조 or per-person wage caps opens with every other fact kept: those are dropped on load and every delegated decision runs at 적당히 (→ECON-33). A career whose direction still carries the retired club 재정 기조 row, which the game's UI never wrote, is refused as incompatible, failing safe (→ARCH-16, →SAVE-5); it is never converted. ← removing an owner control must not end a career, and no shim is kept for a row no UI wrote

- SAVE-31 [o] Each game keeps one backup of its database, replaced after each season close's save commits and before any writer upgrade of its rules, catalog or schema (→SAVE-10); only a complete, consistent copy replaces the previous backup. ← a transaction protects a save cut short, not a fact saved wrongly
  - a corrupted compatible database offers recovery from the backup, naming the backup's season and date and that later progress is lost; recovery is never automatic, and the corrupted database can be exported before recovery replaces it.
  - deleting a game deletes its backup (→SAVE-14).
- SAVE-32 [o] The engine holds in memory what the current season plays and changes; records it no longer changes — careers of people without a current role, archived seasons, past seasons' settled matches and material, the news journal, ledgers and season records — stay in the database and are read on demand (→!ARCH-36). ← a career's growing history no longer grows the world held in memory, its hand-offs or a save (measured 261119: people 44 of 62 MB of a 1980 takeover world, 43,692 of 49,253 retired)
  - a record taken back into play, such as a retired person hired, is loaded and then saved like any current row.
  - screens read such records through bounded, paginated worker reads (→ARCH-6), never the whole history at once.
  - moving a record out of memory never drops it (→SAVE-13).

- SAVE-33 [o] Facility continuation (→~ECON-43) is saved with the owned club. Each part's off, enabled without pending authorization and enabled awaiting funds states are distinct. The active work record stays separate. A supported save without a setting defaults to off for that part, preserving any work under way. Loading or reading a game does not start work or charge the club.

## chg
- r74 261120 SAVE-27✎ season archive row without closing Club OVR coverage→optional closing Club OVR with validated values, earlier absence preserved without migration
- r73 261119 SAVE-33+ per-part continuation and pending authorization survive save and load; absent settings default to off
- r72 261119 SAVE-2✎ versioned JSON envelope, canonical-JSON checksum and adaptive gzip-cjk14/pure-JS brotli-bmp127 codecs→one SQLite database per game with versioned metadata, facts stored once, no packing/text encoding/compression · SAVE-3✎ IndexedDB active/previous checkpoints with copy-verify and manifest→changed rows in one transaction in the engine worker, full validation only at open/import · SAVE-4✎ 6 MiB UTF-16 checkpoint, 8 MiB file, 32 MiB decompressed→no database budget beyond the browser quota, export file 256 MiB, database 1 GiB · SAVE-6✎ read-only tabs queue for the lock→one playing tab, another offers 여기서 이어 하기, no read-only view · SAVE-7✎ codec→saves, export, import · SAVE-8✎ background codec worker checkpoint→changed rows between steps · SAVE-9✎ same envelope→gzip database behind a versioned SHA-256 header (.haeram-save), import validation order · SAVE-10✎ upgrade committed through SAVE-3→after a backup; read-only clause removed · SAVE-11✎ recover the validated predecessor→recover from the backup; raw slots/manifest→database untouched · SAVE-12- injected worker codec validator retired · SAVE-13✎ lossless compact encoding v1–v3 within SAVE-4→lossless facts, 100-season profiles save/reopen/export within SAVE-4 · SAVE-14✎ active/previous plus parked envelopes in IndexedDB, copy-verify switch→one database and backup per slot, close/open switch · SAVE-21/23/24/25/27/28✎ read-only, checkpoint container and compact wording→database schema and committed save · SAVE-29✎ earlier localStorage layouts→also IndexedDB checkpoints/parked games and earlier export files; manifest removed · SAVE-31+ season and pre-upgrade backup, offered recovery · SAVE-32+ current season in memory, unchanging records in the database read on demand
- r71 261119 SAVE-19✎ persisted every own match's material and the season heat maps→watched matches' material only, no heat maps
- r70 261114 SAVE-10✎ stale 0.7.0-only label→one coherently prepared current release with explicit compatible rules-5 patch labels including 0.8.0; metadata-only writer upgrade preserves facts and absent fields, incompatible/future rules remain refused
- r69 261114 SAVE-27✎ books without financing breakdown→optional lossless income components/owner capital, absent older facts preserved and prospective support
- r68 261113 SAVE-17✎ per-decision 재정 기조 and wage caps→the owner's spending request per delegated decision (absent = 적당히) and the 단장's season plan (season, planned income, sales at the plan); SAVE-30+ per-decision 재정 기조 and wage caps dropped on load, a retired 재정 기조 direction row refused as incompatible
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
