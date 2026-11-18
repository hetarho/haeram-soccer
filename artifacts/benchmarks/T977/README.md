# T977 Wage-curve level

The paired sweep starts all six levels from the same six saved, ownerless openings. They are the 1951 and 1995 first days reached by living from 1930, seeds `market-0` through `market-2`, luck 0. The input checksums identify the reused worlds from the prior source. The overrides apply on opening those worlds and signed wages carry through their original contracts. The 1951–55 and 1995–99 closes provide the books reads. The modern arms continue to the 2003 opening for an exact published mean fee reference.

The six candidates change one field, `MARKET_CONFIG.wage` at OVR 70. They leave the wage and fee curves' other constants set to the measured source. Initial levels 900, 1,350, 1,800, 2,700, 3,600 and 5,400 start from the existing wage level. This same field scales transfer values. The selection minimizes mean absolute departure from the six wage-to-income bands over both eras. An exact tie keeps the smaller level. The results also record operating losses, transfer income, administration and transfer values.

From the reviewed Git source with the six input snapshots restored, run

```sh
bash artifacts/benchmarks/T977/run.sh
```

Compare an era's country-by-season team medians without a country size weight. Operating-loss shares count club-seasons. The report shows administration entries per ten observed country-seasons. A benchmark with the observer missing supplies an absent reading. At the first day of each season the value comparison reads every persisted English top-flight player, including the bench, against CLUB-46's record fee and available exact-year mean fee. The quote probe reads same-age prime players rated 80 and 60 in the top flight and the ordinary second-tier OVR 70 player on each club division.

The input producer is `1bb2b1a1ba137b577476e99c5fe4ae79e0e0a7c8` (game version 0.8.11), with the world-building computation identity `2521f0c897293eca3b1349d2543151d108bfbb86c486e761e7e72f2f7f13beb8`. The working copies' six compressed checksums, decoded seed, year and opening round were checked. Recreate the inputs on that source with its pinned Node/pnpm and frozen install by running the following for each era. Copy the matching snapshots and sidecars from `.tmp/market-seasons/` into this run's `.tmp/mr18cx/T977-inputs/`. Completed arms are reused only when their data checksum and reviewed recipe checksum still match.

```sh
pnpm exec tsx scripts/market-seasons.ts --start lived:1951 --seasons 0 --seeds 0..2 --jobs 3 --out .tmp/inputs-1951.json
pnpm exec tsx scripts/market-seasons.ts --start lived:1995 --seasons 0 --seeds 0..2 --jobs 3 --out .tmp/inputs-1995.json
```
