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
- [o] Reflect the chosen kit colours and patterns in match observation.
- [o] Preview the crest and how the identity will appear on the pitch during creation.
- [?] Distinguish the club palette, crest design and each kit's palette and pattern; recommend using club colours as the home defaults while allowing away/third colours outside that palette.
- [?] Crest selection: start with finished templates whose editable regions clearly correspond to 1–3 colour controls; decide whether separate shape, field-pattern and emblem editing belongs in v1.
- [?] Colour roles: main field, secondary field/pattern and optional emblem/trim; templates visibly identify which region each control changes. A one-colour selection must still have a clear preview of any fixed outline or neutral details.
- [?] Kit pattern shortlist: solid, vertical stripes, horizontal hoops, halves, horizontal chest band, diagonal sash, checks and chevron. The final catalogue is undecided.
- [?] Prefer a few broad, readable stripes or checks over fine detail at the actual player-marker size; show both a large kit sample and the real observation scale.
- [?] Each kit can use 1–3 colours, with the optional third reserved for trim; decide whether shorts and socks have separate controls.
- [?] Generate editable starting designs for all three kits so founding does not require three complete design sessions.
- [?] Recommend automatic kit selection that avoids clashes, with an optional pre-match override; a home/away label should not force an unreadable pairing.
- [?] Judge clashes by the whole visible kit, including its large pattern regions, both teams, goalkeepers and grass; define the fallback when all three kits clash.
- [?] Preserve the owner's chosen design when improving legibility: consider outlines, readable numbers and non-colour team cues rather than silently replacing the palette.
- [?] Keep the crest/club palette as the persistent identity in club listings; use the selected match kits consistently for the observed players and their match legend. Decide how live chart series relate to those kits.
- [?] Recommend a pitch preview with an opposing side, a kit selector and representative light/dark opponent examples so away/third designs can be assessed too.
- [?] Recommend editing from club management after founding; decide when changes take effect and whether old match replays retain the kits worn at the time.
- [?] Other clubs need coherent home/away/third designs for opponent selection; decide the scope of automatic designs without adding an obligation to customise opponents manually.
- [?] Existing careers need an explicit identity-adoption policy; recommend retaining the visible crest and founding colour as the starting point instead of unexpectedly rebranding them.
- [?] Suggested v1 exclusions: image uploads, freehand crest drawing, sponsors, fabric textures and paid or performance-affecting cosmetics. These boundaries are not yet adopted.

## shape
- Confirmed flow: founding → choose club colours and crest → configure home/away/third colours and patterns → preview the pitch appearance → found the club → observe those designs in matches.
- Proposed creation flow: choose a crest template → edit its visible 1–3 colour regions → review suggested kits → optionally customise each kit → inspect a large sample and actual-scale pitch preview → confirm.
- Proposed match flow: show the automatically selected pairing before kickoff → optionally choose another kit → show the same pairing throughout observation.
- Proposed management flow: club management → identity editor → preview → apply; timing and historical replay behaviour remain open.
- v1 confirmed scope: club colours, selectable 1–3-colour crest designs, three named kit roles, solid and patterned kits, and a creation-time pitch preview.
- v1 unresolved scope: crest composition depth, individual garment controls, match overrides, post-founding edits, opponent generation and existing-career adoption.

## domains
- CLUB: club identity, relationship between representative colours and kit palettes, kit roles and later identity changes.
- WEB: founding/editor flow, crest catalogue and colour-region controls, pattern catalogue, previews, visible match pairing and clash legibility; revisit WEB-2, WEB-49 and WEB-50.
- SAVE: preservation of selected designs across reload/export/import, adoption by existing careers and any historical-kit retention policy.

## open
- Should home default to club colours while away and third may use other palettes, should every kit stay within the club palette, or should all three be independent?
- Should kit selection be automatic with an optional pre-match override, automatic only, or always manual?
- May the owner change the identity at any time through club management, only between seasons, or only at founding?
- Which crest template/composition controls and kit patterns belong in v1?
- Are all three kits required, and should generated drafts cover the designs the owner skips?
- Does v1 customise the shirt/marker only or also shorts, socks and goalkeeper kits?
- How should kit clashes be explained and resolved when no saved pairing is sufficiently distinct?
- Should previous match replays and historical club records show the identity from that date or today's identity?
- How should existing careers and automatically designed opponent kits adopt the feature?
