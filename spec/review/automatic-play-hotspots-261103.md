# REVIEW automatic-play-hotspots-261103
> st:converted@261103 | scope:apps/web/src/runtime/store.ts apps/web/src/runtime/client.ts apps/web/src/runtime/viewPublisher.ts | at:f447d878 | base:ARCH@28

## summary
- T680 measured two remaining costs: main-page recursive state sharing and serial day-step work. The owner explicitly accepted fixing these findings, then requested gusta-start automatic mode.
- Preserve gameplay, paced visibility, Worker ownership and checkpoint facts. Existing ARCH-6/30/31/33/34 and WEB-18 already define the constraints; no product-policy revision is needed.

## findings
- F1 [o] P2 apps/web/src/runtime/store.ts createGameStore.publish and apps/web/src/runtime/client.ts received/viewOf/take: the client already restores shared references when accepting Worker views, then every store publication deeply reconciles them again. If the store adopts different equal references, subsequent busy/save publications repeat that traversal even when the client's source view is unchanged. T680's retained main-page profile spends 5.043 s in shareValue in 33.35 s (83% of sampled application-JavaScript self time). Give the client pipeline one sharing owner and publish its prepared immutable views without a second walk, while retaining unprepared publications' behavior and stable selectors. →T681
- F2 [o] P2 apps/web/src/runtime/viewPublisher.ts ViewPublisher.publish and the Host day-step path: every day constructs and serializes all projected parts before diffing them, alongside match settlement. T680's retained daily RPC averages about 222 ms and own-match changes about 905 ms, far beyond the experimental 50 ms interval. Profile the actual retained Host path before selecting an optimization; remove measured repeated work without skipping facts or changing result order. Timing alone does not yet assign that cost between simulation and publication. →T682

## notes
- Adoption is the owner's explicit request to fix the reported bottlenecks, reaffirmed by gusta-start automatic mode; no new confirmation is required.
- T666/T667/T668/T672 remain owned by ot03. Do not merge the takeover branch or alter its gameplay and generation work.
- Existing T680 browser measurements and source/build hashes are retained unchanged. The next comparison must pin both old and new code under contemporaneous load.
