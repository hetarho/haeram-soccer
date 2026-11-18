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

## Measured results

The selected pivot wage is 2,700. Its mean distance from the wage bands is 3.2 percentage points.

| Pivot wage | Opening | Top third | Middle third | Bottom third | Second tier | Third tier | Fourth tier |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 900 | 1951 | 39.7% | 37.5% | 30.8% | 38.6% | 20.7% | 11.5% |
| 900 | 1995 | 34.3% | 32.6% | 25.2% | 48.4% | 53.0% | 52.1% |
| 1,350 | 1951 | 47.7% | 46.7% | 41.6% | 55.8% | 36.4% | 20.7% |
| 1,350 | 1995 | 41.5% | 39.4% | 35.2% | 66.5% | 69.1% | 64.7% |
| 1,800 | 1951 | 57.4% | 57.3% | 50.3% | 67.9% | 59.2% | 41.4% |
| 1,800 | 1995 | 48.4% | 47.5% | 38.2% | 75.5% | 72.9% | 63.4% |
| 2,700 | 1951 | 85.5% | 82.3% | 65.6% | 81.7% | 76.4% | 75.9% |
| 2,700 | 1995 | 68.3% | 65.6% | 52.7% | 83.8% | 72.9% | 73.4% |
| 3,600 | 1951 | 105.7% | 84.7% | 75.1% | 82.4% | 78.0% | 77.5% |
| 3,600 | 1995 | 82.1% | 80.8% | 59.6% | 83.3% | 76.3% | 76.2% |
| 5,400 | 1951 | 123.1% | 93.0% | 78.6% | 82.1% | 78.2% | 67.8% |
| 5,400 | 1995 | 99.1% | 85.2% | 68.7% | 84.7% | 75.4% | 74.2% |

At this wage, OVR 80 earns 7.37 times OVR 60 in the top flight. The second tier's OVR 70 earns 40.0% of top-flight pay.

| Opening | Top-flight group or tier | Operating losses | Fee receipts / income |
| ---: | --- | ---: | ---: |
| 1951 | top | 65.1% | 2.3% |
| 1951 | middle | 61.2% | 0.2% |
| 1951 | bottom | 37.5% | 0.0% |
| 1951 | tier2 | 62.4% | 4.7% |
| 1951 | tier3 | 57.9% | 7.1% |
| 1951 | tier4 | 50.0% | 4.5% |
| 1995 | top | 43.3% | 0.1% |
| 1995 | middle | 40.1% | 0.1% |
| 1995 | bottom | 25.0% | 0.0% |
| 1995 | tier2 | 61.1% | 2.0% |
| 1995 | tier3 | 58.3% | 8.4% |
| 1995 | tier4 | 56.1% | 10.6% |

The JSON records every level's full ratio and coverage tables, country administration rates, year-by-year English value readings and the fingerprints of the raw runs.

### Bands beyond all measured levels

- 1951 bottom operating losses 0.4%–49.5%, tier3 fee receipts 2.4%–7.4%, tier4 fee receipts 1.8%–5.0%.
- 1951 stage 3 rates outside the band at every level in BEL.
- 1995 bottom operating losses 3.0%–44.1%.

### Transfer-value misses at the selected level

The most expensive estimated English player was 1.62 times the standing record fee in 1951 and 2.45 times in 1995. The measured target is 0.5–1.0. The 2003 mean was 2.98 times the published fee against a 0.6–1.4 target. The value formula shares the wage pivot, so 2,700 also triples a given player's pre-rounding value at fixed attributes and age.
