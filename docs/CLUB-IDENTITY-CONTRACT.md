# Club identity and kits — implementation contract

This document fixes the engineering interfaces used by the club-identity tasks. Product policy remains in KIT r2, WEB r91 and SAVE-20–22. This is a plan for the implementation, not a claim that these interfaces already exist.

The grid-engine plan owns T200–T233, rules 4.0.0, player/match counters, playback timing and the SAVE r48 storage changes. The identity batch is T234–T255 and starts after T233. It extends that resulting code; it does not implement another match engine, storage layout or rules reset. Follow the current SAVE-4 limits and repository constants rather than copying an older budget into these tasks.

## 1. Ownership and reading order

- Read the owning task, its cited SSOT decisions and the named sections here. Task acceptance defines that task's exit; do not implement later tasks to make a local test pass.
- `packages/contracts/src/identity.ts`: vocabulary, DTO types, existing crest palette/component constants and the six ready-made crest definitions. No React, DOM, engine imports or random draws.
- `packages/contracts/src/identitySchema.ts`: reusable strict Zod schemas for the vocabulary above. No default generation during parsing.
- `packages/engine/src/identity-legacy.ts`: the previous crest assignment and colour maths, preserved exactly for compatible-career adoption.
- `packages/engine/src/club-identity.ts`: seeded defaults, lookup and missing-only identity installation.
- `packages/engine/src/kit-patterns.ts`: normalized pattern polygons and colour sampling; shared by selection and both visual previews.
- `packages/engine/src/kit-selection.ts`: pure automatic/manual pair selection, warnings and goalkeeper colours.
- `packages/engine/src/identity-operations.ts`: the two owner commands; engine dispatch owns their one revision increment.
- `packages/engine/src/match-appearance.ts`: immutable appearance snapshots attached at the existing own-match settlement boundary.
- `apps/web/src/adapters/identityPacking.ts`: bounded, lossless appearance dictionary streams.
- `apps/web/src/ui/clubIdentityDraft.ts`: pure editor reducer. `ClubIdentityEditor.tsx` is a controlled editor; its caller owns persistence and draft lifetime.
- `apps/web/src/ui/kitPainting.ts`: cached Canvas shirt sprites; `KitSwatch.tsx` and `KitPitchPreview.tsx` use the same drawing functions.
- `apps/web/src/ui/ClubDesignView.tsx`: career editor entry; `FixtureKitSelector.tsx`: next-fixture selection.

Keep new modules small and import their leaf exports. Do not import the engine barrel into the founding/editor entry or duplicate the legacy generator inside React.

## 2. DTOs and their exact meaning

Export these from the new contract leaf and re-export its types from the existing contract entry points:

```ts
type IdentityColours = [string] | [string, string] | [string, string, string];
type KitRole = 'home' | 'away' | 'third';
type ShirtPattern = 'plain' | 'stripes' | 'hoops' | 'halves' |
  'band' | 'sash' | 'checks' | 'chevron';
interface CrestDesign {
  shape: CrestShape;
  pattern: CrestPattern;
  emblem: CrestEmblem;
  primary: string;
  secondary?: string;
  accent?: string;
}
interface ShirtDesign {
  pattern: ShirtPattern;
  primary: string;
  secondary?: string;
  trim?: string;
}
interface ClubIdentity {
  version: 1;
  colours: IdentityColours;
  crest: CrestDesign;
  kits: Record<KitRole, ShirtDesign>;
}
interface FixtureKitChoice { fixtureId: string; role: KitRole }
interface AppearanceSide {
  club: string;
  crest: CrestDesign;
  role: KitRole;
  shirt: ShirtDesign;
  goalkeeper: string;
}
type KitWarning = 'teams' | 'grass' | 'goalkeepers';
interface MatchAppearance {
  version: 1;
  sides: [AppearanceSide, AppearanceSide]; // home, away
  warnings: KitWarning[];
}
```

