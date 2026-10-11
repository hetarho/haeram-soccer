/**
 * The point nearest to `x` on a series of `count` points spread evenly from `left` to `right`:
 * the reader aims at a season anywhere on the plot, never at a dot a few pixels wide.
 */
export function nearestIndex(x: number, count: number, left: number, right: number) {
  if (count <= 1 || right <= left) return 0;
  const index = Math.round(((x - left) / (right - left)) * (count - 1));
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Where a bubble of `width` x `height` goes for a point at (`x`, `y`) inside a frame of
 * `frameWidth` x `frameHeight`: centred over the point and clamped to the frame's sides; above the
 * point when it fits, else below when that fits, else on the roomier side, pressed into the frame.
 * `tip` is the pointer's offset inside the bubble, so it keeps pointing at the season.
 */
export function bubblePlacement(
  x: number,
  y: number,
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
  gap = 12,
) {
  const left = Math.max(0, Math.min(x - width / 2, frameWidth - width));
  const above = y - gap - height,
    below = y + gap;
  const side: 'above' | 'below' =
    above >= 0 || (below + height > frameHeight && y > frameHeight / 2) ? 'above' : 'below';
  const top = Math.max(0, Math.min(side === 'above' ? above : below, frameHeight - height));
  return { left, top, side, tip: Math.max(8, Math.min(x - left, width - 8)) };
}
