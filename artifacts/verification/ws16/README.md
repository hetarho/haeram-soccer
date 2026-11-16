# Wartime save regression evidence

These are successful coordinator checks of immutable source `b895fb01b1d0b04604fbbdc7b123ed1c0f420aed` (engine 0.8.5), before the final shared candidate. They do not claim that the later 0.8.6 or combined candidate has passed its complete batch.

- `focused-wartime-check.json`: one integration file, two cases passed; owned and ownerless 1938→1946 crossings, overlap audits, owned schema validation, checkpoint and portable canonical round trips. Wrapper 168.888 seconds, check `5b1e8435-7d30-4dab-8c25-9825a54bd2de`.
- `diagnostic-check.json` and `diagnostic-world.json`: the original failing seed `save-overlap-diagnosis`, fresh 1930→1946 generation and ENG:3:0:0 takeover. Every recorded boundary has zero forbidden overlaps. Strict validation, checkpoint and portable decode preserve canonical facts. Diagnostic 299.205 seconds; wrapper 301.345 seconds, check `61e57ec5-c3dc-4d9c-924a-46c9b2e40217`. Before the fix the same reproduction had 68 forbidden overlaps and rejected saving/reload.
- `verify-world.mjs` is a byte-identical copy of the diagnostic helper used for this evidence. From the source checkout with its locked dependencies installed, run `node --import tsx artifacts/verification/ws16/verify-world.mjs .`. It writes a successful result to `/tmp/ws16-world-verification.json`; inspect the command receipt and result's `head` together, because an earlier successful file is not evidence for a failed later run.

The supplied user export was truncated; no full user file has been decoded or repaired. The gzip-cjk14 payload's CJK characters are the normal portable encoding.

## Independent production CSP diagnosis

On 2026-11-16, a read-only GET of `https://hrsoccer.netlify.app/` showed Netlify's edge-injected `/.netlify/scripts/hud?variant=public`. Its public iframe contains a 2,353-byte inline script with the exact reported hash `sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw=`. This identifies the provider badge as the CSP violation's source, independently of the save bug. No deployed Git SHA or engine version was inferred from asset fingerprints.

Keep the application's CSP. Netlify documents the per-project remedy at **Project configuration > General > Powered by Netlify badge**, switched off and saved; the next request reflects the setting without redeployment. Account settings were not changed because no authenticated Netlify management connection is available here. [Netlify's badge documentation](https://docs.netlify.com/manage/projects/powered-by-netlify-badge/).