- Colours are existing `#RRGGBB` strings, exactly seven characters, with either hex case accepted. Preserve stored spelling; use normalized colour keys only inside calculations. No alpha, named CSS colours, URLs or executable SVG input.
- Move the existing 24-colour palette, six shape IDs, ten crest-pattern IDs and twenty emblem IDs from `ui/crests.ts` without changing their order or spelling. `CrestShape`, `CrestPattern` and `CrestEmblem` come from these constants. Shirt patterns are a separate eight-value vocabulary.
- The primary colour is always configured. A patterned shirt requires an explicit secondary field; `plain` omits it. Optional `trim` is independent. Thus a plain shirt has one or two configured colours, and a patterned shirt has two or three. Identical colour values are valid; the preview may disclose an indistinct pattern, never replace a chosen colour.
- Crest secondary/accent are optional independently. Missing secondary is negative space, not an automatically generated colour. Emblem uses accent, else secondary, else negative space; existing neutral outer outlines remain fixed and disclosed in the editor.
- Add optional `Club.identity`, optional `World.kitChoice`, optional `Founding.identity` and optional `MatchRecord.appearance`. Keep `World.schema === 1` and the worker protocol at 1. Missing identity and missing appearance are valid compatible historical data, not permission to synthesize historical snapshots.
- Keep `Founding.color` for existing callers. An explicit founding identity must have `identity.colours[0] === input.color`; the new UI sends the first draft representative colour as `color`. `Club.color` follows the own club's representative primary after an explicit owner edit; do not rewrite other clubs' existing `color` values during adoption.
- `MatchPlayback` uses `record.appearance`; do not duplicate the snapshot at another playback property or store movement frames/squads to save the colours.
- Strict schemas reject unknown nested keys, unknown versions/enums, missing home/away/third, empty/four-colour palettes, invalid colour strings and invalid warnings. `validateWorld` also checks appearance side IDs equal that record's home/away IDs. A persisted choice references a known, unplayed own fixture in the current season across league/cups/Europe; it need not remain the earliest fixture after a new cup draw.
- Export `assertIdentityFormatVersions(value: unknown): void` and `assertAppearanceFormatVersion(value: unknown): void` from `identitySchema.ts`. The former scans only World-shaped `clubs[*].identity` and `ownMatches[*].appearance`; cap scans at the current schema limits (1,000 clubs, 100,000 records), rejecting excessive dimensions before scanning. The latter checks one appearance's `version`. A positive integer version greater than 1 throws `SaveCompatibilityError`; missing/invalid/current markers proceed to strict validation. These helpers neither validate the complete World nor install defaults.

## 3. Defaults and exact legacy preservation

Expose leaf APIs:

```ts
legacyCrestMap(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>): Map<string, LegacyCrest>
createIdentityDraft(input: Pick<Founding, 'country' | 'seed' | 'color'>): ClubIdentity
identityOf(w: Pick<World, 'seed' | 'clubs' | 'playerClub'>, clubId: string): ClubIdentity
installMissingIdentities(w: World): boolean
```

- `LegacyCrest` is the old crest shape with required `primary` and `secondary`. Extract the exact old `crestMap` algorithm, including own-club-first probing, RGB distance, contrast and custom-colour handling. Freeze literal expected assignments for representative seeds before changing new-world generation. Do not copy an engine import of a UI module.
- `identityOf` returns an existing identity, otherwise a pure legacy-preserving default; it does not install or mutate anything. Cache only safe legacy lookups, and consult an explicit club identity before any legacy cache.
- `installMissingIdentities` computes the complete legacy map **before** changing any club, then installs only absent identities. It returns whether anything changed. Existing identities, club array order, old `color` values, sporting state and earlier `MatchRecord.appearance` absence stay unchanged. A second call is a no-op.
- For a missing identity, set `colours` to `[club.color, legacyCrest.secondary]`, copy its exact legacy crest, and derive the three default shirts from that representative pair. The crest palette is independently configurable, so a legacy NPC crest primary need not equal its stored `Club.color`. Keep both; do not silently replace either existing value. `identityOf` uses this same construction without writing it.
- Existing careers use the exact old visible crest. New own-club drafts choose one of six templates reproducibly from `hash(seed + ':identity-template:' + country) % 6` and use the requested primary plus the legacy own secondary as their two initial representative colours. The own stable ID is `${country}:club`.
- Six preset compositions in order: `(shield,stripes,star)`, `(round,plain,ball)`, `(french,sash,crown)`, `(badge,halves,anchor)`, `(diamond,chevron,bolt)`, `(crown,band,tree)`. Their display labels name shape and symbol in Korean. Selecting a preset in the editor copies its parts with the current home/away shirt bases as crest colours; it does not reset the stored palette or shirts.
- Default home: representative primary/secondary, `stripes`. Default away: `plain`, white primary and representative primary trim. Default third: `plain`, navy `#0b1f44` primary and representative secondary trim. All three complete drafts are previewed and editable before founding. These defaults use no sporting PRNG draws.
- `createWorld` installs identities after `prepareSeason` has added all initial representatives, then applies the explicit own draft if provided. Reject an invalid explicit identity before creating/altering a canonical world. Ensure later clubs created by `ensureRepresentatives` receive missing-only defaults without changing any prior identity.

