# T988: free-agent settlement money facts on demand

Machine: Apple M1 Max, shared, with load1 between 6.5 and 16.3 during the A/B run. Base c1023944; the candidate is this workspace's working tree.

The change: `refreshFreeAgents` still computes each settling club's `wanted` lines up front. Its
registration, wage bill and wage limit are now computed on first read and kept for the rest of the
refresh. Only clubs that want a free agent's line read them. `npcCanPay` and the observers run in
the same order as before.

| run | workload | CPU ratio (95%) | call | hashes |
|---|---|---|---|---|
| T988 vs base | history | 0.990 (0.983–1.001) | no difference (not slower) | equal (717e11ee8690e16b) |

40 pairs: 4 processes, 10 reps and 1 warm-up. Mean CPU per rep was 2754 ms on the base and
2705 ms on the candidate. The coordinator asked for `--procs 4` because the host was heavily
loaded; the task acceptance names 6.

The world hash (gen-driver 1950 generation-reference) is 4161b5e0…435ce, the reference value
(`gen-1950-hash.txt`).
