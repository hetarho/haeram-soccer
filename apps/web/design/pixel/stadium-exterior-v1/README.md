# Stadium exterior investment cover

Implemented working artwork, 2026-11-04, for the stadium destination in the investment gallery
and its detail header. This is a general facade cover, independent of capacity and era; the
investment controls carry the actual completed level and construction progress. Other facility
scenes keep their completed-stage selection.

The street-facing brick facade, green entrance gates, stand roofs and floodlights distinguish
the cover from the training and academy pitches. The entrance stays centred for gallery crops.
No labels or live game facts are baked into the art.

`source.mjs` is the editable 240×80 integer-grid artwork. The shared art pipeline exports a lossless PNG; keep nearest-neighbour rendering.

Run `node scripts/prepare-stadium-exterior.mjs` from the repository root to prepare all four
covers and update their optional `images.facility.exterior` metadata. Generated assets and hashes
live in `apps/web/public/art/pixel/stadium-exterior-v1/`. The script's `--check` mode compares
deployed hashes without regeneration. This records working artwork awaiting the owner's visual
review, not an independently approved product rule.