## 4. Shared pattern geometry and selection

Export `shirtPatternRegions(pattern): readonly Polygon[]` and `shirtColourAt(shirt, x, y): string` from `kit-patterns.ts`; normalized box coordinates are 0–1. `Polygon` is an array of `[number, number]` vertices. Main field fills the box; polygons use the explicit secondary. Region conventions:

- plain: no secondary polygons;
- stripes: vertical rectangles x=0.2–0.4 and 0.6–0.8;
- hoops: horizontal rectangles y=0.2–0.4 and 0.6–0.8;
- halves: x=0.5–1;
- band: y=0.35–0.6;
- sash: polygon `(0,0),(0.2,0),(1,0.8),(1,1),(0.8,1),(0,0.2)`;
- checks: alternating filled cells in a 3×3 grid, starting filled at top left;
- chevron: polygon `(0,0.25),(0.5,0.55),(1,0.25),(1,0.45),(0.5,0.75),(0,0.45)`.

The actual marker is a circle inscribed in this box. Optional trim fills the inside border with normalized radius 0.84–1 (radius measured from box centre with circle radius 0.5). Use the same field, polygons, clipping and trim in sampling and drawing. No textures, external assets or new graphics library.

```ts
interface KitSelection {
  roles: [KitRole, KitRole];
  shirts: [ShirtDesign, ShirtDesign];
  goalkeepers: [string, string];
  warnings: KitWarning[];
}
selectMatchKits(home: ClubIdentity, away: ClubIdentity,
  forced?: { side: 0 | 1; role: KitRole }): KitSelection
appearanceForFixture(w: World, fixture: Fixture): MatchAppearance
```

- Evaluate the nine saved role pairs; a manual role constrains only that side, so the opponent may still use its best saved alternative. Do not generate another outfield shirt or modify any saved design.
- Use fixed 16×16 cell-centre samples inside the marker circle to form each shirt's visible-colour weights. For colours A and B, use the existing `colourDistance` helper. Pair separation is the mean of (A's weighted nearest distance to a visible colour of B) and the reverse. The same red/white palette on differently named patterns must not pass merely because their primary colour differs or the pattern names differ.
- A pair warns `teams` when separation <150. A shirt warns `grass` when weighted contrast against the existing grass `#1c543e` is <1.5. Rank pairs by: no warning first, greater pair separation, greater minimum grass contrast, then stable role order home/away/third for each side. No time, revision counter, score, randomness or object insertion order participates.
- Select home then away goalkeeper colours by maximizing their minimum distance from both outfield visible-colour sets, grass and the earlier chosen keeper. Candidates are the existing palette followed by the RGB cube with channels 0/51/102/153/204/255, deduplicated in that order. Use the earliest candidate on an exact tie. Return `goalkeepers` warning if the best available minimum distance is <150; retain the best available automatic choice without a new blocking event.
- The returned shirt objects and `appearanceForFixture` snapshot are copies. Keeper selection can use colours outside the club palette; outfield selection cannot. Manual warnings are informative and allow confirmation. A preparation recommendation uses the unrestricted automatic selection, separate from its current forced preview.
- These are deterministic engineering thresholds, not a claim of a universal perceptual standard. Test the named counterexamples and actual phone-size samples; do not weaken checks just to make a chosen palette pass.

## 5. Commands and settlement boundary

Extend the existing `Command` union and request schema only in the corresponding command tasks:

```ts
{ type: 'club-identity'; identity: ClubIdentity }
{ type: 'match-kit'; fixtureId: string; role: KitRole | null }
```

