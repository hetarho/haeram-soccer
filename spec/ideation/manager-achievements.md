# IDEATION manager-achievements
> st:open@261021 | Show what each manager achieved for our club alongside his tenure.

## vision
- Problem: manager history tells the owner when managers served, but does not make their achievements visible.
- Target: owners looking back at the people who shaped their club's history.
- Core value: remember what each manager left behind, with accomplishments tied to his actual time at our club.
- Evidence: the owner requested achievements beyond service dates. The current manager-history view renders appointment/departure events and the current manager's starting year and philosophy (apps/web/src/ui/RecordsRoom.tsx, ManagerSeasons).

## explored
- [o] Enrich own-club manager history with accomplishments alongside service dates.
- [?] Prioritise league titles, cup wins and promotions, naming the season and competition or division.
- [?] Include best league finish or deepest cup run so a tenure without a trophy can still have a meaningful summary. Keep the division and competition visible when comparing results.
- [?] Supplement honours with notable recorded runs or club records achieved during that tenure; distinguish observed team results from claims that the manager alone caused them.
- [?] Show a concise accomplishment summary beside each tenure and let the owner open the relevant season record for context.
- [?] Use recorded facts for historical and current managers; distinguish an unavailable old record from a tracked tenure with no qualifying accomplishment.
- [?] Treat separate appointments of the same person as separate tenures, with an optional combined view only if the owner wants one.

## shape
- Proposed flow: records → manager history → tenure and accomplishments → relevant club-season record.
- Proposed v1: own-club managers, service dates and a small factual accomplishment summary. The accomplishment categories and presentation remain open.
- Scope still to decide: statistical detail, narrative descriptions and achievements at other clubs.

## domains
- WEB: candidate extension to the manager-history view (WEB-54), accomplishment summaries and season-record navigation.
- HIST: candidate rules for linking recorded honours/results to manager tenures and explaining unavailable older history (HIST-1/7/13/14).
- STAFF: candidate tenure boundaries for mid-season changes and repeat appointments, if existing appointment facts need clarification.

## open
- Which accomplishments belong in the first version: titles/promotions only, or best finishes and notable runs too?
- Should the summary remain visible in the history list, or open in a manager detail view?
- How should a mid-season handover credit a season-long title or promotion, and should this differ from a cup won on a specific date?
- How should older careers with incomplete attribution and current managers with unfinished seasons appear?
