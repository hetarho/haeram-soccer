# ARCH Web-first game architecture
> r35 | Deliver a stable, deployable browser demo with recoverable local saves and a planned Flutter migration.

## decisions
- ARCH-1 [o] Delivery order: complete the playable web demo before optional Supabase hall-of-fame work and Flutter commercial-release work.
  - Product-contract planning precedes the relevant scaffolding, dependency installation, cloud-resource, and publishing milestones.
  - Web goal: attract interest through observable matches, meaningful statistics, strategic experiments, and a continuing club history.
  - Carry the agreed eight-country scope: England, Spain, Germany, Italy, France, Portugal, Netherlands, Belgium; other European associations provide representative clubs.
  - Carry the takeover start with owner wealth tiers and traits, manager personality, recruitment, marketing, sponsors, historical prices/currencies, and historically introduced European competitions.
  - Product rule details and balance values belong in product SSOTs derived from `ideation/club-history-reboot.md`; architecture does not silently settle their open policies.
- ARCH-2 [o] Web stack: React + TypeScript in strict mode + Vite, delivered as a static SPA. ← fast browser entry and a deployment artifact without an application server
  - pnpm workspaces; the pnpm release is pinned by `packageManager`; stable dependency versions and the exact active-LTS Node release are pinned at scaffolding; commit the lockfile.
  - CSS Modules and CSS design tokens; Canvas 2D for the simplified pitch; SVG for initial charts; semantic HTML for tables and controls.
  - Zustand holds UI selections and engine read models; Zod validates external/serialized boundaries.
  - The first web release requires neither sign-in nor a game backend. Supabase is not a runtime dependency of local play.
  - `haeram-spec-creator` remains an npx tool, not an application dependency.
- ARCH-3 [o] Repository structure separates domain code, contracts, data, browser adapters, and future platform code.
  | Path | Responsibility |
  |---|---|
  | `apps/web/src/main.tsx` | entry: presentation bootstrap, React root |
  | `apps/web/src/app` | application shell: root component, navigation, app-wide overlays and hosts |
  | `apps/web/src/pages` | routed screens, one slice per screen |
  | `apps/web/src/widgets` | composed blocks shown on several screens |
  | `apps/web/src/features` | one user interaction each (match viewer, match preparation, approvals, …) |
  | `apps/web/src/entities` | one domain noun each (club, player, league, match, office): its views, Canvas painting and framework-free view helpers (`*.ts`) |
  | `apps/web/src/shared` | game-free UI kit, shared styles, formatting and navigation state |
  | `apps/web/src/lab`, `constants`, `design-system` | separate developer tool entries; they import slices through their public API |
  | `apps/web/src/runtime` | main-thread client and store, engine worker host, protocol, view publisher, codec worker, read models shared with the worker |
  | `apps/web/src/adapters` | browser storage repositories, checkpoint commit, save codec and packing, preference stores, resource loaders |
  | `apps/web/src/presentation` | locale/theme registry and controller, shared presentation labels and assets (→ARCH-32) |
  | `packages/contracts` | commands, events, projections, save/catalog DTOs, boundary schemas |
  | `packages/engine` | framework-independent simulation and domain state; `grid/` and `aggregate/` compute matches |
  | `packages/catalogs` | versioned countries, names, competition eras, prices, currencies |
  | `tests/fixtures` | shared simulated test worlds and workloads (→ARCH-21) |
  | `fixtures/portable` | planned: seeds, commands, catalogs, expected facts, save migration cases (→ARCH-20) |
  | `tests/e2e` | browser journeys, persistence/recovery, built-site smoke checks |
  | `scripts` | verification, measurement and dependency tooling |
  | `spec` | current policies, implementation tasks, standalone state |
  | `apps/flutter` | future Flutter application; do not scaffold in the web milestone |
- ARCH-4 [o] Dependency direction: contracts → engine/catalogs → platform adapters → UI.
  - Engine imports DTO types and injected catalogs; it does not import React, Zustand, DOM, browser storage, HTTP clients, or rendering.
  - Catalogs are data; schema validation occurs before they enter the engine.
  - React may display projections and submit commands; it does not directly modify canonical game state.
  - UI code imports engine values only from read leaves: modules whose runtime import closure reaches no world generation, season, match or grid-execution orchestration. Constants, labels and pure reads the UI needs live in such leaves beside their data. ← a label or read pulled through an orchestration module ties the screen and its tests to every engine change
  - Existing UI imports of orchestration modules are listed exceptions guarded by an architecture test: a new UI→orchestration import fails, and so does a listed import that no longer exists, so the list only shrinks. Moving domain reads into the published view instead is a separate measured decision.
  - Web UI source follows Feature-Sliced Design, highest first: app → pages → widgets → features → entities → shared. A layer imports only lower layers; slices of one layer never import each other, except an entity naming another through that entity's `@x/<consumer>.ts` cross-import file; code outside a slice imports only its `index.ts`, which opens with what the slice is for, or the `logic.ts` entry below. A dynamic `import()` names the module file instead of the index, and the build treats layer modules as free of import side effects (a module joins a chunk only when the chunk uses one of its exports), so lazy chunks stay split; a layer module therefore never relies on being imported only for its side effects. `runtime`, `adapters` and `presentation` sit below every layer and never import one, keeping the Worker free of React (→ARCH-6). ESLint enforces the direction; no legacy flat UI folder remains. ← a change and its reading stay inside one cohesive folder behind one public API, and a slice's consumers are visible from its index
  - Code run outside the Vite build (Playwright specs, test fixtures, scripts) loads only script and JSON modules, never a stylesheet, another asset or a slice index: a module such code reaches imports another slice only through an entity's `@x` file or that slice's `logic.ts`, a second public entry that re-exports only the slice's own `lib/` modules and that its `index.ts` re-exports whole. ← Playwright's Node loader cannot load CSS and an index re-exports components beside its logic, so one import through an index stops every browser spec from loading, and only the release gate loads them
    - an architecture test walks the runtime import closure of every slice's `logic.ts` and of every web module `tests/e2e` and `tests/fixtures` import, failing on any file other than a script or JSON module and on any slice index; ESLint keeps each `logic.ts` to its own `lib/` and lets a dynamic `import()` name neither entry.
