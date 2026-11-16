# T918 presorted market walk — measurements (261116)

Machine: Intel Xeon Silver 4214 @ 2.20GHz, 12 cores, Linux, Node v24.22.1; shared host, load1 1.8–4.4 during runs.
Base: b488d463e (b431c2c1 market code). Candidate: this tree's `packages/engine/src/npc-market.ts`; source and tests unchanged while timing (the unit test was added afterwards and is not in the timed closure).

| run | file | result |
|---|---|---|
| driver `1950 generation-reference --hash --until=1933` | until-1933.txt | hash 3ddbca1d60916dedc7689cc767891e7bb6920582cd12a9af2c6bd965f3e22457 (expected), generation 26.2 s |
| driver `1950 generation-reference --hash` (full, takeover) | full-1950.txt | hash f6d624fc434b7078682616654ca23651b3c5f12e8a1ee4002785840960c0ba23 (expected), generation 201.0 s, 15.4 s a season (base record: 666.7 s, 51.2 s a season — another run and load, context only) |
| `ab.mjs --workload history --procs 8 --reps 2 --warm 1` | ab-history.json / .txt | equal output hashes (aaa3a4729a3e1520); CPU ratio 0.5439, 95% 0.5245–0.5647 (faster); wall 0.5444 (0.5249–0.5650) |

No speed claim beyond this seed, era and machine.