- Validate the entire payload before writing. The first command implicitly targets `w.playerClub`, replaces its identity by a copy and synchronizes only its legacy `color` primary. No NPC target parameter exists. `operate` performs its existing one revision increment; do not increment in a leaf handler too.
- The second command must match `nextOwnFixture(w).id` at execution time and be unplayed. `null` removes that fixture's choice and restores automatic selection; a named role stores `World.kitChoice`. A stale/missing/settled/NPC-only target throws before any mutation. Reject an empty/fourth role at the bridge.
- `GameClient.command` already queues requests, carries the current revision and saves owner decisions; use it. Do not add another writer, progression mode or acknowledgement. Reject stale revisions and duplicate request effects through the existing host path.
- On the existing shared `recordMatch` boundary, after the duplicate-own-match guard and before storing/capturing an own result, set `playback.record.appearance = appearanceForFixture(w, record)` if it is absent. This covers observed and unobserved league/cup/continental own matches without changing either sporting path. The selector does not inspect the result score.
- Consume a stored kit choice only when its named fixture settles. Reprocessing a settled record never replaces its appearance or consumes another fixture's choice. Do not backfill old appearances during adoption, schema validation, archive reading or rendering.
- The existing shallow `saved = { ...m, players: ... }` preserves the captured appearance; later edits replace current identities instead of mutating captured objects. Assertions must cover both the returned live playback and saved record.
- Current clock ticks, automatic/manual progression, time away and sporting PRNG streams do not read these new commands or appearance fields. Tests compare sporting projections excluding only cosmetic fields, command receipts and revision changes.

## 6. Checkpoint format and supported-career activation

- Write checkpoint **envelope schema 2** once this feature is installed; accept envelope schemas 1 and 2. Core `World.schema` and worker protocol stay 1. This separate container version makes an older binary reject a new design-bearing save instead of silently discarding unknown identity fields. Unknown envelope schemas remain typed compatibility errors.
- Do not change `CURRENT_ENGINE_VERSION`, accepted gameplay versions, legacy reset ownership, catalog pins, codecs, compression parameters or SAVE-4 budgets in this batch. Older envelope 1 is not permission to accept older gameplay rules. The grid plan owns the rules-4.0.0 boundary and current storage layout.
- `decode` and schema parsing preserve absent identities. Extend the existing writer activation path in `EngineHost.execute('inspect')`: after accepted decode/rules handling, clone and install missing identities only for `activate && upgrade`. Increment revision once if identity installation is the only upgrade; do not increment again if the existing rules/catalog upgrade already did. Read-only activation and inspection perform no installation or disk write.
- Include the identity-only change in the host's existing `upgraded` result so `GameClient.load` saves through its existing candidate-validation/commit flow. Repeated activation is a no-op; a failed candidate write preserves prior recoverable data and export access.
- The raw metadata inspector must understand envelope 2 but never reset an unknown future envelope as legacy gameplay. Existing codec/checksum and engine/catalog validation are unchanged.
- Future positive identity, appearance or appearance-side-channel versions are typed `SaveCompatibilityError`s, not corruption that permits fallback over a newer career. Add a bounded version preflight before ordinary schema parsing; malformed current-version values still fail validation. Test preservation of the newer raw save when a valid older checkpoint also exists.
- After checksum verification and bounded JSON decoding, `readCheckpoint` runs `assertIdentityFormatVersions` on the expanded World payload, or on `payload.world` for compact1, before calling `unpack`. `validateWorld` also runs the preflight before Zod. The appearance-stream reader checks its own container version and calls `assertAppearanceFormatVersion` on each bounded dictionary value before parsing it. Contracts do not import or understand the adapter's compact format.
- `pack()` currently removes `ownMatches` and reconstructs them from columns. Add an optional `appearances` side channel to `Packed`:

```ts
{ version: 1; values: MatchAppearance[]; refs: number[] }
```

- `refs.length === original ownMatches.length`; 0 means absent, n>0 means `values[n-1]`. Intern snapshots by existing `canonical(snapshot)` in first-occurrence order; preserve literal colour spelling. Keep `Club.identity` and `World.kitChoice` in the packed world's ordinary fields.
- Omit the side channel when every appearance is absent. Read old compact1 payloads without it. Before allocating expanded arrays, check version, ref count, safe integer ranges and value count (at most 100,000 and never more than the record count); validate every dictionary value through the strict snapshot schema. Reject invalid refs, future metadata, duplicate ambiguous sources or side IDs inconsistent with the reconstructed match. Clone dictionary values per expanded record to avoid mutable aliases.
- `unpack(pack(world))`, `decode(encode(world))`, slot switching and export/import must preserve complete canonical identity/appearance data. Update `docs/SAVE-FORMAT.md` for envelope 2 and this bounded side channel; do not duplicate the whole world's clubs into every match or save movement frames.

