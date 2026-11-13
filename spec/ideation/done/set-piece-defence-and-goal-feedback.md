# IDEATION set-piece-defence-and-goal-feedback
> st:converted@261113 | Keep set-piece movement coherent, identify ball ownership and make goals unmistakable during observation.

## vision
Measured corner traces move both sides, while the default path retains an attacking group and disperses defensive placement. Viewers need coherent set-piece roles, a visible current ball-controlling side and a short, readable goal moment, including at high observation speeds.

## explored
- [o] Add explicit follow-up tasks: none of the nine remaining tasks names corner-defence movement or a goal-specific presentation sequence. MATCH-12/17/18 already cover continuity, coordination and set pieces broadly; WEB-46/52 cover general motion and achievement feedback.
- [o] Base diagnosis on actual measurements in `docs/benchmarks/set-piece-motion-261022.md`: eight full matches, 89 corners; the default path moves both sides and its isolated placement/release stage retains the attacking group while defensive placement disperses. Assess preparation, the delivery and the second ball on both model paths without assuming the reported team or a wholly stationary side.
- [o] Show the controlling team and recorded carrier in ordinary observation. During flight, contested play or missing historical ownership, use only authoritative recorded side information or a neutral state.
- [o] Briefly hold observation on a recorded goal, show a GOAL cue and emphasize the updated scoring-side scoreboard value, then continue at the chosen speed.
- [o] Use the same factual goal cue for either side, distinguish the scoring team, keep controls reachable and provide static emphasis under reduced motion.
- [o] Keep all goal feedback in presentation; settled scores, statistics, seeds and career time retain their existing authority. Add an explicit presentation exception to the uniform running-speed policy.
- [x] Longer player celebrations, camera cuts, sound and other set-piece improvements can be discussed separately; no additional scope is selected here. ← not selected (WEB-105 later added a recorded goal clip)

## shape
- Format migration 261026: previous converted status restored to ready pending a coverage audit; historical questions and decisions are preserved. Parked during the module-boundary refactor; this restoration authorizes no product changes.
- flow: responsive set-piece preparation → delivery and defensive contest → second ball or recorded goal → brief goal hold with GOAL cue and scoreboard emphasis → recorded restart at the selected speed.
- v1: measured corner/free-kick team-shape lifecycle, visible ball-controlling team and carrier, a short goal hold, a GOAL cue and scoreboard emphasis in live observation and ordinary archived replay.
- boundary: existing tactics, recorded historical detail and settlement remain authoritative; seeking does not queue celebrations for skipped goals.
- Conversion note (open until archive): the requested scope was converted into T348/T349/T350, all done, with retained measurement evidence; longer celebrations, camera cuts, sound and further observed issues stay unselected (explored [x] above).
- Archived 261113: goal feedback and possession cues are carried by WEB-94 and WEB-95, and set-piece defence by MATCH-18, now drawn by the presentation-only staging (MATCH-39) that replaced T348's detailed-engine correction (T838–T845).

## domains
- [o] MATCH: Legacy scope MATCH →MATCH; r20 makes defensive marking, cover, second-ball and keeper reactions explicit under MATCH-18 and recognizes the goal cue as a presentation transition under MATCH-12; T348 owns the measured placement/release correction; the report distinguishes the current default from the candidate path.
- [o] WEB: Legacy scope WEB →WEB; r124 defines WEB-94 goal feedback and aligns WEB-32's running-speed policy; T349 implements it. r125 adds WEB-95 normal-view possession cues, implemented by T350.

## open
- -