- ARCH-5 [o] A versioned deterministic engine owns game progression.
  - Inputs: world seed, explicit commands and the game day each applies at, engine/rule versions, and catalog versions.
  - Use a documented seeded PRNG with portable test vectors and separately named streams for generation, matches, and other stochastic systems.
  - Persist PRNG state where needed; wall-clock time, `Math.random`, locale, and animation speed do not determine game outcomes.
  - A fixed simulation clock advances independently of rendering; viewing, pausing presentation, or fast-forwarding does not reroll completed facts.
  - The same inputs produce the same facts however time is advanced — a day, a round or the rest of the season (→LEAGUE-11) — and whatever is viewed or read. ← the control that advanced time must not change the club's history
  - A draw is named by what it settles (a fixture, a player, a bid, a request, a campaign) and its game date, never by a count of commands; reading the inbox or any other bookkeeping command changes no later outcome.
  - Decide the PRNG algorithm and simulation tick parameters with portable fixtures before implementing dependent domain systems.
- ARCH-6 [o] One engine instance in a Web Worker is the sole writer for the active world. ← keep computation off the UI thread and centralize mutations
  - Browser commands are serialized; simulation runs in interruptible bounded batches.
  - Worker messages include protocol version, session ID, request ID, expected world revision, and validated payloads.
  - Duplicate requests do not repeat recruitment fees, sponsor payments, currency transitions, or fixture settlement.
  - Publish bounded UI projections/deltas, not the complete world on every simulation step.
  - On a day with our league fixture, the day's other league fixtures may be computed on helper workers from a read-only copy of what those fixtures read, while the engine worker plays our match; the engine worker stays the sole writer and records every result in fixture order. Without helpers (creation failure or too few cores) it computes them itself. Both paths give identical worlds, checked by a test comparing a season played each way. ← other clubs' fixtures are about 40% of an own match day (measured 261027)
  - Read-only requests (head-to-head) are validated like commands but answered between simulation steps, without the revision check, receipt or view, so a read never waits behind a season command or flickers the busy state.
  - A worker failure restores the last committed checkpoint and reports any uncommitted progress; it does not silently invent a continuation.
  - Vite provides worker bundling: [Vite worker support](https://vite.dev/guide/features.html#web-workers).
- ARCH-7 [o] Render match snapshots with Canvas 2D and interpolation; animation is presentation only.
  - `requestAnimationFrame` does not execute football rules or advance the world calendar.
  - Match events and aggregate statistics come from the same engine facts.
  - Page navigation, selected player, playback speed, and chart filters are UI state.
  - Sort/filter source records before paginating; start with 50 visible table rows and bounded chart points.
  - Provide a readable statistics/table alternative to the pitch view and touch-accessible controls.
- ARCH-8 [o] Model identity and history with stable IDs and normalized records.
  - Saves and facts reference club/player/manager/competition IDs rather than duplicating live objects.
  - Historical snapshots preserve the values relevant to their time; later transfers, retirement, names, or skills do not rewrite them.
  - Store completed economic transactions and their effective dates; duplicated processing must be harmless.
- ARCH-9 [o] Use portable numeric and calendar representations.
  - Money: currency-period ID plus decimal-string integer minor units; domain arithmetic uses BigInt and rational conversion factors.
  - Rounding and currency-unit precision are explicit ECON policies; floating-point arithmetic must not silently settle ledger values.
  - Outcome-critical probabilities, counters, and coordinates use specified integer/fixed-point representations where needed for cross-language replay.
  - JSON contains neither BigInt primitives nor NaN/Infinity; encode exact integers as decimal strings where required.
  - Birth dates, game dates, season labels, and effective dates use the game calendar; device timezone and current real date do not age players.
- ARCH-10 [o] All game catalogs are versioned, source-attributed build inputs.
  - Country/group sizes, promotion, names, European competition eras, price indices, and currency transitions have schema validation and provenance.
  - A world pins catalog/rule IDs and hashes; content updates do not silently reinterpret saved records.
  - Historical gaps and future estimates have explicit source status.
  - World generation is local and seeded; it does not require an LLM or external API call.
  - Keep supported old catalog versions available when needed by saves, or provide an explicit tested migration.
- ARCH-11 [o] The browser save repository keeps game checkpoints in IndexedDB for the web demo.
  - Checkpoint layout and storage fallback follow →SAVE-3; parked game slots follow →SAVE-14. Small settings, the manifest and the slot index live in localStorage; export/import files stay the portable copy.
  - Namespace application keys; do not clear unrelated origin storage.
  - UI-thread adapters own browser storage reads/writes; workers handle serialization, compression, checksum calculation, and validation.
  - localStorage is synchronous; its documented typical allowance is 5 MiB per origin, not a guaranteed amount available to the application, so it holds checkpoints only as →SAVE-3's fallback. [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API), [storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- ARCH-12 [o] Save format: versioned JSON envelope with losslessly compressed canonical state and a SHA-256 integrity checksum (→SAVE-2).
  - Envelope fields and codec selection follow →SAVE-2.
  - Use browser Compression/Decompression Streams in a worker; support is checked at startup. [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)
  - Large checkpoints use a pinned pure-JavaScript Brotli codec in the background codec worker; lazy-load it only when needed. Bound decoder output and window allocation before growth; preserve the existing content-security policy.
  - Checksum detects accidental corruption; it is not proof that a client-authored result is honest.
  - Export the envelope as a portable `.haeram-save.json` file; Flutter can decode the same format.
- ARCH-13 [o] Checkpoint commit order, verified predecessor and storage fallback follow →SAVE-3; only acknowledge a successfully committed generation.
  - Build and validate the complete candidate checkpoint in a background codec worker before touching checkpoint storage; the simulation and UI never wait for it.
  - Keep the previously committed checkpoint loadable until a newer checkpoint commits successfully.
  - On quota/write errors retain the last committed save, preserve recoverable in-memory state, offer export/retry, and do not report success.
  - Autosave committed decisions at once and automatic progression in the background at a bounded interval (→SAVE-8), never per simulation step or animation frame; expose when the game was last saved.
  - On load validate the manifest and selected slot; use the compatible previous checkpoint for recovery, explaining the recovered generation.
  - Missing/invalid manifests require deterministic validated-slot recovery; invalid saves are never replaced with a fresh world automatically.
- ARCH-14 [o] Storage and longevity must pass an early measurement gate.
  - Per-checkpoint and total localStorage budgets follow →SAVE-4, conservatively accounting for key/value UTF-16 size.
  - Catch actual quota failures even when estimated usage is below budget; do not assume other applications or browser modes leave the full quota available.
  - Measure representative eight-country worlds at the takeover (after world generation), a mid-career checkpoint, and 100 simulated seasons before polishing the complete UI.
  - A 100-season capacity claim requires a passing recorded benchmark.
  - If the budget fails, optimize encoding within the retention policy (→ARCH-25); do not silently prune agreed history or move checkpoints to cloud storage.
- ARCH-15 [o] Persist game facts and history, not rendering noise.
  - Persist current world state, settled fixtures, season standings/honors, meaningful club/personnel/economic decisions, and the player's club career records.
  - Use compact IDs, shared dictionaries, and aggregate rows; do not save React stores, event subscriptions, per-frame coordinates, or repeated whole-player objects.
  - Old pitch animation traces are not required for continuing a career; ordinary match and season facts remain distinct from optional replay detail.
  - NPC historical metric retention follows →ARCH-25; existing facts may not be silently removed during updates or imports.
- ARCH-16 [o] Save import and migration are fail-safe.
  - Validate envelope, codec, checksum, declared versions, referential integrity, field bounds, and decompressed-size limits before applying an import.
  - Set explicit bounded import limits from measured fixtures at scaffolding; decompression must stop when its limit is exceeded.
  - Migrations are versioned pure transformations with old-save fixtures and round-trip checks; keep the original until the replacement commits.
  - Unsupported future schemas or unavailable catalog versions open in a recovery/export path; never overwrite them with an empty save.
  - Saving failures, catalog incompatibility, or worker failures have typed, actionable errors.
- ARCH-17 [o] Only one browser tab may write an active world.
  - Use an exclusive Web Lock for the active save and BroadcastChannel/storage-event notifications for read-only tabs.
  - A second tab explains its read-only state; it does not compete with the first tab's progression.
  - Feature-detect required browser capabilities; unsupported capabilities produce a readable recovery/compatibility path instead of a partial writer.
- ARCH-18 [o] Web UI supports current stable desktop and mobile browsers with responsive controls.
  - Browser gate: Chrome/Edge, Firefox, and Safari/WebKit families; exercise touch-sized mobile layouts in browser tests.
  - The web demo starts without account creation; after initial assets/catalogs are available, local play does not depend on a network API.
  - Offline reload/service-worker installation is a later scope; do not claim guaranteed offline startup from ordinary HTTP caching.
  - React escapes user text; imported names are data, not executable HTML.
- ARCH-19 [o] Optional hall of fame is an isolated future Supabase adapter.
  - Initial web implementation defines the adapter contract and disabled feature flag; it installs no Supabase SDK and creates no backend resources.
  - Future submission sends a minimal record: pseudonym, world/rule versions, country, takeover decade, wealth tier, trait count, seasons, and score/honor summary; no full private save upload by default.
  - Supabase Auth identifies the submitter; an Edge Function validates and writes submissions, and RLS protects table access.
  - Publishable client keys may be public; secret/service-role keys remain server-only. [Supabase security](https://supabase.com/docs/guides/database/secure-data)
  - Local client results are self-reported unless a separate replay/verification mechanism is implemented; RLS/checksums alone cannot establish honest gameplay.
  - A hall-of-fame outage must not prevent local play, saving, or history browsing.
- ARCH-20 [o] Flutter release reuses contracts, catalogs, portable fixtures, and game-rule specifications.
  - TypeScript implementation and React UI are not directly reused as Dart/Flutter code; port the domain engine and build native Flutter screens.
  - A future Dart engine runs the same seeded fixture scenarios and compares canonical facts, money, competition progression, and history with the web reference.
  - A Flutter persistence adapter may use app-local files/database storage; preserve the exported save contract and explicit migration path.
  - Supabase remains optional hall-of-fame infrastructure, not automatic cloud-save synchronization.
  - Avoid a JavaScript-runtime/WebView dependency as the planned native game engine; mobile store integration belongs to the later Flutter architecture revision.
- ARCH-21 [o] Testing is required for behavior that protects continuity and correctness.
  - Vitest: deterministic engine, calendars, money, contract effects, IDs, and migrations.
  - fast-check: seeded invariants for league/group capacities, fixture settlement, balance conservation, transitions, and save round trips.
  - Portable fixtures: command sequences and canonical expected facts consumed by the web engine now and the Dart engine later.
  - Playwright: start and takeover → watch/advance → compare metrics → recruit → save/reload → export/import; include quota, corruption, duplicate-tab, and worker-recovery cases.
  - Fixture data is synthetic and explicitly marked; tests do not claim the real catalogs are complete merely because a mock world runs.
  - A fast unit test isolates a function or component with minimal prepared data; whole-world progression, host/codec round trips and multi-match statistical checks belong to the integration tier. Every existing case remains in exactly one of unit, integration or contract.
  - A test simulates only the step it verifies: a world it merely needs in some state (after a season close, some rounds in, a long career) comes from `tests/fixtures/worlds.ts` (`simulatedWorld` for a founding plus seasons and rounds, `cachedWorld` for any other builder), built once per dependency fingerprint and shared across files and runs (`node_modules/.cache/haeram-worlds`, cached in CI). Cache identities include local transitive runtime imports, builder inputs and relevant toolchain/configuration; unrelated UI/assets/tests do not invalidate engine-only worlds. Generic JSON caching and release constants have no simulation imports. UI-only browser journeys may load versioned validated prepared checkpoints; separate live-engine integration cases retain writer coverage. ← after own-league matches played the grid engine a season cost about 10 s and tests rebuilt the same seasons, so the unit suite took 30–40 minutes
- ARCH-22 [o] Scaffolding must provide these executable verification scripts.
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm run test:unit`
  - `pnpm run test:integration`
  - `pnpm run test:contract`
  - `pnpm run validate:catalogs`
  - `pnpm run build`
  - `pnpm run test:e2e`
  - `pnpm run benchmark`
  - `pnpm run verify`
  - `verify` runs type/lint/format, unit/integration/contract tests, catalog validation, production build, and browser tests; benchmark artifacts are required at the storage and release gates.
  - Scaffolding implements the scripts; verification reports must identify actual executed commands and must not count planned scripts as passed checks.
- ARCH-23 [o] CI and release use a reproducible static build.
  - GitHub Actions runs parallel jobs on every code push, each on the pinned toolchain with `pnpm install --frozen-lockfile`: checks (type/lint/format, contract tests, catalog validation, production build); unit and integration tests in separate jobs (integration in three shards), each restoring the simulated test worlds (→ARCH-21); built-preview browser tests per browser, each browser in two shards, each installing only its pinned browser. Every job has a time limit (checks and unit 20 min, integration 45 min, browser shards 120 min) so a hung run fails instead of holding main's run queue for the platform's six hours. Each retains its test/build reports; locally `pnpm run verify` runs the same checks in one go. ← one serial job took about 22 minutes, 15½ of them browser tests
  - The storage and first-play benchmarks against the production build run only on demand, in their own manually dispatched workflow that retains `apps/web/dist` and the benchmark reports; a storage or release gate task (→ARCH-14) runs `pnpm run benchmark` locally or has the owner dispatch that workflow. ← the 100-season benchmark took about 90 minutes on every push once own-league matches played the grid engine
  - Require verification checks on the protected production branch; Netlify production deploys only that branch and uses the pinned install/build commands.
  - Deploy to Netlify using the same pinned build command and output directory; preview branches do not replace production.
  - Configure a stable production origin before public saves are created; changing origin requires export/import, not an assumed browser-storage transfer.
  - SPA deep-link reloads, module workers, missing assets, and HTTPS capability checks must pass on the built preview.
  - Versioned assets/catalogs use immutable caching; entry HTML uses revalidation. Do not add a service-worker cache in the initial release.
  - Rollback the code deployment without clearing local saves; incompatible new saves remain recoverable/exportable rather than being silently downgraded.
  - Provider references: [Git integration](https://docs.netlify.com/build/git-workflows/overview/), [previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/), [rollbacks](https://docs.netlify.com/deploy/manage-deploys/manage-deploys/).
- ARCH-24 [o] Web implementation proceeds through evidence-producing milestones.
  | Milestone | Deliverable | Exit evidence |
  |---|---|---|
  | Product contracts | Convert settled gameplay policies into domain SSOTs; resolve parameters needed for the first scenarios | Inputs, outcomes, data ownership, and required catalog coverage are explicit |
  | Foundation | Workspace, schemas, pure engine harness, worker bridge, verification scripts | A deterministic fixture produces identical canonical facts in repeated runs |
  | Persistence feasibility | Compact current world/history, codec, active/previous checkpoints (→SAVE-3), migration/export | Eight-country fixtures and 100-season storage benchmark meet →ARCH-14; failures remain blocking for full UI polish/release and record the concrete unresolved limit |
  | Playable observation loop | Seeded founding, domestic fixtures, Canvas observation, statistics, reload | A new club can play a real engine-driven fixture and continue after reloading |
  | Full agreed web loop | Recruitment, manager personality, business choices, historical economy, European competition eras, meaningful history | Changes affect engine facts; domestic/European schedules and financial records remain consistent |
  | Release hardening | Browser/recovery checks, responsive entry, versioned data, preview/deployment procedure | Verification reports, storage benchmark, production-build smoke checks, and save-compatible rollback rehearsal |
  | Optional hall of fame | Separate score policy and Supabase adapter | Explicit record trust/score rules and independent failure handling |
  | Flutter commercial release | Dart port, native views/storage, mobile packaging | Portable fixtures and save compatibility pass before store-release work |
  - Playable intermediate milestones do not redefine the eight-country/full-feature target as completed.
- ARCH-25 [o] Durable archive tiers are owned by →HIST-1 and →HIST-2; preserve own-club detail and global season/honor summaries.
  - No automatic expiry, pruning, or private upload; capacity still requires the measured gate.
- ARCH-26 [?] Hall-of-fame score formula, difficulty/year categories, ownership/visibility, and self-reported versus server-verified records need a later product SSOT.
- ARCH-27 [?] Netlify project/account and stable production hostname are deployment configuration inputs to supply before publishing.
  - Production repository: https://github.com/hetarho/haeram-soccer.git.
- ARCH-28 [o] Browser interest and responsiveness have measured release budgets.
  - Initial entry JavaScript + CSS: at most 250 KiB compressed, excluding lazy engine/catalog chunks; report all first-play transfer sizes separately. Pages visited later (the records room, cup history) load as their own chunks.
  - Reference trace: pinned Chromium, 4x CPU slowdown of the whole renderer including the engine worker (DevTools throttling skips workers), Fast 4G for cold loading, desktop and 390x844 mobile viewports.
  - UI feedback after controls: p95 below 100 ms during ordinary simulation; observed pitch rendering targets at least 30 FPS on the reference mobile viewport.
  - World generation after a valid start: at most 5 seconds for a 1930 takeover; a later decade at most 5 seconds a season played before the takeover on the reference trace (2000: 63 seasons, about 5¼ minutes), with the history view (→!WEB-115) showing the season reached throughout; the history view adds at most 10% to the generation time. ← the wait for a later decade is spent watching its history, and 90 seconds for 2000 would need a world 3.6× faster
    - measured 261103 (preview build, process-wide 4x, a shared host under load): 1930 3.8 s, 1970 131.9 s, 2000 322.0 s (5.1 s a season); without the slowdown 1.9 / 33.0 / 68.2 s.
    - measured 261104 (preview build with the history view, process-wide 4x on a 10-core M1 Max at load 2.8–4.1, which slowed the worker 5.3–5.4×): 1970 61.1 s (1.85 s a season), 2000 129.8 s (2.06 s a season); without the slowdown 15.5 / 28.1 s. The view adds about 0.1% in the worker (Node 1970 A/B +0.6% wall, pairs −0.2 to +1.6%) and the club list's 3.2–3.5 s hold behind its last card, at most 5.6% on the reference trace.
  - Benchmark reports record tool/browser versions, dataset size, world seed, save sizes, match/season throughput, and long-run memory; these are targets to measure, not invented results.

- ARCH-29 [o] Owner-scoped data sits behind profile ports: a device profile now (a random device ID, the game-slot index), an account profile later. ← games should follow the owner once sign-in exists (→ARCH-19) without reshaping local data
  - every record carries its owner, a stable ID and an updated time; an account adapter adopts device records on first sign-in and merges by ID and updated time.
  - no sign-in, upload or sync exists now (→WEB-1, →WEB-6).
- ARCH-30 [o] Verification runs in tiers; no task runs the whole suite or any browser spec. ← the serial suite took about 22 minutes, 15½ of them browser tests, while a task's own checks take about a minute; even the covering Chromium specs made each task too slow
  - task, before each task's done commit: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm exec vitest run --project unit --changed "$HAERAM_DIFF_BASE" --passWithNoTests`.
  - a task never runs browser specs (`playwright`, `tests/e2e`), not even for a UI, browser-journey, storage or worker change; such a task runs `pnpm run build` beside the task checks.
  - an acceptance item naming `tests/e2e` specs is confirmed by the release run, not by the task session: the task writes or updates those specs, checks the item `- [v]` once the build passes, lists only the commands it ran in `- verified:` and names the specs left to the release run in `- limits:`.
  - `HAERAM_DIFF_BASE` is the commit the task started from: the work CLI sets it, a standalone session sets it itself.
  - batch, before a session pushes code to `next`, the branch every session's work gathers on: `pnpm run test:unit`, `pnpm run test:contract`, `pnpm run build`.
  - release, once, by the last session still working (no other live session with a task in progress): merge `main` into `next`, run `pnpm run verify:batch` (unit, integration, contract, catalogs, presentation, build and every journey on Chromium) through `vibe check --tier batch`, fix what fails, then merge `next` into `main` and push `main`, which deploys. Every other session only gathers its work on `next`. ← sessions running full suites and browser journeys side by side overloaded the shared host; one gate before each deploy is enough
  - browser specs run only in the release run; a failing spec there stops the release until it is fixed.
  - CI, after a push to `main` (pushes to `next` start none): ARCH-23 runs every browser. One waiting command reads the result once per push, never repeated model polling; a failure becomes a fix task. A push touching only `spec/`, `artifacts/` or Markdown starts no CI and needs no wait.
  - a work group collecting local commits maps task → `--task-verify`, quick checks → `--verify`, and the complete batch → `--group-verify`; task commits and WIP checkpoints do not trigger the batch. A group explicitly pushing each integration runs the batch before that push. Reuse successful verification of identical source, command and scope.
  - `pnpm run verify` is the one-go local equivalent of CI, every browser spec included, so no task runs it: it stands in for the batch run when CI is unavailable, and a storage or release gate task that needs local raw reports alongside the benchmarks takes the browser-spec reports from that batch run (→ARCH-22).

- ARCH-31 [o] The continuous-match and full probabilistic-result release has a capacity gate (→SAVE-23); its throughput (→!ARCH-34) and accuracy (→MATCH-28) are measured and reported with the release, not gates. ← the model ships first and its football is calibrated on the released model
  - record a pre-change baseline and final source fingerprint on the same pinned toolchain, machine and fixed worlds. Measure isolated fixture processing, complete season engine time, record settlement, codecs and observation separately; record warm-up, repetitions, medians, samples and memory.
  - throughput has no absolute budget in milliseconds or seconds. Isolated fixture processing and complete-season engine time are compared with the previous release on one machine (→!ARCH-34) and reported as ratios naming that machine; do not skip clubs, competitions, calendar effects, player records or business actions to improve them.
  - the ratio to the baseline summary path is reported as context; measurements from another machine are context only. Keep the existing entry, initialization, control and rendering budgets (→ARCH-28) and the unchanged lossless century limits (→SAVE-4/13).
  - version executable metric/condition registries and calibration reports, retain a separate validation corpus, and report unsupported, insufficient and failing cases explicitly. Accuracy work uses timeboxed exploration with recorded residual errors; a timebox ending never reports a failing metric as passing.
  - the final combined movement, intention and aggregate model passes the capacity gate and reports its throughput ratios together. Reusing a measurement taken before a relevant change, a successful cosmetic benchmark, or an unexecuted planned check is not release evidence. Verification tiers remain →ARCH-30.

- ARCH-32 [o] Locale and theme packs are data loaded through browser presentation adapters, independently of simulation and game checkpoints (→WEB-90/91).
  - `apps/web/public/presentation/locales/index.json` is the sole list of available locales; `apps/web/public/presentation/themes/index.json` is the sole list of available themes. Each registry declares its default and entries with stable IDs, display labels and relative resource URLs. Shared consumers derive choices and loaders from these registries; supported-ID unions, component-specific lists and per-ID branches are not additional registries.
  - A locale is a JSON message pack; a theme is a JSON pack of semantic visual tokens, font resources, image-slot mappings and icon resources, with an optional stylesheet. Adding a pack within this shared contract changes its registry entry and data/assets only, with at most three theme configuration/style files plus required locale resources (→WEB-90); it never adds or edits a TSX component or a loader branch for that ID. Image and font binaries are outside that configuration-file count.
  - Pure contracts, validation, message interpolation and semantic resource resolution live in `apps/web/src/presentation`; browser adapters own fetch, resource installation and preference storage. React consumes stable presentation services/hooks. Simulation, contract facts, worker protocols and playback timing do not import pack registries, React state or the selected locale/theme.
  - Browser adapters load the same-origin registries and requested resources at runtime from the static deployment; no runtime directory listing or executable pack code is required. A resource-only addition must also be deployed and is available on a fresh registry load without an application-code change. Assets keep the existing caching/deployment rules (→ARCH-23).
  - Validate IDs, unique entries, default membership, resource shapes, message parameters and required semantic slots. An unknown saved selection falls back to the registered default; a failed change retains the last usable pack. A failed initial default load offers retry without changing game data. Load only the selected packs and currently needed assets; stale asynchronous completions cannot replace a newer selection.
  - Locale/theme preferences are small namespaced browser settings, separate from world saves and worker commands; denied storage leaves session selection usable. Stored prose remains unchanged in game data; display adapters resolve recognized source messages without mutating records. Rendering preferences cannot change seeded outcomes, canonical facts, progression or replay position (→ARCH-5/7/11/28).
  - The shipped locale/theme inventory follows the registries and →WEB-90/91; adding a pack does not change shared contracts or introduce a supported-ID list in code.
  - All authored display prose belongs in message resources, including engine-produced explanations/errors/news. The locale-independent source formatter in contracts emits canonical source prose; presentation translates text leaves and rich messages. Engine comparisons, IDs and persisted facts never read the selected locale.
  - ESLint rejects Korean executable string/template literals, raw JSX prose in any language and literal accessibility text outside the source resource; type-only facts, comments and tests are not display copy. A mandatory `validate:i18n` gate verifies source-resource/default-pack agreement, every registered pack's complete keys/parameters and all static message references. No existing-copy baseline or production-file exemption is allowed.
  - Theme-transition snapshots and animation belong to a progressive browser adapter (→WEB-93). Resource preparation stays asynchronous; installation and presentation publication share one synchronous callback, with a freshness check inside it. Animation failure must not prevent a valid selection.

- ARCH-33 [o] Verification and measurement dependencies follow computation boundaries.
  - Match rules, action/skill primitives and fixture reconstruction are leaf modules: the grid kernel does not import campaign lifecycle/orchestration, and the save codec rebuilds fixtures without importing the season orchestrator. Existing entry points may re-export leaves for compatibility.
  - Expensive measurement reuse is keyed by the runner/workload and its transitive runtime dependencies, catalog inputs, codec and toolchain. Preserve a separate full-source/build provenance fingerprint; unrelated visual assets or test edits do not invalidate simulation-only phases. A relevant source change always invalidates reuse.
  - Keep historical measurements immutable and label later values by source, command, environment, selected checks and cache state; structural dependency/selection checks do not imply runtime speedups.

- ARCH-34 [o] A speed-up succeeds when the candidate is faster than its baseline on the machine it is measured on, beyond the measurement noise; no speed target is set in milliseconds or seconds. ← phones, desktops and CPUs differ too much for one absolute time to mean anything
  - `scripts/perf/ab.mjs` measures it: both sides are bundled the same way from their own trees (identical sources give byte-identical bundles), each process loads both and alternates their reps, and the side loaded first alternates across processes. Main-thread CPU time is the primary measure; wall time is reported beside it.
  - the call: per process the median log-ratio of its pairs, over processes a trimmed mean with a 95% bootstrap interval; faster means the whole interval lies below 1. A small gain that clears the noise counts; a gain inside the noise is not claimed.
  - a result-identical speed-up keeps every workload's output hash (grid, aggregate, day) equal to its baseline's; changing results makes it a model change (→SAVE-23), not a speed-up.
  - a result names the machine, its load, the interval and the hashes; a figure from another machine is context only.

## flow
- Planning: ARCH → gameplay domain SSOTs → create-task → implementation.
- Local play: UI command → validated bridge → engine worker → domain facts/projections → UI statistics/Canvas.
- Presentation: locale/theme registry → selected validated JSON pack → shared presentation consumers; a preference change loads resources without issuing a game command.
- Save: safe game boundary → background candidate envelope/codec/checksum → validated checkpoint commit (→SAVE-3) → committed acknowledgment.
- Recovery: startup → capability check → save validation → load(current|previous compatible|export/recovery) → worker initialization.
- Verification: task checks per task → quick batch before a session's push to `next` → the last session's release gate on `next` → `main` push (deploy) → CI on every browser (→ARCH-30).
- Release: locked install → verification → static build → preview smoke checks → stable production deployment → compatible rollback path.
- Future mobile: portable contracts/catalogs/fixtures → Dart engine parity → Flutter views/persistence → commercial-release validation.

## constraints
- The web demo's primary save store is IndexedDB, with localStorage only as →SAVE-3's bounded fallback; cloud synchronization is not an implicit fallback.
- Animation, network availability, frontend render count, and device time must not redefine game results.
- Browser storage capacity and complete catalog coverage require measured/validated evidence before release claims.
- A long-career capacity claim requires benchmark evidence; a passing UI demonstration is insufficient.
- Never label planned scripts, unimplemented milestones, mock catalogs, or drafted backend infrastructure as completed functionality.
- Current product rules live in `spec/ssot/`; product background is `spec/ideation/club-history-reboot.md`, and the human-readable project overview is `spec/NARRATIVE.md` (repository-relative paths).

## chg
- r35 261109 ARCH-4✎ code outside a slice imports only its `index.ts`→its `index.ts` or `logic.ts`; +code run outside the Vite build loads no stylesheet, asset or slice index, reaching other slices only through their `logic.ts` (own `lib/` re-exports, re-exported whole by the index) or `@x` files, checked by an architecture closure test and ESLint
- r34 261109 ARCH-4✎ lazy chunks kept split by dynamic `import()` of module files→also by building layer modules as free of import side effects; +a layer module never relies on a side-effect-only import
- r33 261109 ARCH-23✎ browser jobs Chromium and Firefox in one shard, WebKit in two→every browser in two shards; +every CI job has a time limit (checks/unit 20 min, integration 45 min, browser shards 120 min)
- r32 261109 ARCH-3✎ `apps/web/src/ui` React screens and view helpers→`app`, `pages`, `widgets`, `features`, `entities`, `shared` layers and the `lab`/`constants`/`design-system` tool entries; ARCH-4+ Feature-Sliced Design layer direction, slice public API, entity `@x` cross-imports, lazy `import()` of module files, infrastructure below every layer, no legacy flat UI folder
- r31 261104 ARCH-32✎ deferred feature/engine extraction→resource-only prose, locale-independent source formatting and display-time resolution; mandatory executable guards for literals, keys, parameters and complete registered packs
- r30 261104 ARCH-28✎ measured 261103 without the view only→also measured 261104 with the history view: 2000 129.8 s (2.06 s a season), 1970 61.1 s, the view at most 5.6% of generation
- r29 261103 ARCH-30✎ batch before a push to main (full suite and Chromium)→quick batch before a session's push to `next` (unit, contract, build); +release: the last session working merges main into next, runs verify:batch once, merges next into main and pushes (deploy); CI after main pushes only
- r28 261103 ARCH-28✎ world generation 2000 at most 90 s→a later decade at most 5 s a season played with the history view (→WEB-115) adding at most 10%; reference trace 4x CPU→4x of the whole renderer including the engine worker
- r27 261103 ARCH-1✎ carry founding, initial-capital difficulty→the takeover start with wealth tiers and traits; ARCH-14✎ measure worlds at founding→at the takeover; ARCH-19✎ submission founding year, initial-capital category→takeover decade, wealth tier, trait count; ARCH-21✎ Playwright founding→start and takeover; ARCH-28✎ world initialization 5 s→5 s for 1930 and 90 s for a 2000 takeover with the season reached
- r26 261102 ARCH-1✎ carry manager personality and tactical requests→manager personality; ARCH-6✎ duplicates never repeat tactics changes→removed from the list; ARCH-8✎ record requested tactics, manager responses and applied tactics separately→removed; ARCH-21✎ Vitest manager-request outcomes and Playwright request tactics→removed; ARCH-24✎ full web loop manager personality/requests→manager personality; ARCH-29✎ device profile holds the strategy library→device ID and game-slot index only
- r25 261028 ARCH-31✎ throughput gates on absolute budgets (fixture ≤1 ms, season ≤15 s median on a reference machine)→no absolute time budget, throughput compared with the previous release on one machine and reported, capacity stays the gate; ARCH-34+ a speed-up succeeds when faster than its baseline on the measuring machine beyond the noise (paired harness, 95% interval, result-identical hashes)
- r24 261027 ARCH-6+ helper workers may compute an own match day's other league fixtures from a read-only copy; the engine worker stays the sole writer, records in fixture order and falls back to computing them itself; identical worlds tested
- r23 261027 ARCH-3✎ app/features/rendering/workers path table→the real ui/runtime/adapters/presentation layout, tests/fixtures and scripts, portable fixtures marked planned; ARCH-4✎ no rule for which engine modules the UI names→UI imports engine values only from read leaves, existing orchestration imports a shrink-only list guarded by an architecture test
- r22 261026 ARCH-11✎ save repository uses localStorage→keeps checkpoints in IndexedDB, localStorage for settings/manifest/slot index and SAVE-3's fallback; ARCH-14✎ never move the active checkpoint to IndexedDB/cloud→never move checkpoints to cloud storage; constraints✎ primary save store localStorage→IndexedDB with the bounded localStorage fallback
- r21 261026 ARCH-21✎ source-wide world cache→dependency-scoped JSON cache and prepared UI checkpoints; ARCH-22✎ unit/contract→unit/integration/contract; ARCH-23✎ mixed unit shards→separate unit/integration jobs; ARCH-30✎ mixed changed tests and per-unit batch→unit-project task checks and one final batch; ARCH-33+ leaf computation boundaries and dependency-scoped measurement reuse
- r20 261024 ARCH-31✎ paired accuracy, throughput and capacity release gates→throughput and capacity gates with accuracy measured and reported, not a gate; a timebox ending does not pass the release gate→never reports a failing metric as passing
- r19 261022 ARCH-31✎ throughput gates NPC fixture ≤50% and season engine time ≤80% of the same-machine pre-change baseline→absolute budgets on a recorded reference machine (fixture ≤1 ms median, season engine time ≤15 s median for both century profiles); the paired ratio becomes context
- r18 261022 ARCH-32✎ fixed single-theme inventory→registry-owned inventory and progressive transition adapter with synchronous guarded commit
- r17 261021 ARCH-32+ runtime JSON registries and presentation-only pack boundaries, resource-only extension, isolated preferences and one-pack foundation
- r16 261020 ARCH-31+ paired complete-model accuracy and performance gates, NPC fixture time ≤50% and season engine time ≤80% of same-machine pre-change baseline, unchanged browser/storage budgets
- r15 261020 ARCH-21✎ setup simulation in unit tests→shared simulated test worlds (`tests/fixtures/worlds.ts`), simulate only the verified step; ARCH-23✎ unit tests leave the checks job for three parallel shards with a cached world store
- r14 261020 ARCH-23✎ storage and first-play benchmarks on every push→only on demand in a manually dispatched workflow; a storage or release gate task runs `pnpm run benchmark` locally or has the owner dispatch it
- r13 261020 ARCH-30✎ task tier: covering Chromium specs for UI/journey/storage/worker changes→no browser specs, `pnpm run build` only; browser specs only in the batch run right before a push to main, which confirms acceptance items naming e2e specs (task: `- [v]` + specs in `- limits:`); `pnpm run verify` in a storage/release gate task→never in a task
- r12 261019 ARCH-30+ verification tiers: task (typecheck/lint/format, changed-file unit tests, covering Chromium specs) / batch before a code push (CI checks job + Chromium journeys) / CI read once per push; a task no longer runs `pnpm run verify`
- r11 261019 ARCH-11✎ previous checkpoint in localStorage→in IndexedDB beside parked slots; ARCH-13✎ two-slot write→previous copy, active copy, manifest; ARCH-14✎ budget 1.5→3 MiB per checkpoint (total 3.5 MiB), budget failure never moves the active checkpoint
- r10 261017 ARCH-12✎ gzip/base64-only description→SAVE-2 adaptive gzip/Brotli with bounded pure-JavaScript worker codec; security policy unchanged
- r9 261012 ARCH-13✎ candidate built and validated before the slot→in a background codec worker nobody waits for; autosave at settled fixture/period boundaries→decisions at once, automatic progression at a bounded interval (→SAVE-8)
- r8 261012 ARCH-23✎ one serial `pnpm run verify` job→parallel jobs (checks, browser tests per browser with WebKit in two shards, benchmarks)
- r7 261012 ARCH-5✎ inputs simulation time→the game day each command applies at; +the same facts however time is advanced; +draws named by what they settle, never by a count of commands
- r6 261012 ARCH-11✎ additional worlds as files only→parked game slots in IndexedDB beside the localStorage game in play; ARCH-29+ owner-scoped profile ports (device now, account later)
- r5 261012 ARCH-6✎ none→read-only requests answered between steps; ARCH-28✎ none→later pages as lazy chunks
- r4 261009 ARCH-2✎ npm workspaces→pnpm workspaces with pnpm pinned by packageManager; ARCH-22✎ verify commands npm run→pnpm run; ARCH-23✎ CI install npm ci→pnpm install --frozen-lockfile
- r3 261007 ARCH-23✎ static provider Cloudflare Pages→Netlify; ARCH-27✎ account Cloudflare→Netlify and repository unspecified→hetarho/haeram-soccer
- r2 261007 ARCH-25✎ unresolved NPC retention→HIST archive tiers; ARCH-9✎ numeric policy owner MONEY→ECON
- r1 261007 initial