## 7. UI and draft contracts

```ts
interface ClubIdentityEditorProps {
  value: ClubIdentity;
  onChange(value: ClubIdentity): void;
  readonly?: boolean;
  // Caller renders its commit/cancel controls and owns their errors.
}
interface KitPitchPreviewProps {
  appearance: MatchAppearance;
  labels: [string, string];
}
```

- The current editor exposes exactly three colours, labelled 홈 (home), 어웨이 (away) and 세컨 (third), sourced from `kits[role].primary`. A `kit-colour` action sets that base and links the whole draft using `linkedIdentityColours`: `colours` becomes the three shirt bases; the crest field uses home and its secondary/emblem use away, with no accent; home shirt patterns use away and away/third patterns use home. Existing trim, when present, follows that same alternate colour. Preserve patterns and omit secondary on plain shirts. There are no independent region, add/remove or palette-reuse controls. The identity-v1 schema and legacy fixture actions remain readable; opening an existing career never changes its applied design.
- Founding prepares its initial design once with `linkedIdentityColours(createIdentityDraft(...))`. Preset, component and random crest actions keep shirt designs and the stored palette, and colour the crest from the current home/away bases. Randomisation draws uniformly from all catalogue compositions except the current one, uses only local presentation randomness, and opens the composer with the result selected. Read-only mode disables it along with colour/pattern edits. The fixed neutral crest outline remains disclosed.
- The editor renders six presets, a 랜덤 action and optional 직접 꾸미기; shows three named shirt previews with eight pattern choices; uses labelled colour inputs and visible selected states. All previews use the exact current draft. No hidden random colours, uploads, sponsors, socks or goalkeeper editor.
- Parent wrappers hold a deep entry snapshot, so explicit Cancel restores that snapshot. Career drafts live in `useTaskState(world.id, 'club-identity-draft', ...)`; identity apply errors retain the draft. Capture world ID on entry and refuse a successful apply into another slot. Compare the entry identity with the latest applied identity for stale-draft protection, not the world revision/date, since ordinary automatic days may advance while editing. If that identity changed, show a stale-draft message and an explicit reload-current action; do not overwrite newer applied work silently.
- Founding owns a local draft keyed by its slot/session. Open the editor lazily from a compact crest summary. Returning from the dialog keeps the draft; leaving founding for another slot/new-game session clears it. Seed/country changes do not silently reset an existing identity draft; initialize defaults once per founding session. Default/preset/design changes never silently change seed, difficulty or club direction. `Founding.identity` is the exact confirmed draft.
- Add the career tab `['identity', '구단 디자인']` to `BUSINESS_TABS`; `/direction?view=identity` opens it. Existing strategy/build/finance/sponsor routes and older routes retain meaning. Reuse the lazy business boundary rather than loading the editor into every page.
- `FixtureKitSelector` belongs to `StrategyPanel` preparation; it is independent of tactic and lineup apply. Use the settled `nextOwnFixture` after `client.whenIdle()`, show the fixture ID/teams, a forced draft preview, unrestricted recommendation, warning and explicit confirm/automatic action. Recheck fixture context after errors. No selector for a settled or historical match.
- `KitPitchPreview` is passive Canvas rendering from an appearance DTO. The editor's light/dark opponent examples are fixed local identity fixtures, labelled 미리보기; they never call `createWorld`, `simulateMatch`, commands, persistence or progression. A preview role change is UI state only.
- `kitPainting.ts` caches background shirt sprites by complete style, pixel size and DPR. Draw pattern/trim once into an offscreen Canvas per cache entry, then blit it and draw the existing readable number and team outline. Use the same painter for large samples, small preview markers and `Pitch`; do not construct a new texture/Path2D for every player on every frame. Bound the cache (e.g. 128 sprites, FIFO eviction).
- `Pitch` resolves crests, shirts and goalkeeper colours from `p.record.appearance`, memoized by that record, not current world identities. Determine the actual keeper from the playback player/position, not slot zero or an assumed eleven-player permanent roster after the grid substitution work. Preserve engine-driven positions, selection rings, numbers, interpolation and 1.9:1 pitch bounds.
- A legacy record without appearance shows 유니폼 미기록 and generic labelled home/away markers, with no claim that current designs are historical. Use a neutral placeholder crest if its old crest was not recorded. Current HUD, standings and slot cards continue to show current identities.
- `MatchCharts` may lift/recolour analytical line colours for contrast, but legends retain actual kit swatches, side names and distinct line/dash cues. Chart accessibility must never repaint the players or mutate a snapshot.
- Extend slot-summary validation to keep one-/two-/three-colour crests, preserve existing two-colour summaries and skip malformed entries. Current slot cards must agree with current applied crests after edits and reload.

