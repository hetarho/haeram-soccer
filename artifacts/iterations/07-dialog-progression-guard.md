# Cycle 7: dialog-progression-guard

Review: New recruitment comparison sheets expose a shared issue: generic dialogs do not pause the progression controller, and feature-local booleans can release another dialog.

Design: Keep player and budget facts stable while the owner compares candidates or confirms a decision.

Contract: WEB@5. Task: T018.

Verification: 6 progression tests; type/lint/format/build; built generic comparison auto-pause, source cleanup and explicit restart.

Outcome: Each generic dialog owns a separate auto-progression suspension; closing leaves the owner in control.
