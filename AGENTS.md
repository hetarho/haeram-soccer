# Localization

All authored display copy is a translation resource, including errors, generated news, Canvas
labels, accessibility text and development tools. New copy in any language must use message IDs
and named parameters, with translations in every entry of the locale registry. Reuse existing
IDs. Keep complete sentences together; use `richMessage` in subscribed components or `LocalizedMessage` for inline React content.

`packages/contracts/src/source-messages.ts` is the canonical source resource. `message` emits
locale-independent source prose so game predicates and saves retain their meaning. Resolve it at
presentation boundaries with `displayMessage` when the ID is known, otherwise `localizeValue`; source-label components subscribe with
`useTextLocale`. Never read locale preferences in the simulation or translate user-entered names,
IDs, comparison operands or stored game facts. Use the shared number/date formatters.

Run `pnpm run validate:i18n` and `pnpm run lint`. Hardcoded Korean literals, raw JSX prose, missing
message keys, incomplete packs and mismatched parameters are errors. Do not add a baseline,
production-file exception or lint-disable to bypass them. Tests, comments and type-only domain
facts may contain source-language examples. See [web guidance](apps/web/AGENTS.md) and ARCH-32.

<!-- gusta:begin managed by gusta: do not edit inside this block (gusta-update rewrites it with "gusta agent-block"); write project rules outside it -->
## GUSTA

This project is built spec-first with GUSTA. `spec/` is the source of truth and code follows it.

- Plan a change with the `gusta-sketch` skill; run planned work or a one-line change request with the `gusta-start` skill.
- Do not change behavior covered by a `spec/ssot/` decision without updating the spec first.
- Branch, push, deploy and version behavior comes from `spec/SETTINGS.md` (the `gusta-preference` skill); never assume branch names.

<!-- gusta:end -->
