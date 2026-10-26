# Working artifacts

Retain benchmark measurements and tools needed to reproduce them here. Unimplemented visual
concepts may be kept in `concepts/` when available; no such concepts are currently retained.
Product plans, behavior, target bands and architecture are maintained in `spec/`, with current
rules in `spec/ssot/`.

- `benchmarks/`: raw run outputs, profiles, statistical observations and reproduction tools.
- `benchmarks/*-results*.json`: measured tables extracted from former mixed-purpose reports,
  with the source document's commit, checksum, line ranges and historical run labels.
- `benchmarks/football-observations.json`: source observations; current definitions and target
  bands are in `spec/ssot/MATCH.md`.
- `benchmarks/ui-measurements.json`: historical bundle, contrast and geometry measurements.

Historical run settings and comparison bands describe those runs; they do not prescribe current
behavior. The extraction snapshot identifies the source document, not every benchmark's execution
commit. Preserve each run's source, command, units, sample size, environment and uncertainty when
interpreting results. Measurements from different sources or cache conditions do not establish a
controlled speedup. Keep original machine-readable outputs unchanged.

Old run records and completed task histories may name deleted reports or former `docs/` paths.
Use their recorded commit to inspect those historical inputs. Reproduction tools may also require
that version of the code. Current tooling writes retained measurements under `benchmarks/`.

Applied UI screenshots, completed verification narratives, throwaway captures, browser profiles,
caches and disposable logs belong in ignored `.tmp/`. For example, the theme capture script writes
to `.tmp/theme-captures/`. Editable application artwork stays in `apps/web/design/`, and deployed
resources stay in `apps/web/public/`.
