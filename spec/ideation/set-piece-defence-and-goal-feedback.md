# IDEATION set-piece-defence-and-goal-feedback
> st:converted@261022 | Make set-piece defending visibly responsive and make goals unmistakable during observation.

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
- MATCH →MATCH: r20 makes defensive marking, cover, second-ball and keeper reactions explicit under MATCH-18 and recognizes the goal cue as a presentation transition under MATCH-12; T348 implements the defensive response.
- WEB →WEB: r124 defines WEB-94 goal feedback and aligns WEB-32's running-speed policy; T349 implements the cue, hold and scoreboard emphasis.

## open
- Requested scope is converted into T348/T349. Longer player celebrations, camera cuts, sound and additional observed issues remain unselected; they can be recorded when concrete examples are available.
