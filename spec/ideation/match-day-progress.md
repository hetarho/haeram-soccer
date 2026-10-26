# IDEATION match-day-progress
> st:open@261026 | An own match day is a steady visible beat of at least 2 s at every pace, and visible automatic play never skips days.

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
- [?] With a fixed match-day beat, the result-identical performance steps (parallel aggregate workers, detailed-engine repeated-work cuts) only matter where a match day computes longer than 2 s (slow devices) or ordinary days pile up; revisit after the beat is in play

## shape
- flow: ordinary days at the chosen pace → own match day: a ≥ 2 s match-day moment while it computes → the next day at the chosen pace, no skipped days
- v1: the ≥ 2 s match-day moment at every pace; no visible catch-up / not: (to settle)

## domains
- WEB: WEB-18 automatic play (replaces r154's late-step indicator and visible catch-up), WEB-64 (catch-up only for hidden or away time)

## open
- Which days get the moment: own fixtures only, or also days with only other clubs' fixtures (about 0.3 s today)?
- Where and how large: the transport row, a card in the middle of the screen, the home's next-match card turning into "playing", or another place?
- What it shows: an animation only, our fixture (clubs, crests, competition), the final score revealed at the end, other results?
- After the 2 s: does the result stay on screen (a card, a toast) or does play simply move on?
- How it sits with the match eve stop (경기 전날 알림): when the owner plays a fixture through from the eve card, does the next day show the same moment?
- What happens when a visible step is late on an ordinary day (a slow device): wait without skipping, with or without a small indicator?
