# IDEATION set-piece-defence-and-goal-feedback
> st:ready@261022 | Make set-piece defending visibly responsive and make goals unmistakable during observation.

## vision
During corners the attacking side appears to move while the defence does not respond. Both sides should visibly play the scene, and a goal should have a short, readable moment before play continues, including at high observation speeds.

## explored
- [o] Add explicit follow-up tasks: none of the nine remaining tasks names corner-defence movement or a goal-specific presentation sequence. MATCH-12/17/18 already cover continuity, coordination and set pieces broadly; WEB-46/52 cover general motion and achievement feedback.
- [o] Investigate and fix defending through corner preparation, the delivery, the aerial contest and the second ball. Initial defensive placement already exists; verify tracking, cover and goalkeeper response rather than assuming defenders have no placement code.
- [o] Briefly hold observation on a recorded goal, show a GOAL cue and emphasize the updated scoring-side scoreboard value, then continue at the chosen speed.
- [o] Use the same factual goal cue for either side, distinguish the scoring team, keep controls reachable and provide static emphasis under reduced motion.
- [o] Keep all goal feedback in presentation; settled scores, statistics, seeds and career time retain their existing authority. Add an explicit presentation exception to the uniform running-speed policy.
- [?] Longer player celebrations, camera cuts, sound and other set-piece improvements can be discussed separately; no additional scope is selected here.

## shape
- flow: responsive set-piece preparation → delivery and defensive contest → second ball or recorded goal → brief goal hold with GOAL cue and scoreboard emphasis → recorded restart at the selected speed.
- v1: corner and delivered-free-kick defending, a short goal hold, a GOAL cue and scoreboard emphasis in live observation and ordinary archived replay.
- boundary: existing tactics, recorded historical detail and settlement remain authoritative; seeking does not queue celebrations for skipped goals.

## domains
- MATCH: make defensive marking, cover, second-ball and keeper reactions explicit under MATCH-18; recognize the goal cue as a presentation transition under MATCH-12.
- WEB: define the goal cue and scoreboard feedback, with speed, seek, pause, visibility and reduced-motion behavior; align WEB-32's running-speed policy.

## open
- The requested follow-up tasks are ready for SSOT conversion. Exact visual styling and the short hold duration can use the existing presentation conventions during implementation.
