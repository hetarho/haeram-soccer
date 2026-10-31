# Compact dropdown resource family

Working implementation, 2026-10-31: four theme-owned sets of trigger, popup and selected-row plates for the shared Select. The three smooth originals were generated with the built-in image_gen tool; the pixel originals remain editable integer-grid SVG. Exact prompts are retained with each theme.

| Theme                 | Source, exact prompt and recipe                         | Prepared resources                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matchday Print        | [Source notes](../matchday-print/dropdown-v1/README.md) | [Trigger](../../public/art/matchday-print/dropdown-v1/frame-trigger.webp), [popup](../../public/art/matchday-print/dropdown-v1/frame-popup.webp), [selection](../../public/art/matchday-print/dropdown-v1/frame-selection.webp) |
| Stadium Green         | [Source notes](../standard/dropdown-v1/README.md)       | [Trigger](../../public/art/standard/dropdown-v1/frame-trigger.webp), [popup](../../public/art/standard/dropdown-v1/frame-popup.webp), [selection](../../public/art/standard/dropdown-v1/frame-selection.webp)                   |
| Pixel art             | [Source notes](../pixel/dropdown-v1/README.md)          | [Trigger](../../public/art/pixel/dropdown-v1/frame-trigger.png), [popup](../../public/art/pixel/dropdown-v1/frame-popup.png), [selection](../../public/art/pixel/dropdown-v1/frame-selection.png)                               |
| Sticker Football Club | [Source notes](../sticker-club/dropdown-v1/README.md)   | [Trigger](../../public/art/sticker-club/dropdown-v1/frame-trigger.webp), [popup](../../public/art/sticker-club/dropdown-v1/frame-popup.webp), [selection](../../public/art/sticker-club/dropdown-v1/frame-selection.webp)       |

Regenerate with `node scripts/prepare-dropdown-art.mjs`. The shared preparation pipeline preserves alpha, complete silhouettes, fixed source caps and filled centres. Theme packs own the role mappings, colours and typography; shared CSS assembles the same semantic treatment for all packs. Selection and keyboard navigation stay in the shared Select component.

Closed controls use a 36px desktop interaction area and 44px touch targets. The open list uses
compact 32px desktop rows and 36px mobile/coarse-pointer rows, with 3px vertical/6px leading
padding and no inter-option margin; wrapped labels and hints grow naturally. Its border and
padding total 6px per side. Ordinary text uses 13px body type, the pixel font uses its native
14px size, and hints use 12px. Popups scroll within a 280px height budget. Review captures are
disposable under ignored `.tmp/dropdown-design/`.

The closed trigger's artwork now occupies a separate 32px face within that interaction area:
2px vertical insets on desktop and 6px insets on touch layouts. This makes the visible field
compact without reducing its touch target. Text uses regular body weight and a smaller chevron;
transport pace is displayed as `1×`, `2×`, `5×` and `10×` while its stored values stay the same.

In the transport, the trigger's visible plate fills the full 44px height to align with its
neighbouring controls. Its popup has a padded material plate and a clear resource-backed rim;
short pace explanations sit beside their values. Sticker Football Club reuses the same cream
clay plate as the trigger for this popup and the sunny primary plate for the chosen row.

Matchday Print now uses its established cream ticket with charcoal/vermilion edges for the
closed control and popup, and the vermilion stamp with cream text for selection. Stadium Green
uses its established field plate and mint primary selection. The thin generated atlas outlines
remain source alternatives: they lost visible edge definition at the original displayed caps.

The product-wide rollout also covers settings, records and transfer-history season scopes,
competition and fixture filters, tactics and lineup controls, analysis and player comparison,
founding and transport pace. Former unframed season/presentation variants and local height,
weight and font overrides have been removed. Screen CSS retains width, flex and placement;
the common Select and theme pack own its visual treatment. The independent development
workbench and tuning lab keep their own tool interface.
