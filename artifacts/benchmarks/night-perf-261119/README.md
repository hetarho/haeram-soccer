# night-perf-261119 (session np19)

Evidence for review/night-perf-261119 and reports/261119-np19.

- `base-d999af70-1950.txt`: base 1950 generation (seed `generation-reference`) with world hash.
- `T982/` … `T988/`: each task's A/B (`scripts/perf/ab.mjs`) and same-world runs.
- `combined/`: the integrated head 899f9ea9 (T982–T986) against d999af70 — gen-driver hash, history-five and day A/B; also the experiment summaries (`report-draft-*.md`).
- `remove-day/`: 10x-play removal experiments D1–D8 (patches `tools/p-*.mjs`, drivers, raw `out/`).
- `remove-gen/`: generation removal experiments G0–G9 (patches `tools/p-*.mjs`, `gstats.mts`, raw `out/`; `out/seeds.tgz` holds the 3-seed world statistics).
- `late/`: the late-career slowdown investigation (`play.ts` plays a career forward and samples sizes; `days2.ts` times days on a `.bin` world; `open.ts` times days with the records room open; `fromsave.ts` turns an exported save into a world; `enc.ts`/`brotli.ts` time the save codec).
- `brotli-q11-play10.txt`: pure-JS Brotli q11 on a ten-season career save.

The drivers were written in a session scratchpad and still name absolute paths there and in the session worktree; adjust the paths (or `WT=`) before rerunning. The cached `.bin` worlds were not kept (tens of MB each); `late/play.ts` and `late/gen.ts` rebuild them.
