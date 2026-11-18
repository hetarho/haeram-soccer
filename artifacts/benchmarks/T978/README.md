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
