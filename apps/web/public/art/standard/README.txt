Painted sports-comic facility artwork for the Stadium Green standard theme.

Selected direction: the approved third illustration study, reused as the first
heritage stadium scene. Every scene shares expressive brush inking, layered
paint, warm sunlight, material detail and a grounded Western comic atmosphere.

92 optimized 1440 x 480 WebP scenes: every stadium/locker, training and academy
stage in all three eras, plus distinct era-neutral manager and staff interiors.
The built-in image_gen tool produced the paintings. ffmpeg only encoded the
original generated sources for browser delivery. generation.json contains the
exact prompts, source provenance, logical references, sizes and checksums.
Original generated PNG files remain at their tool-managed source paths.

The existing HTML image slots, captions, game facts and pixel pack are retained.
Lucide icon resources are separate: node scripts/generate-standard-icons.mjs.
Their upstream license is shipped in presentation/themes/Lucide-LICENSE.txt.

grain.png is a separate 160 x 160 grayscale/alpha UI texture, not a facility scene.
It preserves the original CSS grain: SVG fractalNoise at frequency .82, three
octaves, stitched edges, grayscale and .085 opacity. Chromium Canvas rasterized
the tile once; ffmpeg encoded it as grayscale/alpha PNG without resizing. Theme
backgrounds reuse this static bitmap; no live turbulence filter runs on panels.
