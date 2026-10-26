# Haeram Football Archives

A Korean, account-free football club growing game. Found a fictional club in 1950, prepare the
squad, observe matches and preserve the club's history. Gameplay and saves run locally in the
browser; no API keys, database or login are required.

Use the Node version in [.node-version](.node-version) and the pnpm version pinned by
`packageManager` in [package.json](package.json).

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

The development server uses <http://localhost:19500>. To serve the static production build at
<http://localhost:4173>:

```sh
pnpm run build
pnpm run preview
```

HTTPS or localhost is required for browser saving and exclusive-tab ownership. Export a
`.haeram-save.json` file to back up a career or move it between browsers or origins.

Current product rules and architecture are maintained in [spec/ssot/](spec/ssot/), with the
[architecture](spec/ssot/ARCH.md) defining dependency boundaries, deployment and verification.
The [Korean project narrative](spec/NARRATIVE.md) provides an overview; [spec/STATE.md](spec/STATE.md)
records current work, and completed task files retain implementation history.

[artifacts/](artifacts/README.md) holds retained design concepts, screenshots, benchmark outputs
and verification evidence. It is not another specification. Disposable logs, browser profiles
and caches belong in ignored `.tmp/`. Editable artwork and deployed resources remain under
`apps/web/design/` and `apps/web/public/`.

Verification commands and their task, batch and CI scopes follow ARCH-22/23/30:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run validate:catalogs
pnpm run validate:presentation
```

Install the pinned Playwright browsers with `pnpm exec playwright install --with-deps` before a
batch or full verification. `pnpm run verify` runs the complete local check sequence;
`pnpm run verify:batch` uses Chromium for its browser stage. Storage and first-play measurements
run at the relevant gates with `pnpm run benchmark` and `pnpm run benchmark:browser`; their
reports are written under `artifacts/benchmarks/`.

The installed spec-management skills are project files, not an application dependency:

```sh
npx -y haeram-spec-creator check
npx -y haeram-spec-creator lint
```
