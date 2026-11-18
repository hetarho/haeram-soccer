# T984 — per-slot best pairs and explicit growth writes

Machine: Apple M1 Max (shared, load1 12–24 during the runs). Base e8b4ada9; candidate = working tree.

| run | workload | CPU ratio (95%) | call | hashes |
|---|---|---|---|---|
| both parts vs base | history | 0.944 (0.933–0.955) | faster | equal (717e11ee8690e16b) |
| both parts vs base | day | 0.994 (0.977–1.013) | no difference | equal (a56436ea3e565194) |
| part 1 (world.ts) vs base | history | 0.980 (0.974–0.989) | faster | equal |
| part 2 (training.ts) vs base + part 1 | history | 0.944 (0.930–0.957) | faster | equal |

Part runs: the other side is a scratch copy of HEAD with only world.ts changed.
World hash (gen-driver 1950 generation-reference): 4161b5e0…435ce, equal to base d999af70 (gen-1950-hash.txt).
