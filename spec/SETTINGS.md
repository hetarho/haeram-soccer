# SETTINGS
> Package behavior the owner chose. Show or change with /gusta-preference (`vibe settings`); decide unset (?) keys with /gusta-init. A missing key uses its default.

- land: main  # branch finished work lands on (gusta-start session end, gusta-self-improve-remote, work groups); current = stay on the branch the work was done on
- push: true  # true = push land to the remote once at session end or loop stop (every push runs remote CI)
- plan: ?  # planning branch where task IDs and SSOT revs are numbered (vibe plan-sync/plan-push); ? = land when it names a branch, else the repository default branch; - = this checkout only
