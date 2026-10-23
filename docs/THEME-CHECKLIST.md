# Theme production checklist

Use this for a new theme or a complete visual refresh. The current contracts are
[WEB-91](../spec/ssot/WEB.md) and [ARCH-32](../spec/ssot/ARCH.md); resource shapes and loader behavior
are documented in [Presentation packs](PRESENTATION-PACKS.md). Check each item against the actual
rendered game. Record the reviewed theme, commit, viewports, browser and exceptions in the task.

## 1. Direction and source assets

- [ ] Keep the approved concept image and define the palette, typography, materials, frame shapes,
      icon family and facility-art direction before implementation.
- [ ] Cover the complete interface: founding, shell, every page and tab, overlays and feedback.
      Inventory shared surfaces before drawing individual screens.
- [ ] Retain editable source assets, prompts, provenance, licenses and a reproducible preparation
      command. Matchday Print UI sources are in `apps/web/design/home-print/`; the original print
      and sticker references are in `apps/web/design/home-themes/`. Sticker UI sources are in
      `apps/web/design/sticker-club/`; both packs reuse the shared image-UI stylesheets and media
      preparation helper while retaining separate resource bindings.
- [ ] Separate artwork from live HTML text, numbers, forms, tables and accessible labels. Keep
      theme changes independent of engine facts, club identity and the live-pitch renderer.

## 2. Image-built components

- [ ] Use fixed corners and independently extensible edges for variable-size frames. Tile the
      interior material separately; test short, long and multiline labels without stretching corners.
- [ ] Provide coherent neutral, selected, primary, dark and inset surfaces, plus legible hover,
      pressed, disabled and keyboard-focus states. Preserve semantic status meanings.
- [ ] Check transparent atlas gutters, crop bounds, repeat seams, image density and text contrast.
      Grain belongs behind text; it must not filter or distort the text itself.
      Generated atlas grids can drift: inspect full silhouettes before cropping to avoid clipped
      sticker rims. Render colorful stickers as images rather than monochrome masks.
- [ ] Encode appropriately sized production assets, keep shared materials reusable and record
      checksums. Keep a readable fallback when decorative CSS images cannot load.

## 3. Pack registration and shared hooks

- [ ] Register a stable ID, label and relative resource URL in the theme registry; its `defaultId`
      must name a registered entry. Only change the default when the approved scope calls for it.
- [ ] Complete the JSON tokens, fonts, icons, stylesheet and every required era/facility/stage
      mapping. Include font fallback resources and license notices; use the shared URL resolvers.
- [ ] Adding a theme uses data, CSS and assets. Reuse semantic hooks such as `data-surface="panel"`
      and `data-ui`; do not add theme-ID lists or branches to shared React components.
- [ ] Scope shell decoration to its explicit sidebar identity. A generic `aside` selector also
      matches feedback/result cards. Scope home-only layout rules to the active home.
- [ ] Check fresh defaults, unknown-preference fallback, every existing saved theme selection,
      switching and reload. Preserve game saves and the existing resource-failure behavior.

## 4. Surface audit

- [ ] Page and shell backgrounds, sidebar, mobile navigation, HUD, menu, cash and notification
      count badges, including multi-digit counts.
- [ ] Panels, nested tiles, office/staff/finance surfaces, sticky toolbars, status chips and the
      club-design draft/apply bar.
- [ ] Primary/secondary buttons, tabs, current-season choices, selected segments, radio/checkbox
      choices, fields, select menus, native file-import labels, disabled and read-only controls.
- [ ] Tables: header, body, sticky first columns, own-team row, alternating/selected rows and
      horizontal scrolling. Pinned cells need their own opaque, contrasting material.
- [ ] Bottom sheets, dialogs, dropdowns, news, player/team details, preparation, mode changes,
      match reports, settings, floating outcomes and pending-event feedback.
- [ ] Loading, empty, error and recovery states. Inspect computed backgrounds/borders for shared
      overrides and `!important` rules that can silently restore a plain application fill.

## 5. Layout and interaction

- [ ] Review desktop, tablet and narrow mobile, including 360×740 and 390×844. Founding must fit
      its supported mobile layout with import/recovery actions and footer visible.
- [ ] Check fallback fonts, long club/player names, multiline Korean text, large counts and
      missing images. Keep explanatory copy readable; do not hide it to force a layout to fit.
- [ ] Keep required touch targets at least 44px, related transport controls aligned and preparation
      actions reachable beside their fixture text. Preserve keyboard focus and reduced motion.
- [ ] Open, scroll, close and reopen bottom sheets and reports. Header, body and action footer
      must retain their intended scroll bounds; actions must stay reachable.
- [ ] Check home column scrolling and focus restoration, plus the last row/action on every page.
      Mobile navigation, safe areas and floating event pills must not cover the end of the content.
- [ ] Review every primary page and its subtabs, nested dialogs and live match controls in an
      isolated test career. Check alternative themes after any shared-hook or layout change.

## 6. Verification and publication

- [ ] Run the task checks required by ARCH-30: typecheck, lint, format, affected unit tests and
      the build for UI changes. Validate presentation resources with `pnpm run validate:presentation`.
      Run the relevant preparation/generation commands with `--check`.
- [ ] Keep screenshots and temporary browser profiles in ignored `.tmp/`, using isolated saves.
      Record reviewed states, failures and limitations in the task result; retain useful source
      assets and provenance, then remove disposable galleries and one-off diagnostic scripts.
- [ ] Pull origin before publication, preserve other work and inspect the final diff. Recheck
      changes introduced by integration. Keep this checklist and resource documentation consistent.
- [ ] Before a code push to main, run the ARCH-30 batch once: full units, contracts, catalogs,
      production build and all Chromium journeys against that build. Reuse successful checks only
      for an unchanged relevant tree; record exactly what ran.
- [ ] Commit and push only when authorized. Read hosted CI once per code push using a waiting
      command. Inspect the actual failing/stalled step: browser installation is distinct from test
      execution. Record permission blocks or infrastructure failures without claiming CI passed.
      Pushes containing only `spec/`, `docs/` or Markdown need no hosted CI wait.
