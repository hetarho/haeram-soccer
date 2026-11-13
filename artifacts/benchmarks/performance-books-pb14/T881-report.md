# T881: performance and funding evidence

## Paired performance, before financing

The completed T877/T878 comparison is preserved in `t878-history-final.json` (SHA-256 `58fd226310223cb4c89fbfec73f5fd4da8794df6e5871723ac30260c19993a53`); interrupted and partial files are retained unchanged. It used:

```sh
node scripts/perf/ab.mjs --base e4f6c203 --workload history --procs 8 --reps 2 --warm 1 --json artifacts/benchmarks/performance-books-pb14/t878-history-final.json
```

Baseline source `e4f6c20323b7c8cfda203e8d7f23eb30eae3138b`; the candidate working tree was based on HEAD `0cd4fb216686ea23f3be5d8d45e9791e0035aaa0` with T878 edits still uncommitted (subsequently committed as `bf660293342d`). The harness bundled each tree's transitive source closure: bundle hashes `2b3da09d1133dfb0` and `f7e4268dcf284a71`. The raw artifact contains every pair, workload settings and world hashes, which all match `f378cd9f2e26c232`. On Apple M1 Max, macOS arm64, Node v26.8.1, load 4.77–38.31, 16 paired complete-history-workload samples gave CPU ratio 0.715 (95% interval 0.6837–0.7403), wall ratio 0.7683 (0.6931–0.8586). This is a measured speedup for the first three ownerless history seasons of seed `perf-261027`, before T880 funding, not a final funded-model speedup or browser measurement. The earlier 37.876 ratio (95% 34.7735–41.6456) was a separate shared-host pre-T872 measurement versus pre-T861; it is context, not a new Mac result or an arbitrary gate.

## Bounded financing read

```sh
pnpm exec tsx scripts/persisted-world-read.ts --seed pb14-funding-1930 --until 1933 --extend 1933 --out artifacts/benchmarks/performance-books-pb14/t881-funding-1933.json
```

One ownerless world actually played 1930–1932, all eight countries, 451 clubs per season. No configuration overrides; exact settings and each individual book and envelope are in the raw JSON (SHA-256 `a05b925a6b76510a07f07bf59aa8ee93b88b3037df09eabd5435e4c68760d33f`). The source HEAD was `588127d5d1eb678610c592688ae575fdbd4e789e` with T881 uncommitted changes; the exact 211-file runtime and declared-input closure, including individual hashes, is `t881-source-closure.json` (SHA-256 `24e126c604437398512a6f42a31d4d3642b63b41f6e40fb148a9b70d3d78aa2a`, closure identity `a91e9370040b119fcb3da8ee203ef9dfc1b9ecd80b72a3eaec8ad49f83632936`). It ran 2026-11-13 17:23:41–17:24:13 UTC on Apple M1 Max, macOS 25.5.0, Node v26.8.1, with ending load 11.52/23.31/23.52; elapsed 32.335 s is context, not a paired timing result.

Of 1,353 closed club-seasons, 20 paid wages above turnover, 153 had a negative operating/trading result, and 8 drew actual owner capital. There were zero observed exhausted allowances, unsupported closing shortfalls, remaining debts, or component/result/capital/bounded-balance reconciliation failures. All 1,353 after-summer wage bills fit their observed funding envelopes. Ratios above turnover are diagnostics, not failures; the remaining unsupported commitment is separately calculated against the live envelope. Cash and debt in the close snapshot are the balance immediately before that close, not an invented start-of-season balance; the output also records the actual post-close balance, investment and debt write-off. Original-currency integer strings are retained, and bounds and currency conversion are checked explicitly. The probe is too short to establish mature-era solvency, champions, 2010 coverage or a 50-season career gate.

Previous ownerless four-seed evidence reported 10,748 of 131,692 wages above turnover and 47,223 after-summer wage-limit breaches on the older unfunded model; those counts are historical and are not comparable proof that this short funded sample fixes mature finances. Its division-strength inflation (588/588 observed division/decade/seed cells outside ±5), champions spread (32/32 country/seed windows outside target), and XI spread and transfer-value residuals remain open. The 2010/five-seed, 19-placebo, reference-career, long-run capacity and browser-generation reads were not performed here. No century run, build, integration, contract, browser, full suite or batch gate was run locally; the coordinator owns the final unit-only publication gate and normal main CI. Unknown historical income components, capital and opening balance remain unknown rather than an inferred financed pass.
