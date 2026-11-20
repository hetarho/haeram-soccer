# Large stadium scenes

Working artwork for stadium stages 9 and 10 and their locker rooms is supplied in the three
calendar eras. These original scenes use charcoal and vermilion woodcut hatching on warm
newsprint; the larger bowl and the added upper tier express the completed stadium stages without
embedded labels or capacity. The images await the shared stadium candidate's visual review.

The twelve 2172 × 724 PNG originals are in `sources/{era}/{kind}-{stage}.png`. The deployment
inventory and hashes are in `public/art/matchday-print/generation.json`. Encode each source with
`encodeFacilityPanorama` from `scripts/art-resources.mjs`; it produces 960 × 320 and 480 × 160
WebP files and enforces the shared byte limits. The theme's existing path convention supplies the
files once the shared facility stage range is enabled.
