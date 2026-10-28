# KIT Club identity and match kits
> r4 | Let owners design a recognisable club and see its selected kits in match observation.

## decisions
- KIT-1 [o] The editor offers exactly three colour choices: 홈 (home), 어웨이 (away) and 세컨 (third). Each is its named shirt’s base colour.
  - The stored representative palette follows home, away and third after a colour edit.
  - A crest's background pattern and a shirt's pattern are independent choices.
- KIT-2 [o] Crest editing starts with ready-made designs coloured from the home and away choices (→KIT-10).
  - A ready-made design may be used without composing its parts.
  - An explicit 랜덤 action chooses a different composition from the supported shapes, background patterns and emblems, preserving the selected colours and all shirt designs. This uses presentation randomness only (→KIT-13).
  - Optional 직접 꾸미기 starts from the selected design and allows separate outer-shape, background-pattern and emblem choices.
  - The initial component catalogue retains the six shapes, ten background patterns and twenty emblems in `apps/web/src/ui/crests.ts`; its existing palette remains available alongside the custom colour choice.
  - Selected colours and the resulting crest must agree with the preview; never introduce an undisclosed automatically chosen secondary colour after founding or applying an edit.
- KIT-3 [o] Each of home, away and third is a kit: its shirt (→KIT-1/4/5), shorts and socks.
  - Shorts and socks colours are free choices per kit, not limited to the three named colours.
  - A new draft starts with shorts in the shirt's second colour (→KIT-4) and socks in its base colour. Until the owner sets them they follow named-colour edits (→KIT-10); once set they keep their colours.
  - Kits have no separate sleeve, collar or boot controls; →KIT-16's exclusions still apply.
- KIT-4 [o] Show exactly three named colour controls for the club palette under →KIT-1, without add/remove controls, independent crest/shirt-pattern region controls or a separate palette-reuse action. Shorts, socks (→KIT-3) and the goalkeeper kit (→KIT-8) have their own controls.
  - Home patterns use away as their second colour; away and third patterns use home. Existing trim, when present, follows that second colour. Plain shirts omit the unused pattern region.
  - The crest uses home for its field and away for its pattern and emblem, with no separately chosen accent. Disclose any fixed neutral outline in the preview.
- KIT-5 [o] The initial shirt-pattern catalogue has eight choices: solid, vertical stripes, horizontal hoops, halves, chest band, diagonal sash, checks and chevron.
- KIT-6 [o] Match kits are selected automatically to avoid clashes, and the owner may change their own shirt choice before the fixture is played.
  - Automatic selection remains sufficient when the owner skips preparation or disables the match-eve stop; selecting a kit adds no mandatory event acknowledgement.
  - A manual choice belongs to the named upcoming fixture, not every future fixture or an already settled match.
  - Only the selected home/away/third role changes; a fixture-level choice never edits its saved design.
- KIT-7 [o] Automatic selection prioritises a distinguishable pairing from both sides' saved shirts, considering the visible pattern regions and grass rather than representative colours alone.
  - If all saved pairings clash, use the most distinguishable available pair and show a warning without introducing a mandatory stopping event.
  - A manual choice that clashes shows the warning and recommends a more distinguishable available alternative, but the owner may confirm that choice.
  - Never silently repaint a shirt, modify a saved palette or invent an unconfigured kit to remove a clash.
  - Pairing is judged on the shirts as they appear on the player figures (→MATCH-36); shorts and socks travel with their kit and are never mixed across kits.
- KIT-8 [o] The club designs one goalkeeper kit: a shirt in any →KIT-5 pattern with freely chosen base, second and trim colours, plus shorts, socks and gloves colours. ← one designed kit keeps the editor small while the fallback keeps every fixture readable
  - In a fixture where it is not distinguishable from either side's selected outfield kit or the other goalkeeper, that fixture alone uses an automatically chosen distinguishable goalkeeper colour, shown in match preparation (→WEB-88) without a mandatory stop. The fallback never edits the saved goalkeeper kit.
  - Distinction concerns the kits actually selected for this fixture, not only the clubs' representative colours.
  - A club without a designed goalkeeper kit, including every opponent, uses automatically chosen distinguishable goalkeeper colours. Automatic colours avoid designed kits.
  - A new draft starts from an automatically chosen colour distinguishable from the club's own three kits.
- KIT-9 [o] Club-management editing changes the own club's representative colours, crest and shirt designs through explicit apply; opening, previewing or cancelling an editor does not change the applied identity.
  - Read-only viewers may inspect identity; only the writing owner may commit edits under →SAVE-6.
  - Editing another club's identity is not an owner action.
- KIT-10 [o] Changing any named colour updates the draft’s three-colour palette, corresponding shirt bases, linked pattern/trim regions and home/away crest colours immediately, preserving every chosen pattern and crest component.
  - Opening an existing career editor preserves its saved design until an edit; explicit apply/cancel and historical appearance still follow →KIT-9/12. New founding drafts start with these linked colours.
