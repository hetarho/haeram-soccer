# KIT Club identity and match kits
> r2 | Let owners design a recognisable club and see its selected shirts in match observation.

## decisions
- KIT-1 [o] A club has representative colours, a crest design and three named outfield-shirt designs: home, away and third.
  - Home starts from the representative colours; away and third may use other colours.
  - A crest's background pattern and a shirt's pattern are independent choices.
- KIT-2 [o] Crest editing starts with ready-made designs whose 1–3 editable colour regions are visible in the preview.
  - A ready-made design may be used after recolouring without composing its parts.
  - Optional 직접 꾸미기 starts from the selected design and allows separate outer-shape, background-pattern and emblem choices.
  - The initial component catalogue retains the six shapes, ten background patterns and twenty emblems in `apps/web/src/ui/crests.ts`; its existing palette remains available alongside the custom colour choice.
  - Selected colours and the resulting crest must agree with the preview; never introduce an undisclosed automatically chosen secondary colour after founding or applying an edit.
- KIT-3 [o] V1 customises outfield-shirt colours and patterns. It has no separate shorts/socks colour controls and no manual goalkeeper-kit editor.
- KIT-4 [o] Representative colours and outfield shirts use 1–3 configured colours, starting with two: main and secondary; the optional third is an accent.
  - Shirt regions are main field, pattern/secondary field and optional trim. Show only the colour regions used by the selected design.
  - A one-colour crest uses negative space or explicitly previewed fixed outlines to keep its emblem visible; disclose fixed neutral details in the preview instead of adding a hidden secondary colour.
- KIT-5 [o] The initial shirt-pattern catalogue has eight choices: solid, vertical stripes, horizontal hoops, halves, chest band, diagonal sash, checks and chevron.
- KIT-6 [o] Match kits are selected automatically to avoid clashes, and the owner may change their own shirt choice before the fixture is played.
  - Automatic selection remains sufficient when the owner skips preparation or disables the match-eve stop; selecting a kit adds no mandatory event acknowledgement.
  - A manual choice belongs to the named upcoming fixture, not every future fixture or an already settled match.
  - Only the selected home/away/third role changes; a fixture-level choice never edits its saved design.
- KIT-7 [o] Automatic selection prioritises a distinguishable pairing from both sides' saved shirts, considering the visible pattern regions and grass rather than representative colours alone.
  - If all saved pairings clash, use the most distinguishable available pair and show a warning without introducing a mandatory stopping event.
  - A manual choice that clashes shows the warning and recommends a more distinguishable available alternative, but the owner may confirm that choice.
  - Never silently repaint a shirt, modify a saved palette or invent an unconfigured kit to remove a clash.
- KIT-8 [o] Goalkeeper colours are chosen automatically to remain distinguishable from the outfield sides and the other goalkeeper.
  - Distinction concerns the shirts actually selected for this fixture, not only the clubs' representative colours.
- KIT-9 [o] Club-management editing changes the own club's representative colours, crest and shirt designs through explicit apply; opening, previewing or cancelling an editor does not change the applied identity.
  - Read-only viewers may inspect identity; only the writing owner may commit edits under →SAVE-6.
  - Editing another club's identity is not an owner action.
- KIT-10 [o] Changing representative colours preserves all already designed shirts. An explicit 대표색 적용 action copies the representative colours into only the shirt being edited, preserving its pattern and leaving the other shirts unchanged.
- KIT-11 [o] Every opponent has a stable crest and home/away/third shirt designs available to automatic match selection.
  - Initial designs are reproducible from that world and club; clubs added later receive their own designs.
  - Editing the own club must not reassign other clubs' existing identities.
  - The owner is not required to configure opponents to start or observe matches.
- KIT-12 [o] Applying an identity edit updates the current club screens immediately and affects fixtures not yet played; a settled match keeps the designs used for that match.
  - Retained playback preserves both actual crests, the selected outfield-shirt colours/patterns and goalkeeper colours. Applying an edit while watching never changes the ongoing playback's appearance.
  - Historical appearance exists only where it was recorded. Older playback without it says the kit was not recorded; do not substitute today's design as a claim about that match.
  - These appearance facts follow existing playback retention, not a new archive of every world's historical kit or unretained match action.
- KIT-13 [o] Choosing colours, crest parts, patterns or a kit changes presentation only; it does not alter player ability, money, reputation, fixture results, random sporting outcomes or the game date.
- KIT-14 [o] Founding offers six complete ready-made crests, one for each existing outer shape, and complete editable home/away/third shirt drafts before customisation.
  - Default representative colours are main and secondary (→KIT-4). The owner may change only the designs they want; skipping the editor never blocks founding.
  - Founding uses the previewed selections; the initial drafts are not rerolled after confirmation.
- KIT-15 [o] A supported career without the new identity information keeps every club's current visible crest, representative colours and recorded gameplay facts; supply only the missing shirt designs reproducibly.
  - Keep the own club's founding colour. Do not reassign other clubs' existing crests when adding shirts or editing the own club.
  - Missing historical kit information remains explicitly unrecorded (→KIT-12); it is not backfilled as an invented fact.
  - Compatibility and activation follow →SAVE-19/21; this identity feature grants no additional career-reset or legacy-gameplay conversion permission.
- KIT-16 [o] V1 excludes image uploads, freehand drawing, sponsor logos and fabric textures from the identity editor. It adds no cosmetic purchases or performance modifiers.

## flow
- Crest: ready-made design → colour regions → optional component composition → preview → explicit use/apply.
- Founding: club identity draft → home/away/third designs → pitch preview → found with the selected identity.
- Match: automatic pairing → optional own-shirt override for that fixture → observe the selected shirts.
- Management: applied identity → edit draft → preview → apply or cancel; effect timing follows →KIT-12.

## constraints
- KIT owns identity and selection policies; →WEB-49/86/87/88 own their presentation and →SAVE-20/21 own persistence and compatibility.
- Cosmetic options do not authorise changes to gameplay, background progression, retained-history lifetimes or the rules-4.0.0 boundary.
- The storage, responsiveness and reference-device budgets remain →SAVE-4/13 and →WEB-19; pattern detail must remain legible at the actual match scale.

## chg
- r2 261019 KIT-4✎ open→1–3 colours/default two; KIT-5✎ open→eight patterns; KIT-7✎ open→clash warnings/manual allowed; KIT-10✎ open→explicit palette reuse; KIT-12✎ open→future fixtures/frozen replay; KIT-14✎ open→six crests/three kits; KIT-15✎ open→preserve supported careers; KIT-16✎ open→editor exclusions
- r1 261019 initial
