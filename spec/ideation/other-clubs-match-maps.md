# IDEATION other-clubs-match-maps
> st:open@261111 | Keep and show a pass network, and later other maps, for fixtures the own club does not play, where storage allows.

## vision
- Problem: post-match material exists for the own club's matches only (→MATCH-25, →HIST-16); the owner may want to study a rival or a signing target's club the same way.
- Target: the owner preparing for an opponent or judging a player he does not own.
- Core value: the same map for any fixture he cares about, without filling the save.

## explored
- [?] Which fixtures keep a pass network, by platform: the own league and the cups the own club plays in on the web beta (a few hundred fixtures a season, about 150–200 KB by the planner's estimate, against the 6 MiB checkpoint rewritten whole on every save); every fixture on mobile, where storage is per match; an online server would multiply any stored size by its users, so maps may stay on the device.
- [?] How the numbers are made for a fixture without a script: only the own club's matches are scripted (→MATCH-22/38), and a script a fixture would cost a world season's 10,000 fixtures too much, so pairs and average positions would need a cheaper draw from the record.

## shape
- flow: fixture settled → (fixtures in scope) pass network numbers drawn and kept for the season → opened from the fixture lists.
- v1: undecided / not: maps for every fixture on the web beta.

## domains
- [?] HIST: which fixtures keep a pass network, by platform
- [?] MATCH: a draw of pass pairs and average positions for a fixture without a script

## open
- Whether the owner wants this before the mobile release.