- KIT-11 [o] Every opponent has a stable crest and home/away/third shirt designs available to automatic match selection.
  - Initial designs are reproducible from that world and club; clubs added later receive their own designs.
  - Editing the own club must not reassign other clubs' existing identities.
  - The owner is not required to configure opponents to start or observe matches.
  - Opponent kits carry shorts and socks by →KIT-3's starting rule; opponents have no designed goalkeeper kit (→KIT-8).
- KIT-12 [o] Applying an identity edit updates the current club screens immediately and affects fixtures not yet played; a settled match keeps the designs used for that match.
  - Retained playback preserves both actual crests and the kits actually worn: outfield shirts with their colours/patterns, shorts and socks, and each goalkeeper's kit or fallback colour. Applying an edit while watching never changes the ongoing playback's appearance.
  - Playback recorded with shirts but without shorts, socks or a goalkeeper kit draws them by →KIT-3's starting rule from its recorded shirts and its recorded goalkeeper colour; it does not substitute today's designs.
  - Historical appearance exists only where it was recorded. Older playback without it says the kit was not recorded; do not substitute today's design as a claim about that match.
  - These appearance facts follow existing playback retention, not a new archive of every world's historical kit or unretained match action.
- KIT-13 [o] Choosing colours, crest parts, patterns or a kit changes presentation only; it does not alter player ability, money, reputation, fixture results, random sporting outcomes or the game date.
- KIT-14 [o] Founding offers six complete ready-made crests, one for each existing outer shape, and complete editable home/away/third shirt drafts before customisation.
  - Default editor colours are the three shirt bases (→KIT-1/4). The owner may change only the designs they want; skipping the editor never blocks founding.
  - Founding uses the previewed selections; the initial drafts are not rerolled after confirmation.
- KIT-15 [o] A supported career without the new identity information keeps every club's current visible crest, representative colours and recorded gameplay facts; supply only the missing shirt, shorts and socks designs reproducibly (→KIT-3).
  - Such a career gains a designed goalkeeper kit only when its owner designs one; until then →KIT-8's automatic colours apply.
  - Keep the own club's founding colour. Do not reassign other clubs' existing crests when adding shirts or editing the own club.
  - Missing historical kit information remains explicitly unrecorded (→KIT-12); it is not backfilled as an invented fact.
  - Compatibility and activation follow →SAVE-19/21; this identity feature grants no additional career-reset or legacy-gameplay conversion permission.
- KIT-16 [o] V1 excludes image uploads, freehand drawing, sponsor logos and fabric textures from the identity editor. It adds no cosmetic purchases or performance modifiers.

## flow
- Crest: home/away colours → ready-made or random composition → optional component composition → preview → explicit use/apply.
- Founding: club identity draft → home/away/third kits and goalkeeper kit → pitch preview → found with the selected identity.
- Match: automatic pairing → goalkeeper kit or fallback colour → optional own-kit override for that fixture → observe the selected kits on the player figures (→MATCH-36).
- Management: applied identity → edit draft → preview → apply or cancel; effect timing follows →KIT-12.

## constraints
- Stable implementation interfaces and validation are defined in `packages/contracts/src/identity.ts` and `identitySchema.ts`; checkpoint encoding is defined in `apps/web/src/adapters/identityPacking.ts`. Product policy remains in this document and persistence follows →SAVE-20/21.
- KIT owns identity and selection policies; →WEB-49/86/87/88 own their presentation and →SAVE-20/21 own persistence and compatibility.
- Cosmetic options do not authorise changes to gameplay, background progression, retained-history lifetimes or the rules-4.0.0 boundary.
- The storage, responsiveness and reference-device budgets remain →SAVE-4/13 and →WEB-19; pattern detail must remain legible at the desktop match scale and in the large previews; at phone widths team colours, facing and large actions must remain legible (→MATCH-36).

## chg
- r4 261028 KIT-3✎ no shorts/socks/goalkeeper editing→free shorts/socks per kit (start: second/base colour); KIT-4✎ three controls only→plus shorts/socks/goalkeeper controls; KIT-7✎ +judged on figures, kits never mixed; KIT-8✎ automatic goalkeeper colours→one designed goalkeeper kit, per-fixture fallback; KIT-11✎ +opponent shorts/socks; KIT-12✎ shirts→full kits retained; KIT-15✎ missing shirts→missing shirts/shorts/socks; constraints✎ legible at match scale→desktop/previews, phones colours/facing/actions
- r3 261021 KIT-1✎ independent palette→three named shirt colours; KIT-2✎ independent recolouring→home/away and random composition; KIT-4✎ 1–3 regions→three fixed controls; KIT-10✎ explicit palette reuse→immediate linked draft colours; KIT-14✎ two palette defaults→three shirt-base defaults
- r2 261019 KIT-4✎ open→1–3 colours/default two; KIT-5✎ open→eight patterns; KIT-7✎ open→clash warnings/manual allowed; KIT-10✎ open→explicit palette reuse; KIT-12✎ open→future fixtures/frozen replay; KIT-14✎ open→six crests/three kits; KIT-15✎ open→preserve supported careers; KIT-16✎ open→editor exclusions
- r1 261019 initial
