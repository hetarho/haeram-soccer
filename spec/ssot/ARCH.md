# ARCH Web-first game architecture
> r4 | Deliver a stable, deployable browser demo with recoverable local saves and a planned Flutter migration.

## decisions
- ARCH-1 [o] Delivery order: complete the playable web demo before optional Supabase hall-of-fame work and Flutter commercial-release work.
  - Product-contract planning precedes the relevant scaffolding, dependency installation, cloud-resource, and publishing milestones.
  - Web goal: attract interest through observable matches, meaningful statistics, strategic experiments, and a continuing club history.
  - Carry the agreed eight-country scope: England, Spain, Germany, Italy, France, Portugal, Netherlands, Belgium; other European associations provide representative clubs.
  - Carry founding, initial-capital difficulty, manager personality and tactical requests, recruitment, marketing, sponsors, historical prices/currencies, and historically introduced European competitions.
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
  | `apps/web/src/app` | React entry, routing, feature composition, error boundaries |
  | `apps/web/src/features` | founding, dashboard, matches, statistics, club operations, history |
  | `apps/web/src/rendering` | Canvas pitch and SVG chart presentation |
  | `apps/web/src/adapters` | worker bridge, localStorage, save import/export |
  | `apps/web/src/workers` | engine host and background save codec |
  | `packages/contracts` | commands, events, projections, save/catalog DTOs, boundary schemas |
  | `packages/engine` | framework-independent simulation and domain state |
  | `packages/catalogs` | versioned countries, names, competition eras, prices, currencies |
  | `fixtures/portable` | seeds, commands, catalogs, expected facts, save migration cases |
  | `tests/e2e` | browser journeys, persistence/recovery, built-site smoke checks |
  | `spec` | current policies, implementation tasks, standalone state |
  | `apps/flutter` | future Flutter application; do not scaffold in the web milestone |
- ARCH-4 [o] Dependency direction: contracts → engine/catalogs → platform adapters → UI.
  - Engine imports DTO types and injected catalogs; it does not import React, Zustand, DOM, browser storage, HTTP clients, or rendering.
  - Catalogs are data; schema validation occurs before they enter the engine.
  - React may display projections and submit commands; it does not directly modify canonical game state.
- ARCH-5 [o] A versioned deterministic engine owns game progression.
  - Inputs: world seed, explicit commands, simulation time, engine/rule versions, and catalog versions.
  - Use a documented seeded PRNG with portable test vectors and separately named streams for generation, matches, and other stochastic systems.
  - Persist PRNG state where needed; wall-clock time, `Math.random`, locale, and animation speed do not determine game outcomes.
  - A fixed simulation clock advances independently of rendering; viewing, pausing presentation, or fast-forwarding does not reroll completed facts.
  - Decide the PRNG algorithm and simulation tick parameters with portable fixtures before implementing dependent domain systems.
