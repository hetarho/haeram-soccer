# HIST Durable metrics and history
> r1 | Define the implemented browser-demo behavior for durable metrics and history.

## decisions
- HIST-1 [o] Always retain own-club season/career metrics, own settled match scores/player contributions/highlights, personnel tenures and meaningful commercial decisions.
- HIST-2 [o] Always retain all implemented-country season standings/champions/cup outcomes and European standings/honors. NPC past per-frame/per-action traces and full individual match-stat archives are not collected.
- HIST-3 [o] NPC current-season stats and reproducible current roster support comparison. Career/season summaries, not duplicated object graphs, represent older NPC history.
- HIST-4 [o] Archive compact IDs and numeric aggregates; UI pagination or chart sampling never deletes source records.
- HIST-5 [o] Founding is the first history entry; promotion, relegation, tactics application/refusal, manager resignation, recruitment, retirement, campaigns, sponsors and currency changes append facts.
- HIST-6 [o] Metric scopes separate domestic, European, current season and own career; ratios expose denominators and sample size.
- HIST-7 [o] Statistical changes after an action are observations with markers, not proof of causality; show relevant period and actual applied changes.
- HIST-8 [o] No automatic expiry/pruning, data uploads or silent loss on save/import. Capacity errors keep the current save and offer export.
- HIST-9 [o] Validate 100-season own-club and global summary retention within the ARCH save budget.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