## 8. Verification and completion

- Each task lists exact new/affected test files, concrete cases and a small command. Use `pnpm exec vitest run ...` directly; do not add an extra `--` to a pnpm script and accidentally run the whole suite. Typecheck after each public type or wiring change.
- The current Vitest include patterns discover `.test.ts`, not `.test.tsx`. Keep the server-render tests as `.test.ts` and use React `createElement` with `renderToStaticMarkup`; no test-runner configuration change or DOM environment is needed. Use real browser tests for interaction and Canvas pixels.
- Browser task commands use `pnpm run build` followed by `PREVIEW_BUILD=1 pnpm exec playwright test --project=chromium <spec>`; final integration runs the added specs in all three configured browser families. Do not fabricate DOM fields solely to make tests pass.
- Scenario fixtures must cover: explicit custom colour spelling, one-colour crest, patterned shirts sharing a primary, shared red/white palettes, all-pairs clash, dark/green shirts on grass, automatic keepers, own club playing home and away, cups/Europe, stale fixture, duplicate receipt, read-only view, failed apply/save, slot isolation and legacy missing appearance.
- Codec fixtures mix absent/present snapshots, recurring designs, a crest edit between two matches and a chosen shirt before save. Exact canonical equality and invalid side-channel rejection are mandatory; a test that only checks a header or byte count is insufficient.
- UI evidence includes 360×740 and 390×844, actual Canvas pattern pixels (not only a coloured legend), keyboard focus and cancel/apply/no-leak journeys. Reuse the existing fixture helpers; wait for savedRevision/whenSaved, not arbitrary sleeps.
- Full final validation runs `pnpm run verify`, the unchanged complete baseline/active-management century benchmarks including active round 23, and `pnpm run benchmark:browser`. Record final-source build/fingerprint, actual codec sizes, round-trip equality and the existing p95/entry/FPS budgets. No shortened career, raised budget, history pruning or renderer-only success substitutes for this gate.
- The final pushed source also passes the existing CI checks, browser shards and benchmark job; retain their run IDs/results. Planning-time document checks do not count as implementation or release evidence.
- Persist technical changes to these interfaces here as well as in their code and task contract; future workers must not have to rediscover a public schema from an archived task.
- T255's cosmetic workload is `tests/fixtures/identity-workload.ts` (`identityWorkload()`: `edit(w, n)` sends one real `club-identity` command at each active-management season start, `chooseKit(w)` one real `match-kit` command for the next own fixture, plus appearance and pending-choice assertions); it is a benchmark source-fingerprint input. `pnpm run benchmark` writes `docs/benchmarks/club-identity-final.json` (storage report and `identityWorkload` evidence) only when storage passes, and `pnpm run benchmark:browser` refuses to run unless that file carries the same source fingerprint, then adds its browser measurements, `observedKits` and `patternRendering`.

## 9. Task map and hand-off

All tasks start as `todo`; this document records planned interfaces, not implementation or passing tests. Follow task dependencies and ascending ID among ready tasks for a single implementation session. There are no parallel lanes. Each task has its own file/case list and runnable targeted verification; full verification belongs to T255. Read the result of T233 before starting T234, because the grid renderer, codec and storage protocol are prerequisites.

