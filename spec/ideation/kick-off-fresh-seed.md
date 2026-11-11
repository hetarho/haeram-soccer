# IDEATION kick-off-fresh-seed
> st:open@261111 | Draw a fresh seed at kick-off and save it, so reloading before a match gives a different match while a played match stays reproducible.

## vision
- Problem: the same save always plays the same match (→ARCH-5), which the owner's first concept of the game — matches rolled live — did not have; a reload before a lost match can change it only by changing something else first.
- Target: an owner who expects a match not yet played to be open.
- Core value: an unplayed match feels undecided, while everything already played can still be reproduced.

## explored
- [?] A seed drawn when the match kicks off and stored with the fixture ← it changes ARCH-5's "the same inputs produce the same facts however time is advanced": a round advanced today and one advanced after a reload would differ; raised by the planner 261111 as a middle way, not asked for by the owner.
- [x] Unseeded randomness drawn live while watching ← it gives up reproducing a save's bug, comparing a rule change on the same seeds, and watching and skipping giving the same result (ideation/done/match-script-and-staging).

## shape
- flow: match eve → kick-off draws and stores the fixture's seed → the match is settled from it → the stored seed reproduces it.
- v1: undecided / not: live unseeded draws.

## domains
- [?] ARCH: what names a fixture's draw — the world seed and the fixture, or a seed drawn and stored at kick-off

## open
- Whether the owner wants an unplayed match to differ after a reload at all.
