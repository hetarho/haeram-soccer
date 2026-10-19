# IDEATION club-identity-and-kits
> st:converted@261019 | Design club colours, a selectable crest and home/away/third kits with a faithful match preview.

## vision
- Problem: founding exposes one colour, while the resulting crest adds an automatically chosen second colour, shape, field pattern and emblem. Owners cannot deliberately design the identity they later see.
- Target: owners founding a fictional club and watching its matches.
- Value: choose a recognisable club identity and see the chosen colours and patterns carry through to match observation; preview the result before committing to it.
- Existing behaviour: crests already have automatically chosen patterns and two colours. Match players use a single crest-derived colour, with automatic substitution for grass/team contrast. References: `apps/web/src/ui/ClubFounding.tsx`, `apps/web/src/ui/crests.ts`, `apps/web/src/ui/Pitch.tsx`.

## explored
- [o] Give club colours and home, away and third kits explicit product concepts.
- [o] Let the owner choose the club crest and its editable colours, with 1–3 colours according to the selected design.
- [o] Support patterned kits alongside solid colours: stripes, colour blocking and checks.
- [o] V1 kit editing covers shirt colours and patterns. Shorts and socks have no separate colour controls in v1.
- [o] Goalkeeper colours are chosen automatically to remain distinguishable; v1 has no manual goalkeeper-kit editor.
- [o] Reflect the chosen kit colours and patterns in match observation.
- [o] Preview the crest and how the identity will appear on the pitch during creation.
- [o] Distinguish the club palette, crest design and each kit's palette and pattern. Home defaults to the club colours; away and third may use colours outside that palette.
- [o] Crest selection starts with ready-made templates and their editable 1–3 colour regions; a template can be used after recolouring without composing its parts.
- [o] Offer optional 직접 꾸미기 from the selected template to change the outer shape, background field pattern and emblem separately. Entering composition continues from that template's design.
- [o] Representative colours and shirts use 1–3 colours, defaulting to main and secondary, with an optional accent. Colour regions and any fixed one-colour crest outlines are visible in the preview (→KIT-4).
- [o] Eight shirt patterns: solid, vertical stripes, horizontal hoops, halves, chest band, diagonal sash, checks and chevron (→KIT-5).
- [o] Use readable pattern detail at match scale, with a large sample and actual observation-scale preview (→WEB-50/87).
- [o] Shirt colour regions are main field, pattern/secondary field and optional trim; show only the regions used by the chosen design (→KIT-4).
- [o] Provide six complete crest templates and editable home/away/third drafts; only the wanted designs need customisation (→KIT-14).
- [o] Automatically select kits to avoid colour clashes, and let the owner change the selection before the match.
- [o] Automatic selection prioritises distinguishable visible shirt designs; if all combinations clash, use the clearest available pair and warn. Manual clashing choices are allowed after a warning (→KIT-7/8).
- [o] Preserve the chosen palettes; use readable numbers, outlines and non-colour team cues without silently repainting a selected shirt (→KIT-7, →WEB-49/50).
- [o] Current club listings show the applied identity; match players and legends show the selected shirts, while charts retain readable labelled series (→WEB-49).
- [o] The pitch preview includes an opposing side, kit selection, goalkeeper colours and labelled light/dark opponent examples (→WEB-87).
- [o] Allow crest, club-colour and kit editing both at founding and afterwards through club management.
- [o] Applied edits update current club screens immediately and future unplayed fixtures; ongoing and retained historical playback keep their recorded appearance (→KIT-12, →SAVE-22).
- [o] Representative-colour changes preserve already designed shirts; explicit 대표색 적용 affects only the selected shirt and keeps its pattern (→KIT-10).
- [o] Opponents receive stable reproducible identities and three shirt designs without manual owner setup; own-club edits never reassign opponent identities (→KIT-11).
- [o] Supported careers preserve visible crests, representative colours and gameplay facts; only missing shirts are generated. Missing historical kits remain unrecorded (→KIT-15, →SAVE-21/22).
- [o] V1 excludes image uploads, freehand drawing, sponsor logos, fabric textures, cosmetic purchases and performance modifiers (→KIT-16).

## shape
- Confirmed flow: founding → choose club colours and crest → configure home/away/third colours and patterns → preview the pitch appearance → found the club → observe those designs in matches.
- Crest flow: choose a ready-made template → edit its visible 1–3 colour regions → optionally open 직접 꾸미기 to adjust shape, field pattern and emblem → preview the resulting crest.
- Creation flow: choose a crest template → edit its visible 1–3 colour regions → review suggested kits → optionally customise each kit → inspect a large sample and actual-scale pitch preview → confirm.
- Match flow: automatically select a pairing that avoids colour clashes → optionally change the kit before kickoff → observe the selected kits in the match.
- Management flow: club management → edit crest, colours or kits → preview → apply; current club screens update immediately and future fixtures use the new design, while retained playback stays fixed.
- v1 confirmed scope: club colours, ready-made 1–3-colour crest templates with optional shape/pattern/emblem composition, home defaulting to club colours, independent away/third palettes, solid and patterned shirts, automatically distinguished goalkeeper colours, a creation-time pitch preview, automatic kit selection with a pre-match override, and identity editing through club management after founding.
- v1 excludes separate shorts/socks colour controls and manual goalkeeper-kit editing; these remain possible later extensions.
- Settled policy: 1–3 colours/default two, six crest templates, eight shirt patterns, three starting shirt designs, warned manual clashes, explicit palette reuse and preserved recorded playback (→KIT-4/5/7/10/12/14/15/16).

## domains
- KIT: club identity, relationship between representative colours and kit palettes, kit roles and later identity changes →KIT
- WEB: founding/editor flow, colour-region controls, previews and visible match pairing; WEB-2/15/39/49/50/71 and WEB-86/87/88 →WEB
- SAVE: preservation of applied designs and fixture choices, supported-career adoption and historical-kit retention; SAVE-20/21/22 →SAVE

## open
- None; identity policies are settled in KIT r2, WEB r91 and SAVE r47.
