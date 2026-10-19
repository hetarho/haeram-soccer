# IDEATION club-identity-and-kits
> st:open@261019 | Design club colours, a selectable crest and home/away/third kits with a faithful match preview.

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
- [?] Colour roles: main field, secondary field/pattern and optional emblem/trim; templates visibly identify which region each control changes. A one-colour selection must still have a clear preview of any fixed outline or neutral details.
- [?] Kit pattern shortlist: solid, vertical stripes, horizontal hoops, halves, horizontal chest band, diagonal sash, checks and chevron. The final catalogue is undecided.
- [?] Prefer a few broad, readable stripes or checks over fine detail at the actual player-marker size; show both a large kit sample and the real observation scale.
- [?] Each shirt can use 1–3 colours, with the optional third reserved for trim; the precise colour roles remain open.
- [?] Generate editable starting designs for all three kits so founding does not require three complete design sessions.
- [o] Automatically select kits to avoid colour clashes, and let the owner change the selection before the match.
- [?] Judge clashes by the whole visible kit, including its large pattern regions, both teams, goalkeepers and grass; define the fallback when all three kits clash.
- [?] Preserve the owner's chosen design when improving legibility: consider outlines, readable numbers and non-colour team cues rather than silently replacing the palette.
- [?] Keep the crest/club palette as the persistent identity in club listings; use the selected match kits consistently for the observed players and their match legend. Decide how live chart series relate to those kits.
- [?] Recommend a pitch preview with an opposing side, a kit selector and representative light/dark opponent examples so away/third designs can be assessed too.
- [o] Allow crest, club-colour and kit editing both at founding and afterwards through club management.
- [?] Define when applied edits take effect and whether old match replays retain the kits worn at the time.
- [?] Other clubs need coherent home/away/third designs for opponent selection; decide the scope of automatic designs without adding an obligation to customise opponents manually.
- [?] Existing careers need an explicit identity-adoption policy; recommend retaining the visible crest and founding colour as the starting point instead of unexpectedly rebranding them.
- [?] Suggested v1 exclusions: image uploads, freehand crest drawing, sponsors, fabric textures and paid or performance-affecting cosmetics. These boundaries are not yet adopted.

## shape
- Confirmed flow: founding → choose club colours and crest → configure home/away/third colours and patterns → preview the pitch appearance → found the club → observe those designs in matches.
- Crest flow: choose a ready-made template → edit its visible 1–3 colour regions → optionally open 직접 꾸미기 to adjust shape, field pattern and emblem → preview the resulting crest.
- Proposed creation flow: choose a crest template → edit its visible 1–3 colour regions → review suggested kits → optionally customise each kit → inspect a large sample and actual-scale pitch preview → confirm.
- Match flow: automatically select a pairing that avoids colour clashes → optionally change the kit before kickoff → observe the selected kits in the match.
- Management flow: club management → edit crest, colours or kits → preview → apply; exact effect timing and historical replay behaviour remain open.
- v1 confirmed scope: club colours, ready-made 1–3-colour crest templates with optional shape/pattern/emblem composition, home defaulting to club colours, independent away/third palettes, solid and patterned shirts, automatically distinguished goalkeeper colours, a creation-time pitch preview, automatic kit selection with a pre-match override, and identity editing through club management after founding.
- v1 excludes separate shorts/socks colour controls and manual goalkeeper-kit editing; these remain possible later extensions.
- v1 unresolved scope: final pattern/template catalogues, shirt colour roles, design-change effect timing, historical appearance, opponent generation and existing-career adoption.

## domains
- CLUB: club identity, relationship between representative colours and kit palettes, kit roles and later identity changes.
- WEB: founding/editor flow, crest catalogue and colour-region controls, pattern catalogue, previews, visible match pairing and clash legibility; revisit WEB-2, WEB-49 and WEB-50.
- SAVE: preservation of selected designs across reload/export/import, adoption by existing careers and any historical-kit retention policy.

## open
- Which ready-made crest templates, component choices and kit patterns belong in the initial catalogues?
- Are all three kits required, and should generated drafts cover the designs the owner skips?
- How should kit clashes be explained and resolved when no saved pairing is sufficiently distinct, or when a manual override reintroduces a clash?
- When should club-palette, crest and kit edits take effect, including edits made while a match is being observed?
- Should later changes to club colours update existing home-kit colours or only provide defaults for new designs?
- Should previous match replays and historical club records show the identity from that date or today's identity?
- How should existing careers and automatically designed opponent kits adopt the feature?
