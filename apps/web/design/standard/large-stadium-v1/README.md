# Large stadium and locker-room scenes (stages 9 and 10), standard pack

Plan for the two largest stadium steps in ECON-32 (stage 9, a rebuilt 105,000-seat bowl; stage 10,
an upper third tier to 120,000 seats) and for the finished locker room that goes with each step, in
each of the three eras (heritage, terraces, contemporary). Twelve scenes in all, in the Stadium
Green painted sports-comic style of the approved stage 0–8 pack (WEB-72, WEB-91).

## Status

- `prompt.json` holds the twelve job prompts. Each reuses the approved stage 8 prompt for its era
  and kind: the shared style and constraints stay, the scene paragraph and the stage sentence change.
- The painted sources are not produced yet. Painting needs the built-in image generation tool that
  the standard pack's 92 scenes were made with; the unit that prepared this plan (Claude, Haiku) had
  no such tool. The task's `run` field names `codex/gpt-6.1-terra@low` as the recommended route.
- No deployment file, no `generation.json` record and no theme change is made here. The stage
  maximum stays at 8 until T1051 enables stages 9 and 10, so the new slots are not addressed yet.
- Working artwork awaiting the owner's visual review. It is not an approved product rule.

## Resume (in a session with image generation)

1. For each job in `prompt.json`, generate the image with its `references` as reference images:
   `heritage/stadium-0.webp` is the style reference, and the second reference is the same era and
   kind at stage 8, which sets the camera and layout. Ask for the requested 1920×640 3:1 size.
   Save the lossless PNG as `sources/<id>.png` in this folder and record its path in `source`.
2. Encode each source with the shared `encodeFacilityPanorama(source, output)` from
   `scripts/art-resources.mjs`, into `apps/web/public/art/standard/<era>/<kind>-<stage>.webp`. It
   writes the 960×320 WebP and the 480×160 `.small.webp` and enforces the current byte budgets
   (180,000 and 55,000 bytes).
3. Append the twelve records (id, asset, source, bytes, sha256, small variant) to the `jobs` array of
   `apps/web/public/art/standard/generation.json`, keeping the existing 92 records unchanged.
4. Validate all twelve before closing the acceptance: each source decodes at 3:1, each deployed WebP
   is 960×320 and each small variant is 480×160, both decode, every content hash is unique per kind
   and era and no file repeats a shipped scene. Run the task-tier checks through
   `vibe check --tier task` once after the edits.
5. Include the new images in `stad20-gate-stadium` for the shared candidate. The in-progress art
   stays on the previous stadium stage until T1051 raises the maximum.

## Composition

- Stadium stage 9: a rebuilt bowl with four tiers of seating on the long sides, a continuous
  roofline falling from the corners to the centre, deep end terraces, a broad landmark roof on steel
  trusses and floodlight masts above it.
- Stadium stage 10: the same bowl with a fifth upper tier (the new third tier) above the existing
  stands and a raised roofline carried round the corners; the grandest completed stage.
- Locker stage 9: a finished horseshoe team suite with two banks of lockers holding shirts, a central
  table with a ball, a green rug, a window band and a glass-fronted trophy cabinet with no legible
  lettering.
- Locker stage 10: the same room with a gallery rail along an upper walkway and a glass showroom wall
  on the right.
- Materials follow each era: brick, painted timber and steel (1950–1969); concrete terraces, steel
  roofs and brick (1970–1999); steel, glass and concrete (2000 onward).

## Constraints

No people, text, numbers, logos, real club identity, embedded capacities or stage numbers. The kit is
generic deep green and cream. The art does not change any engine fact.
