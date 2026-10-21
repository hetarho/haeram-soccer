# IDEATION manager-achievements
> st:converted@261021 | Show what each manager achieved for our club alongside his tenure.

## vision
- Problem: manager history tells the owner when managers served, but does not make their achievements visible.
- Target: owners looking back at the people who shaped their club's history.
- Core value: remember what each manager left behind, with accomplishments tied to his actual time at our club.
- Evidence: the owner requested achievements beyond service dates. The current manager-history view renders appointment/departure events and the current manager's starting year and philosophy (apps/web/src/ui/RecordsRoom.tsx, ManagerSeasons).

## explored
- [o] Enrich own-club manager history with accomplishments alongside service dates.
- [o] Planning scope: prepare implementation tasks only. Use league/cup titles, promotions, best league finishes, own-match results and longest winning/unbeaten runs as the factual first version.
- [o] Label the season, competition and division/group. Compare best final league ranks within the same country/division/group; a lower-division title keeps its actual scope.
- [o] Show a compact summary beside each tenure, with contextual links to the club-season record and a return to the inspected manager/list position.
- [o] Preserve known earlier dates and readable old events. New structured tracking starts at founding or supported writer activation; incomplete attribution is shown as incomplete, never as no achievements or invented zero totals.
- [o] Keep repeat appointments and interim managers as distinct tenures. Renewals/tactic changes do not start another tenure.
- [o] Confirmed mid-season attribution: credit outcomes to the responsible tenure when the cup final, final league table or promotion outcome is actually settled. Label shared-season context; a later appointment never takes an earlier cup title. Earlier managers retain their own attributed match results.
- [o] Own-match W-D-L and runs use 90-minute results across official own competitions. Runs can cross seasons but stop at manager changes or unattributed matches; distinguish an ongoing run and partial tracking from complete tenure records.
- [o] Keep the first version focused on our club. Other-club honours, deepest-cup-run rankings, combined reappointment rankings, generated praise and claims of sole causation are later work.

## shape
- flow: records → manager history → tenure and factual accomplishments → relevant club-season record → preserved manager/list context.
- v1: current/former/interim own-club tenures, dated honours/promotions, best league finishes, recorded match totals/runs and honest coverage states. Structured attribution survives save/export/import and the summary loads on demand.
- Scope excludes broader other-club careers, subjective manager ratings, a deepest-cup-run ranking and new gameplay/reward mechanics.
- delivery: T304 prepares pure fact/query modules and T305 prepares a props-driven view in new files alongside earlier work. T306 integrates engine/save changes after T286, then T307 connects worker/navigation and T308 proves browser/capacity continuity. This changes task boundaries, not the product rules.

## domains
- WEB: per-tenure accomplishment summaries, coverage states and contextual club-season navigation (WEB-92). →WEB
- HIST: stable own-manager tenures, settlement-time attribution and factual summary/coverage rules (HIST-18/19). →HIST
- SAVE: prospective activation and lossless retention of structured attribution within existing budgets (SAVE-24). →SAVE

## open
- No blocking questions for the scoped first-version tasks. Broader manager-career comparisons and deepest-cup-run rankings require separate planning.
