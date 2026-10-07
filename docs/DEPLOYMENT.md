# Netlify deployment

The web game is a static Vite build. Repository-root `netlify.toml` pins Node 24.12.0, runs `npm ci && npm run build` and publishes `apps/web/dist`. No serverless functions, database or secrets are needed for local game play. Netlify accepts repository build configuration in this file. [Netlify configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Connect the repository

1. Push this committed project to `https://github.com/hetarho/haeram-soccer.git`, the production repository.
2. Protect `main`: require the **Verify web game / verify** check and reviewed merges; prevent unverified direct pushes.
3. Import that repository into a Netlify project. Keep the base at the repository root and let `netlify.toml` supply build/output settings.
4. Set `main` as the production branch and enable deploy previews for pull requests. Review deployments must keep separate origins.
5. Choose a stable HTTPS production domain before sharing a game that creates saves. Export/import is required when moving between localhost, previews, `netlify.app` or a custom domain.
6. Run founding, watching, management, reload, import/export and multi-tab smoke checks on the actual deployed HTTPS URL before public announcement.

A Netlify project/account and hostname are configuration inputs still to be supplied. This repository prepares deployment; it does not claim an externally published URL.

## Routes, assets and headers

`apps/web/public/_redirects` rewrites the eight application paths to `index.html` with status 200. Asset paths remain physical files. Explicit application routes plus a real `404.html` make missing JavaScript/worker assets return 404 instead of HTML masquerading as JavaScript. The URL remains the requested application path. [Netlify rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

`_headers` revalidates the entry/application routes and gives content-hashed `/assets/*` one-year immutable caching. Cache directives occupy separate rules so they do not combine `no-cache` and `immutable`. Global headers allow same-origin module workers, disallow framing/object execution and keep scripts same-origin. Zod uses its interpreter to avoid CSP eval probes. Netlify reads these files from the publish directory. [Netlify headers](https://docs.netlify.com/manage/routing/headers/).

Do not add another wildcard SPA rule, serverless routing or cache layer without rerunning deep-link, missing-asset and worker checks. Ordinary HTTP caching is not a guaranteed offline startup/service worker.

## Local release rehearsal

```sh
npm run build
PREVIEW_BUILD=1 npm run test:e2e
```

Port 4173 must be available for the production preview test server. `npm run preview` serves the same files and route/header policy locally; it does not emulate the Netlify CDN or account configuration. The actual Netlify origin still needs a deployment smoke check.

## Rollback

Keep previous successful deploys and downloadable save examples. Re-publish a compatible earlier Netlify deploy when needed, without clearing browser storage. Test current v1 save reload and explicit rejection/export of unsupported versions before changing engine or catalog versions. A code rollback does not migrate newer saves automatically. Netlify provides deploy management and re-publishing controls. [Manage deploys](https://docs.netlify.com/deploy/manage-deploys/manage-deploys/).

Retain the referenced catalog version or write and test an explicit migration. Change origin only with a clear export/import instruction.
