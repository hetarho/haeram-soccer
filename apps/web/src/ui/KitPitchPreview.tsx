import { useEffect, useId, useRef, useState } from 'react';
import type { MatchAppearance, ShirtDesign } from '../../../../packages/contracts/src/identity';
import { previewLines } from './identityPreview';
import { createKitPainter, type KitDrawOptions } from './kitPainting';
import s from './KitPitchPreview.module.css';
import {
  createGroundPainter,
  DEFAULT_PITCH_SKIN,
  markerRadius,
  paintPitchGround,
  type PitchSkin,
} from './pitchPainting';
import { usePitchSkin } from './usePitchSkin';
export { markerRadius } from './pitchPainting';

/**
 * A static example shape for one side in pitch units, keeper first, inside its own half; the away
 * side mirrors it. Only an illustration of the shirts: live observation moves real engine players.
 */
export const PREVIEW_FORMATION: readonly (readonly [number, number])[] = [
  [5, 50],
  [17, 18],
  [15, 39],
  [15, 61],
  [17, 82],
  [30, 28],
  [28, 50],
  [30, 72],
  [43, 22],
  [45, 50],
  [43, 78],
];
/** Anything that draws a shirt marker the way `KitPainter.draw` does. */
interface MarkerPainter {
  draw(
    ctx: CanvasRenderingContext2D,
    shirt: ShirtDesign,
    x: number,
    y: number,
    radius: number,
    options?: KitDrawOptions,
  ): void;
}
/**
 * One still frame of the preview: the pitch, then both sides' outfield players in their selected
 * shirts and each keeper in its automatic colour, all through the shared shirt painter at the live
 * pitch's marker size, number font and outline.
 */
export function paintKitPreview(
  ctx: CanvasRenderingContext2D,
  painter: MarkerPainter,
  appearance: MatchAppearance,
  width: number,
  height: number,
  dpr: number,
  font: string,
  skin: PitchSkin = DEFAULT_PITCH_SKIN,
  ground?: ReturnType<typeof createGroundPainter>,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (ground) ground.draw(ctx, width, height, dpr, skin);
  else paintPitchGround(ctx, width, height, skin);
  ctx.imageSmoothingEnabled = !skin.pixelSize;
  const pad = width * 0.065;
  const radius = markerRadius(width);
  const options = {
    dpr: skin.pixelSize ? 1 / skin.pixelSize : dpr,
    outline: skin.markerOutline,
    outlineWidth: skin.markerWidth,
    font: `${Math.max(8, width * 0.012)}px ${font}`,
  };
  appearance.sides.forEach(({ shirt, goalkeeper }, side) => {
    const keeper: ShirtDesign = { pattern: 'plain', primary: goalkeeper };
    PREVIEW_FORMATION.forEach(([px, py], i) => {
      const x = pad + ((width - pad * 2) * (side === 0 ? px : 100 - px)) / 100;
      const y = pad + ((height - pad * 2) * py) / 100;
      painter.draw(ctx, i === 0 ? keeper : shirt, x, y, radius, { ...options, number: i + 1 });
    });
  });
}

/**
 * WEB-87: the selected shirts on grass at match-observation scale. Passive: it paints its props
 * when they or its size change, with no clock, simulation or command; its resize observer is
 * disconnected on unmount.
 */
export function KitPitchPreview({
  appearance,
  labels,
}: {
  appearance: MatchAppearance;
  /** Home side's name, then the away side's. */
  labels: [string, string];
}) {
  const caption = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const skin = usePitchSkin(canvas);
  const [ground] = useState(() => createGroundPainter());
  // One painter, and so one sprite cache, per mounted preview.
  const [painter] = useState(() => createKitPainter());
  const lines = previewLines(appearance, labels);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const ctx = element.getContext('2d');
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!ctx || !width || !height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pixels = [Math.round(width * dpr), Math.round(height * dpr)];
      if (element.width !== pixels[0] || element.height !== pixels[1]) {
        element.width = pixels[0];
        element.height = pixels[1];
      }
      const font = getComputedStyle(element).fontFamily || 'sans-serif';
      paintKitPreview(ctx, painter, appearance, width, height, dpr, font, skin, ground);
    };
    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [appearance, painter, skin, ground]);

  return (
    <figure className={s.preview}>
      <canvas
        ref={canvas}
        className={s.canvas}
        role="img"
        aria-label="경기장 유니폼 미리보기"
        aria-describedby={caption}
      />
      <figcaption id={caption} className={s.caption}>
        {lines.map((line) => (
          <p key={line} className={line.startsWith('경고:') ? s.warning : undefined}>
            {line}
          </p>
        ))}
      </figcaption>
    </figure>
  );
}