- ARCH-6 [o] One engine instance in a Web Worker is the sole writer for the active world. ← keep computation off the UI thread and centralize mutations
  - Browser commands are serialized; simulation runs in interruptible bounded batches.
  - Worker messages include protocol version, session ID, request ID, expected world revision, and validated payloads.
  - Duplicate requests do not repeat recruitment fees, sponsor payments, tactics changes, currency transitions, or fixture settlement.
  - Publish bounded UI projections/deltas, not the complete world on every simulation step.
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
  - Record requested tactics, manager responses, and actual tactical application separately.
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
- ARCH-11 [o] The browser save repository uses localStorage for the web demo.
  - One active world, one recoverable previous checkpoint, small settings, and a save manifest; additional worlds are export/import files.
  - Namespace application keys; do not clear unrelated origin storage.
  - UI-thread adapters own localStorage reads/writes; workers handle serialization, compression, checksum calculation, and validation.
  - localStorage is synchronous; its documented typical allowance is 5 MiB per origin, not a guaranteed amount available to the application. [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API), [storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- ARCH-12 [o] Save format: versioned JSON envelope with gzip-compressed, base64-encoded canonical state and a SHA-256 integrity checksum.
  - Envelope: schema version, engine version, catalog/rule references, world ID, generation, parent generation, codec, checksum, and payload.
  - Use browser Compression/Decompression Streams in a worker; support is checked at startup. [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)
  - Checksum detects accidental corruption; it is not proof that a client-authored result is honest.
  - Export the envelope as a portable `.haeram-save.json` file; Flutter can decode the same format.
- ARCH-13 [o] Checkpoint writes use two slots and a last-step manifest update.
  - Build and validate the complete candidate checkpoint before touching the inactive slot.
  - Write the inactive slot; verify the stored candidate; update the manifest; then acknowledge the committed generation.
  - Keep the previously committed slot until a newer checkpoint commits successfully.
  - On quota/write errors retain the last committed save, preserve recoverable in-memory state, offer export/retry, and do not report success.
  - Autosave at settled fixture/period boundaries and committed personnel/economic decisions, not at animation frames; expose the last saved revision and any unsaved changes.
  - On load validate the manifest and selected slot; use the compatible previous checkpoint for recovery, explaining the recovered generation.
  - Missing/invalid manifests require deterministic validated-slot recovery; invalid saves are never replaced with a fresh world automatically.
- ARCH-14 [o] Storage and longevity must pass an early measurement gate.
  - Initial budget: at most 1.5 MiB per checkpoint and 3.5 MiB total application localStorage usage, conservatively accounting for key/value UTF-16 size.
  - Catch actual quota failures even when estimated usage is below budget; do not assume other applications or browser modes leave the full quota available.
  - Measure representative eight-country worlds at founding, a mid-career checkpoint, and 100 simulated seasons before polishing the complete UI.
  - A 100-season capacity claim requires a passing recorded benchmark.
  - If the budget fails, optimize encoding and settle the open history-detail policy; do not silently prune agreed history or substitute IndexedDB/cloud storage.
- ARCH-15 [o] Persist game facts and history, not rendering noise.
  - Persist current world state, settled fixtures, season standings/honors, meaningful club/personnel/economic decisions, and the player's club career records.
  - Use compact IDs, shared dictionaries, and aggregate rows; do not save React stores, event subscriptions, per-frame coordinates, or repeated whole-player objects.
  - Old pitch animation traces are not required for continuing a career; ordinary match and season facts remain distinct from optional replay detail.
  - Detailed NPC historical metric retention is open under →ARCH-25; existing facts may not be silently removed during updates or imports.
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
  - Future submission sends a minimal record: pseudonym, world/rule versions, country, founding year, initial-capital category, seasons, and score/honor summary; no full private save upload by default.
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
  - Vitest: deterministic engine, calendars, money, contract effects, manager-request outcomes, IDs, and migrations.
  - fast-check: seeded invariants for league/group capacities, fixture settlement, balance conservation, transitions, and save round trips.
  - Portable fixtures: command sequences and canonical expected facts consumed by the web engine now and the Dart engine later.
  - Playwright: founding → watch/advance → compare metrics → recruit/request tactics → save/reload → export/import; include quota, corruption, duplicate-tab, and worker-recovery cases.
  - Fixture data is synthetic and explicitly marked; tests do not claim the real catalogs are complete merely because a mock world runs.
- ARCH-22 [o] Scaffolding must provide these executable verification scripts.
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm run test:unit`
  - `pnpm run test:contract`
  - `pnpm run validate:catalogs`
  - `pnpm run build`
  - `pnpm run test:e2e`
  - `pnpm run benchmark`
  - `pnpm run verify`
  - `verify` runs type/lint/format, unit/contract tests, catalog validation, production build, and browser tests; benchmark artifacts are required at the storage and release gates.
  - Scaffolding implements the scripts; verification reports must identify actual executed commands and must not count planned scripts as passed checks.
- ARCH-23 [o] CI and release use a reproducible static build.
  - GitHub Actions: pinned toolchain → `pnpm install --frozen-lockfile` → install pinned Playwright browsers → `pnpm run verify` → retain test/build reports and `apps/web/dist`.
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
  | Persistence feasibility | Compact current world/history, codec, two-slot saves, migration/export | Eight-country fixtures and 100-season storage benchmark meet →ARCH-14; failures remain blocking for full UI polish/release and record the concrete unresolved limit |
  | Playable observation loop | Seeded founding, domestic fixtures, Canvas observation, statistics, reload | A new club can play a real engine-driven fixture and continue after reloading |
  | Full agreed web loop | Recruitment, manager personality/requests, business choices, historical economy, European competition eras, meaningful history | Changes affect engine facts; domestic/European schedules and financial records remain consistent |
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
  - Initial entry JavaScript + CSS: at most 250 KiB compressed, excluding lazy engine/catalog chunks; report all first-play transfer sizes separately.
  - Reference trace: pinned Chromium, 4x CPU slowdown, Fast 4G for cold loading, desktop and 390x844 mobile viewports.
  - UI feedback after controls: p95 below 100 ms during ordinary simulation; observed pitch rendering targets at least 30 FPS on the reference mobile viewport.
  - World initialization after a valid founding command: at most 5 seconds on the reference trace; present real generation progress while it runs.
  - Benchmark reports record tool/browser versions, dataset size, world seed, save sizes, match/season throughput, and long-run memory; these are targets to measure, not invented results.

## flow
- Planning: ARCH → gameplay domain SSOTs → create-task → implementation.
- Local play: UI command → validated bridge → engine worker → domain facts/projections → UI statistics/Canvas.
- Save: safe game boundary → candidate envelope/codec/checksum → inactive localStorage slot → verification → manifest switch → committed acknowledgment.
- Recovery: startup → capability check → save validation → load(current|previous compatible|export/recovery) → worker initialization.
- Release: locked install → verification → static build → preview smoke checks → stable production deployment → compatible rollback path.
- Future mobile: portable contracts/catalogs/fixtures → Dart engine parity → Flutter views/persistence → commercial-release validation.

## constraints
- The web demo's primary save store is localStorage; alternate storage or cloud synchronization is not an implicit fallback.
- Animation, network availability, frontend render count, and device time must not redefine game results.
- LocalStorage capacity and complete catalog coverage require measured/validated evidence before release claims.
- A long-career capacity claim requires benchmark evidence; a passing UI demonstration is insufficient.
- Never label planned scripts, unimplemented milestones, mock catalogs, or drafted backend infrastructure as completed functionality.
- Current product material: `spec/ideation/club-history-reboot.md`; human PRD: `docs/PRD.md` (repository-relative paths).

## chg
- r4 261009 ARCH-2✎ npm workspaces→pnpm workspaces with pnpm pinned by packageManager; ARCH-22✎ verify commands npm run→pnpm run; ARCH-23✎ CI install npm ci→pnpm install --frozen-lockfile
- r3 261007 ARCH-23✎ static provider Cloudflare Pages→Netlify; ARCH-27✎ account Cloudflare→Netlify and repository unspecified→hetarho/haeram-soccer
- r2 261007 ARCH-25✎ unresolved NPC retention→HIST archive tiers; ARCH-9✎ numeric policy owner MONEY→ECON
- r1 261007 initial
