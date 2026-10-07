# Flutter and optional hall-of-fame plan

The web demo keeps game state local. The next product gates concern native mobile and an optional public ranking; they do not add backend requirements to web gameplay.

## Flutter

Port the pure engine to Dart and implement Flutter views/persistence. Reuse versioned country/CPI data, SSOT rules, stable UTF-16 IDs, unsigned 32-bit seeded arithmetic, decimal-string minor-unit money, half-even rational rounding and portable golden facts. TypeScript/React are reference implementations, not directly reusable Dart UI or engine code.

Run the four synthetic scenarios in `tests/fixtures/portable-v1.json` against Dart. Compare exact money, match/player counters, tactical outcomes, currency transitions, European opponents, season records and winners. Treat floating attribute growth/serialization deliberately before declaring complete save/engine parity. The save envelope codec is documented in `docs/SAVE-FORMAT.md`; native storage can use app-local files/database behind that same explicit import/export contract.

After parity: native responsive screens, interruptions/resume, packaging/signing, accessibility, store requirements and a separately agreed commercial plan. No Flutter scaffold or store submission is part of this web release.

## Hall of fame

`packages/contracts/src/hall-of-fame.ts` defines a disabled feature flag and repository/submission contract. It installs no Supabase SDK and sends nothing.

Later agree score formula, country/year/capital categories, pseudonym visibility, ownership/deletion and abuse policy. Use Supabase Auth, a validating Edge Function and RLS. Send only a summary unless the player explicitly opts into a verification/replay upload. Service-role credentials stay server-side. A checksum or RLS cannot prove honest local gameplay: mark unverified submissions as self-reported. Ranking outages must not block local saves or play.

Future architecture revisions and tasks own those implementations. See ARCH-19, ARCH-20 and the open score-policy decision ARCH-26.
