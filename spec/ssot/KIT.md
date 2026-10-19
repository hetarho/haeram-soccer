# KIT Club identity and match kits
> r1 | Let owners design a recognisable club and see its selected shirts in match observation.

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
- KIT-4 [?] Shirt colour roles: recommend 1–3 configured colours for main field, pattern/secondary field and optional trim. Define the representative-colour roles and how one-colour crests retain visible emblems without hidden colour choices.
- KIT-5 [?] Initial shirt-pattern catalogue: recommend solid, vertical stripes, horizontal hoops, halves, chest band, diagonal sash, checks and chevron; the smaller alternative is solid, vertical stripes, halves and checks.
- KIT-6 [o] Match kits are selected automatically to avoid clashes, and the owner may change their own shirt choice before the fixture is played.
  - Automatic selection remains sufficient when the owner skips preparation or disables the match-eve stop; selecting a kit adds no mandatory event acknowledgement.
  - A manual choice belongs to the named upcoming fixture, not every future fixture or an already settled match.
  - Only the selected home/away/third role changes; a fixture-level choice never edits its saved design.
- KIT-7 [?] Manual choices that clash: recommend a visible warning and a distinct alternative without blocking the owner's selection; the alternative policy requires a distinguishable pair before confirmation. Define the fallback when all saved shirt combinations clash.
- KIT-8 [o] Goalkeeper colours are chosen automatically to remain distinguishable from the outfield sides and the other goalkeeper.
  - Distinction concerns the shirts actually selected for this fixture, not only the clubs' representative colours.
- KIT-9 [o] Club-management editing changes the own club's representative colours, crest and shirt designs through explicit apply; opening, previewing or cancelling an editor does not change the applied identity.
  - Read-only viewers may inspect identity; only the writing owner may commit edits under →SAVE-6.
  - Editing another club's identity is not an owner action.
- KIT-10 [?] Representative-colour edits: recommend retaining already designed shirts and offering an explicit reuse-colours action; decide whether later palette edits instead update the home shirt automatically.
- KIT-11 [o] Every opponent has a stable crest and home/away/third shirt designs available to automatic match selection.
  - Initial designs are reproducible from that world and club; clubs added later receive their own designs.
  - Editing the own club must not reassign other clubs' existing identities.
  - The owner is not required to configure opponents to start or observe matches.
- KIT-12 [?] Design-change timing and replay appearance: recommend applying edits to future fixtures while retained replays keep the crest, outfield shirts and goalkeeper colours actually used; the alternative displays the latest design on historical playback. Define the treatment of an already settled fixture whose playback is still in progress.
- KIT-13 [o] Choosing colours, crest parts, patterns or a kit changes presentation only; it does not alter player ability, money, reputation, fixture results, random sporting outcomes or the game date.
- KIT-14 [?] Founding defaults: recommend complete editable home/away/third designs, generated before the owner opens customisation so skipped editors do not block founding. Define default representative-colour count and the initial ready-made crest set.
- KIT-15 [?] Existing-career adoption: recommend retaining each compatible club's current visible crest and the own club's founding colour, supplying missing shirts without changing retained gameplay facts; supported-rule boundaries remain →SAVE-19/21.
- KIT-16 [?] Additional v1 boundaries: recommend no image upload, freehand drawing, sponsors or fabric textures in this editor; no separate cosmetic purchases or performance modifiers are introduced.

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
- r1 261019 initial