| Task | Deliverable | Direct prerequisite | Contract section |
|---|---|---|---|
| [T234](../spec/tasks/T234.identity-contracts-and-validation.md) | Strict DTOs and bounded version guards | T233 | 1–2 |
| [T235](../spec/tasks/T235.identity-checkpoint-envelope-two.md) | Envelope 2 writer, 1/2 readers and future-data protection | T234 | 6 |
| [T236](../spec/tasks/T236.legacy-crest-kernel.md) | Exact legacy crest generator extraction | T234 | 3 |
| [T237](../spec/tasks/T237.identity-defaults-and-world-generation.md) | Stable complete defaults and exact founding input | T235 T236 | 2–3 |
| [T238](../spec/tasks/T238.shirt-pattern-geometry.md) | Eight shared pattern geometries | T234 | 4 |
| [T239](../spec/tasks/T239.deterministic-kit-selection.md) | Automatic/manual pair selection and keeper colours | T238 T237 | 4 |
| [T240](../spec/tasks/T240.club-identity-owner-command.md) | Atomic own-club design command | T237 T235 | 5 |
| [T241](../spec/tasks/T241.fixture-kit-owner-command.md) | Named next-fixture role command | T240 T239 | 2, 5 |
| [T242](../spec/tasks/T242.settled-match-appearance.md) | Immutable actual appearance at settlement | T241 T239 | 5 |
| [T243](../spec/tasks/T243.lossless-identity-appearance-packing.md) | Lossless bounded appearance stream | T242 T235 | 6 |
| [T244](../spec/tasks/T244.supported-career-identity-activation.md) | Writer-only missing-data adoption | T243 T237 T236 | 3, 6 |
| [T245](../spec/tasks/T245.editable-crest-rendering-and-slot-summary.md) | One/three-colour SVGs and current slot summaries | T237 T236 | 2–3, 7 |
| [T246](../spec/tasks/T246.shared-shirt-sprite-painter.md) | Bounded shared Canvas painter | T238 | 4, 7 |
| [T247](../spec/tasks/T247.club-identity-draft-reducer.md) | Pure isolated draft actions | T237 | 7 |
| [T248](../spec/tasks/T248.controlled-club-identity-editor.md) | Controlled crest/shirt editor | T245 T246 T247 | 7 |
| [T249](../spec/tasks/T249.identity-pitch-preview.md) | Passive grass preview with actual pattern scale | T239 T246 T248 | 4, 7 |
| [T250](../spec/tasks/T250.founding-identity-customisation.md) | Founding draft, cancel and exact confirmation | T244 T249 | 3, 7 |
| [T251](../spec/tasks/T251.career-club-design-workflow.md) | Career tab, retained draft and explicit apply | T240 T250 | 7 |
| [T252](../spec/tasks/T252.pre-match-shirt-selection.md) | Fixture-specific preview/confirm/automatic UI | T241 T249 | 4–5, 7 |
| [T253](../spec/tasks/T253.recorded-kits-in-match-observation.md) | Recorded shirts, keepers and crests in real playback | T242 T245 T246 T252 | 5, 7 |
| [T254](../spec/tasks/T254.identity-browser-persistence-and-recovery.md) | Export/import/slots/read-only/failure journeys | T251 T253 T243 T244 | 8 |
| [T255](../spec/tasks/T255.identity-final-integration-and-capacity.md) | Complete release, century capacity and browser budgets | T254 | 8 |

T242 deliberately runs engine tests only: T243 adds the appearance codec and then regenerates the portable golden and runs contract checks. Do not weaken round-trip equality or invent a codec inside T242 to skip that hand-off. Browser helper fixtures may be created by the first consuming UI task and shared when T254 consolidates cross-feature journeys; helpers belong under tests, never in a shipped diagnostic route.

| Product policy | Main tasks proving it |
|---|---|
| KIT-1/4/14 complete identity, 1–3 colours, six crests and three initial shirts | T234 T237 T247 T248 T250 |
| KIT-2/3/5 crest parts, shirt-only scope and eight patterns | T236 T238 T245 T246 T248 |
| KIT-6/7/8 automatic selection, warned manual choice, automatic keepers | T239 T241 T242 T249 T252 T253 |
| KIT-9/10 explicit career apply and selected-shirt palette reuse | T240 T247 T251 |
| KIT-11/15 stable opponents and compatible-career preservation | T236 T237 T244 T245 T254 |
| KIT-12 current edits and frozen actual appearance | T242 T243 T251 T253 T254 |
| KIT-13 cosmetic neutrality | T237 T239 T240 T241 T242 T255 |
| KIT-16 scope boundaries | T248 T255 |
| WEB-2/15 founding; WEB-39/71 career tab | T250 T251 |
| WEB-49/50 crests and actual match shirts | T245 T253 |
| WEB-86/87/88 shared editor, real-scale preview, fixture selector | T247 T248 T249 T250 T251 T252 |
| SAVE-20 round-trip designs and pending selection | T234 T235 T237 T240 T241 T243 T254 |
| SAVE-21 supported writer adoption; SAVE-22 historical appearance | T235 T242 T243 T244 T253 T254 |
| Existing storage/performance/verification budgets | T235 T243 T254 T255 |
