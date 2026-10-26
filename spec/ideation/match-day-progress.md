# IDEATION match-day-progress
> st:ready@261026 | An own match day is a steady visible beat of at least 2 s at every pace, and visible automatic play never skips days.

## vision
- Problem (owner, 261026): T465's late-step indicator (a small spinner and 경기 진행 중… beside the transport, shown only when a step outlasts one pace interval, followed by catch-up days) is not what the owner wants. At x10 the calendar still halts on match days and then jumps ahead.
- Target: the owner letting seasons run on automatic play, at any pace.
- Core value: the owner sees each match being played as a calm, steady moment, and the calendar never jumps while he is looking.

## explored
- [o] Reopen the x10 presentation from ideation/save-storage-and-fast-pace (converted 261026 by autopilot q7m3 into WEB r154 / T465) ← owner 261026: the indicator shipped is not the wanted one; the IndexedDB move (T464) stays as built
- [o] A match day shows that the match was played for at least 2 s, whatever the pace ← owner 261026: "최소 표시 시간을 2초 정도로 해서 안정적으로 경기가 진행됐다는 걸 보여주고 싶은 거야, 속도가 몇이든"; the time is a presentation floor, the computation (about 0.9 s at most measured) runs inside it
  - Consequence (measured 261026): a week at x10 becomes about 0.6 s of ordinary days plus 2 s, about 2.7 days a second instead of about 7.8; at x1 about 8 s a week instead of 7 s
- [o] Catch-up (a step carrying several owed days at once) happens only when the page was hidden or away (WEB-64); visible automatic play never shows a skipped day ← owner 261026: "탭이 비활성화되거나 그럴 때만 … 일반적인 진행 상태에서는 절대로 나오면 안 돼"; today a late visible step carries up to 5 days (`MAX_STEP_DAYS`, T465 kept it)
- [x] Keep today's visible catch-up after a late step (autopilot 261026, WEB r154) ← the owner never wants a jump while looking
- [x] T465's indicator as the match-day presentation ← owner 261026
- [o] Only own fixture days get the moment; a day with only other clubs' fixtures plays at the chosen pace ← owner 261026; x10 about 2.7 days a second (with every match day about 2)
- [o] The moment plays in the home's next-match card, which turns into the match being played; on any other view the same animation shows small in the bottom control area ← owner 261026 chose the next-match card; the other-view fallback is the recommendation, since automatic play also runs on other views
- [o] The moment is an animation only: no clubs, score, minute or other results ← owner 261026
- [o] After the moment play moves on to the next day; a brief result notice (our score, e.g. 해람 FC 2–1 런던 시티, a few seconds, opening the match record when tapped) is a checkbox the owner sets, off by default ← owner 261026 asked for a checkbox; off by default and its place beside the automatic-play preferences in the owner's office are the recommendation
- [o] The floor applies only while the owner is looking: a hidden or away page plays its match days without the moment, catching up as WEB-64 allows ← nobody sees it; WEB-64's wall-clock pace stays
- [o] A watched match replaces the moment, and a fixture played through from the match-eve card gets the same moment on its day ← one rule for every unwatched own match (recommendation)
- [o] A visible ordinary day that computes late (a slow device) is waited for without skipping and without an indicator ← no skipped days while visible, and the late-step indicator is what the owner rejected (recommendation)
- [o] Stopping the clock during the moment ends it at once; the match day is already settled ← the owner's stop always wins (recommendation)
- [o] Manual mode (다음 이벤트) is unchanged; the moment belongs to automatic play ← manual play stops before matches on its own (recommendation)
- [x] Show our fixture (clubs, crests, competition) or reveal the final score inside the moment ← owner 261026 chose an animation only
- [x] Show the moment in the middle of the screen or as a widened transport row ← owner 261026 chose the next-match card
- [?] With the fixed beat, the result-identical performance steps (parallel aggregate workers, detailed-engine repeated-work cuts) matter only where a match day computes past 2 s or ordinary days run late; revisit after the beat is in play

## shape
- Format migration 261026: previous converted status restored to ready pending a coverage audit; historical questions and decisions are preserved. Parked during the module-boundary refactor; this restoration authorizes no product changes.
- flow: ordinary days at the chosen pace → own match day: a ≥ 2 s match-day moment while it computes → the next day at the chosen pace, no skipped days
- v1: the ≥ 2 s animation in the home's next-match card (small in the bottom controls elsewhere) on own fixture days at every pace; no visible catch-up or late-step indicator; the result-notice checkbox / not: clubs or score in the moment, other clubs' match days, a beat while hidden, manual mode, performance work

## domains
- [o] WEB: WEB-18 automatic play (replaces r154's late-step indicator and visible catch-up), WEB-64 (catch-up only for hidden or away time) →WEB-18

## open
- Performance steps: after the owner has played with the beat
