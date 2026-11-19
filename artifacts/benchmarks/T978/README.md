# T978 Combined world calibration

The source manifest fixes the engine, measurement runners and starting constants. `run-worlds.sh` builds four ownerless careers from 1930 with seeds `market-0` through `market-3` and saves their 1951 and 1995 opening worlds. The fresh run follows the first three seeds from 1930 through 1975. It records two burn-in seasons and 37 measured seasons, with 1939–45 skipped by the game calendar. Seeding, calendar and match dispatch use the normal game paths.

`lived-inputs.sha256` binds the eight openings read by the five-season sweeps. `continued-inputs.sha256` binds three of the 1995 worlds for the 1980–2009 champion read and the additional seasons through the 2025 opening. It also binds the opening squads, fixture seeds and books for the lived aggregate runs. Those runs take over the first current English fourth-division club at the opening with delegated business and measure the other clubs through aggregate match jobs. The held-out gap/core corpus separately tests the registry's full controlled range. The reports retain real prepared gaps, cohort counts and fixture coverage.

```sh
bash artifacts/benchmarks/T978/run-worlds.sh
bash artifacts/benchmarks/T978/run-lived.sh
bash artifacts/benchmarks/T978/run-continued.sh
bash artifacts/benchmarks/T978/run-parity.sh
python3 artifacts/benchmarks/T978/summarize.py .tmp/mr18cx/T978
```

PLAYER-17 onset is the first scheduled attribute decline from the profile of a player observed at age 24. Peak retention follows players in the opening XI at age 30 and, where the run is long enough, compares consecutive opening OVR observations with the highest reading from age 24 through the target age. An unobserved year does not establish uninterrupted retention. A two-season decline requires observed ratings immediately before onset and after two annual updates.

The opening world store is private to this recipe. The second phase checks the exact stage-one bytes and its independently reviewed recipe receipt. Completed outputs are reused only when their data and recipe checksums match.

## Combined-world results

| Worlds | Division cells within ±4 | Reversed tier orders | Lower-tier clubs above 85 per opening | Upward moves | Renewal decisions |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1930–75, three seeds | 540 / 1,953 | 0 | 0.00 | 9.8% | 187,929 / 203,679 |
| 1951–55, four seeds | 30 / 420 | 0 | 0.00 | 10.0% | 47,507 / 50,974 |
| 1995–99, four seeds | 221 / 420 | 0 | 0.00 | 12.8% | 35,516 / 38,501 |

| Worlds | Decline before 27 | Decline at 28–32 | Near peak through 34 | Near peak through 37 | Lost ≥6 in two years |
| --- | ---: | ---: | ---: | ---: | ---: |
| fresh1930 | 3.1% | 86.1% | 20.3% | 1.5% | 0.0% |
| lived1951 | 2.9% | 85.8% | Missing | Missing | 0.0% |
| lived1995 | 3.0% | 86.5% | Missing | Missing | 0.0% |

| Worlds | Wages / income in top, middle, bottom thirds | Wages / income in tiers 2, 3, 4 | Stage 3 per country-decade |
| --- | --- | --- | ---: |
| fresh1930 | 100.7% / 76.8% / 66.7% | 71.5% / 68.4% / 57.7% | 7.7–28.1 |
| lived1951 | 87.3% / 72.6% / 60.2% | 64.6% / 59.8% / 47.5% | 2.5–25.5 |
| lived1995 | 88.8% / 70.9% / 63.8% | 71.0% / 66.8% / 30.2% | 6.0–16.5 |

The 1980/81–2009/10 champions span passes both title-spread bands in 18 of 24 country-world pairs. The full records give the winners and counts for every country.

| English opening | Largest value / record fee | Mean value / published fee |
| ---: | ---: | ---: |
| 1951 | 1.871 | Missing |
| 1993 | 2.449 | 2.636 |
| 1995 | 2.534 | Missing |
| 2003 | 2.111 | 3.125 |
| 2013 | 1.736 | 3.377 |
| 2025 | 3.210 | 1.982 |

### Lived aggregate seasons

The controlled core/gap corpus has a mean outcome error of 2.16 percentage points.

| Seed | Complete 20-club first divisions | Goals / match | Top scorer | Top share | Hat-tricks / observed matches | Owned turnover change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| market-0 | 3 | 2.67 | 29.3 | 34.3% | 55 / 1140 of 1140 | -10.1% |
| market-1 | 3 | 2.75 | 31.7 | 34.8% | 63 / 1140 of 1140 | 24.5% |
| market-2 | 3 | 2.71 | 26.7 | 34.6% | 59 / 1140 of 1140 | -41.6% |

The results retain every country-tier wage and distress comparison, bid and renewal counts, gap bucket, scoring-concentration verdict, fixture coverage and raw-output fingerprint.

### Selection and coverage

The final constant set keeps the 10-point youth refill margin and the 2,700 wage pivot from T977. On two paired 1951 openings, changing only the refill margin to 6 moved division cells inside ±4 from 13 of 210 to 10 of 210. Upward moves fell from 11.0% to 10.0%. Mean wage-band distance rose from 5.7 to 6.8 percentage points. The paired records include both arms' books, distress rates and levels.

Applying the match registry's season reader to the nine complete first divisions gives 2.711 goals per match, with a 95% interval of 2.644–2.778. A club's leading scorer accounted for 34.5% of its goals on average. The league-leading scorer averaged 29.2 goals. The registry marks both concentration estimates underpowered at nine divisions. The three worlds recorded 177 hat-tricks in 3,420 eligible matches. This is 0.052 per match, with a 95% interval of 0.045–0.060 and an unresolved verdict against 0.02–0.05. All 3,042 club-competition goal totals reconciled with player records. Two of the three takeovers came within the ±25% turnover target.

The division-level, upward-move, transfer-value and administration misses are tracked for later rule review. The age cohort begins decline before age 27 in 3.07% of long-run cases. It records zero six-point OVR drops over the two annual observations around onset. The JSON retains all counts and missing coverage.

### Reproduction and repair

Run the two-seed refill diagnostic with `bash artifacts/benchmarks/T978/run-diagnostic.sh`. With the recorded raw outputs, run `python3 artifacts/benchmarks/T978/summarize-diagnostic.py .tmp/mr18cx/T978` to reproduce its paired summary.

`first-world-attempt.json` records the invalidated initial run. A saved distress round captured the world object, and the repaired state keeps just the year and round. The full 1930–1975 re-execution produced identical measured game facts for all three seeds. The repaired source generated all eight openings and every lived workload in this report.

`continued-recipe-executed.sha256` identifies the approved recipe used by the raw jobs at `8c8118a4`. The current replay recipe corrects the diagnostic summary's Python import. The simulation commands, candidate fields and snapshot hashes retain their original bytes.
