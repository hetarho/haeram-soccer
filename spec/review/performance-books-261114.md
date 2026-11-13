# REVIEW performance-books-261114
> st:converted@261114 | scope:packages/engine/src/npc-market.ts packages/engine/src/player-state.ts packages/engine/src/player.ts | at:3344308d | base:ARCH@43

## summary
The funded-day profile identifies repeated pure player ratings inside the atomic NPC market as a bounded result-preserving optimization candidate.

## findings
- F1 [o] P2 packages/engine/src/npc-market.ts:103-126,274-312,363-370: bug: ranking, blocked-player checks, formation needs and offer eligibility recompute unchanged player/slot ratings within one settlement. The 3344308d V8 profile attributes 16.36% of sampled elapsed self time to ovrAt and 16.73% to npcMarket itself; these are diagnostic samples, not a speedup. Reuse ratings only within that settlement, invalidate a moved player's scores and keep direct offers fresh. ← avoid repeated weighted-attribute passes without changing money, identity, selection order or observation traces →T899

## notes
- Adopted under the explicit performance request to improve expensive algorithms or simplify calculations; this experiment preserves formulas and all game rules. No arbitrary global cache, attribute changes or test relaxation is authorized.
- Raw profile remains .tmp/pb14-cpu-profile/funded-days.cpuprofile; its hash, source and aggregate are artifacts/benchmarks/performance-books-pb14/funded-days-profile.json. Source module closure and benchmark identities must be retained separately.
- The experiment is bounded to forty-five minutes under the original pb14 deadline. A faster point estimate alone is insufficient: require exact world hashes and a paired CPU interval wholly below one before adopting the candidate. Otherwise retain the original implementation and report the actual result.
