# IDEATION play-pace-and-owner-surfaces
> st:ready@261027 | A batch of owner-driven changes: automatic play without the match-day pause and with every result-identical speed-up, then a clearer split of what the owner can do, what he reads and what his choices have set, and a less scattered home.

## vision
- Problem (owner, 261027): automatic play now stops for 2 s on every own match day; the owner wants it gone and the remaining halt cut as far as possible. Separately, actions, dashboards and the state set by the owner's own choices are not clearly told apart, and home spreads its information around.
- Target: the owner letting seasons run on automatic play, and reading or changing the club from home and the management views.
- Core value: play that flows at the chosen pace without results ever changing, and screens where it is obvious what can be done, what is happening and what is in force.

## explored
- [o] Remove the ≥ 2 s match-day moment and its animation; an own fixture day is shown at the pace like any other day ← owner 261027 (supersedes ideation/match-day-progress's beat)
- [o] Keep the 경기 결과 알림 preference, off by default, shown once our fixture's day is shown ← owner 261027
- [o] Cut the remaining halt as far as result-identical work allows, not to a hard "no stall at x10" target ← owner 261027
- [o] Every measurement plays a fresh 1950 founding day by day, drops the first own match as warm-up and times the next 5 own match days, interleaving baseline and candidate; a candidate counts only with a world hash identical to the baseline ← owner 261027: one match is too few
- [o] Adopt all four result-identical directions together, measured integrated 261027 (ENG/ESP/GER, worlds identical in every run and over a full season):
  - helper workers for an own match day's other league fixtures while the engine plays our match: own match day 0.54–0.77× (biggest gain); only on own match days, since a day of other clubs' fixtures alone got slower (about 0.43 → 0.49 s) from the copy cost
  - cuts of repeated work in the detailed engine: about 0.9× of the match alone
  - lighter view publication: transfer 12 → 2 ms, main-thread apply 13 → 9 ms, deltas byte-identical
  - computing ahead of the shown date: 3 days at x1/x2, 5 at x5, 7 at x10 ← owner 261027; with the above, x10 over a season 54 → about 10 stalls (longest about 0.9 s), 4.3 → about 8.9 days a second; x1/x2/x5 practically none
- [o] The owner's stop shows the days already computed at the pace and then stops (at most about 0.7 s at x10, no skipped day) ← owner 261027; rolling back to the shown day needs a world copy of 70–230 ms per day, beyond x10's 100 ms
- [o] Nothing is computed past a day that will stop the clock, so stops land on the same day; entering the owner office or hiding the tab shows the computed days at once, since nobody sees the calendar there (recommendation)
- [x] Reuse non-owned squads across fixtures ← already cached per year; measured 0.99× (noise). Rebuilding only the clubs touched by a transfer or retirement (about 0.25 s on such days, 0.5–0.8 s a season) is a later candidate
- [x] Hide the halt with an animation instead of speed-ups ← the owner removed the moment
- [x] Promise one day per 0.1 s at x10 ← needs the own match itself about 3× faster, which only result-changing engine work could give
- [?] Split what the owner sees into actions (one-off, with cost and effect), standing choices (in force until changed: direction, ticket price, investment dials, 결재 라인, tactics, training plan, progression mode) and dashboards (results he cannot set: rank, strength, fatigue, morale, cash). Recommendation: keep navigation by area and give every screen the same order — status on top, choices in force in the middle, actions below; optionally one page listing every choice in force
- [?] Where the mix shows today: the owner office mixes standing policy, one-off works and finance figures; 결재 라인 mixes who decides with play preferences; home's team-state tiles are dashboards that open action sheets, some of which change standing settings; actions live under two schemes (tabs for squad/training, home entrance for the office)
- [?] Home scatter: season card and NEXT MATCH sit at opposite ends; date in the info row, round in the season card; the stadium scene takes room without facts; the office entrance sits among status cards. Defining home as status + what needs attention (after the split above) gives the ordering rule

## shape
- flow: automatic play computes up to N days ahead → the calendar shows one day per pace interval → a stopping day ends computing ahead and stops on its day; the owner's stop shows what is computed, then stops
- v1 (converted): no match-day pause; helper workers on own match days; engine repeated-work cuts; lighter view publication; computing ahead 3/5/7 days; identical results / not: result-changing engine work, a hard x10 rate, squad-rebuild scoping
- next slice: the action / standing choice / dashboard split and home ordering, still being discussed with the owner

## domains
- [o] WEB: WEB-18 automatic play (no moment, computing ahead, stops), WEB-11 (no NEXT MATCH animation), WEB-64, WEB-97, WEB-98 →WEB-18
- [o] SAVE: SAVE-8 background saves during computing ahead →SAVE-8
- [o] ARCH: ARCH-6 helper workers beside the sole-writer engine →ARCH-6
- [?] WEB: action / standing choice / dashboard structure across views; home ordering (WEB-11, WEB-44, WEB-39)

## open
- Which axis the action / standing choice / dashboard split uses (navigation, a per-screen order, or a page of choices in force), and which concrete moments confused the owner
- What home must answer first, and whether the stadium scene stays
