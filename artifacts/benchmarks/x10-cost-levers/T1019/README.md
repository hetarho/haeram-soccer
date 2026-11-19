# T1019 ten-season save size

The same `ten-rich` V8 world was measured with `scripts/save-db-bench.ts measure` on an Apple M1 Max, Node v26.8.1. The baseline is `artifacts/benchmarks/save-db-261119/ten-rich-seasons.json` (source commit 21455f48ad55, three runs); `after.json` is one run with the T1019 working tree based on 76576857a7d067a8250a02b4da3f35b6cde84270. Both measure the database and gzip export after the same host workload.

| bytes | Before | After |
| --- | ---: | ---: |
| SQLite database | 32,460,800 | 32,460,800 |
| gzip export | 4,497,001 | 4,496,998 |

T993 already stopped producing heat before both measurements, so this fixture contains no heat to remove and these numbers do not estimate the size of an older heat-bearing save. The export's three-byte difference is not a measured heat saving. Browser OPFS is not measured.
