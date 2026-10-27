# Automatic play in the built browser game (T522, 261028)

Build f9962dfc3506e8ac from 35d0a4bc (dirty); Apple M1 Max, 10 logical CPUs, 32 GiB; Chromium headless 1280x800; navigator.hardwareConcurrency 10.

Node simulation (→WEB-18): x10 about 10 stalls a season and 8.9 days a second at depth 7.

| pace | rep | days | days/s (target) | stalls | worst gap ms | gap p50/p90/p99 ms | skipped | long tasks            | helpers created / terminated | load |
| ---- | --- | ---- | --------------- | ------ | ------------ | ------------------ | ------- | --------------------- | ---------------------------- | ---- |
| x10  | 0   | 365  | 10 / 10         | 0      | 112          | 100 / 107 / 110    | 42      | 0 (0 > 100 ms, max 0) | 2 / 0                        | 2.63 |
| x1   | 0   | 30   | 1 / 1           | 0      | 1019         | 1000 / 1010 / 1019 | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 4.42 |
| x2   | 0   | 30   | 2 / 2           | 0      | 519          | 500 / 511 / 519    | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 3.66 |
| x5   | 0   | 30   | 5 / 5           | 0      | 213          | 200 / 208 / 213    | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 3.15 |
| x10  | 1   | 365  | 10 / 10         | 0      | 113          | 100 / 107 / 111    | 42      | 0 (0 > 100 ms, max 0) | 2 / 0                        | 3.14 |
| x1   | 1   | 30   | 1 / 1           | 0      | 1018         | 1000 / 1007 / 1018 | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 3.89 |
| x2   | 1   | 30   | 2 / 2           | 0      | 515          | 500 / 511 / 515    | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 3.27 |
| x5   | 1   | 30   | 5 / 5           | 0      | 216          | 200 / 208 / 216    | 0       | 0 (0 > 100 ms, max 0) | 2 / 0                        | 2.55 |
