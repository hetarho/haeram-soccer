# Working artifacts

Store retained design concepts, screenshots, benchmark outputs, calibration observations and
verification evidence here. Product rules and architecture live in `spec/ssot/`; implementation
contracts live in the source modules they describe. This directory is not another specification.

- `benchmarks/`: measurements, reference observations and tools needed to reproduce them.
- `verification/` and `iterations/`: historical check results and completed improvement cycles.
- `improvement/` and `owner-workflows/`: captured UI and workflow evidence.
- `night-broadcast/` and `print-sticker-themes/`: visual experiments, comparisons and checks.

Keep raw measurements and their source/command/environment provenance unchanged. Old reports and
completed task histories may name `docs/`: those are paths at the recorded commit. Use that commit
when reproducing historical evidence; paths alone do not make old tools compatible with current
code. Newly run tooling writes to `artifacts/`.

Disposable logs, browser profiles, caches and unselected trials belong in ignored `.tmp/`.
Keep editable artwork needed by the application in `apps/web/design/` and deployed resources in
`apps/web/public/`; moving review evidence does not move those source or runtime assets.
