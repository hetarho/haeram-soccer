import { useLayoutEffect, useRef, useState } from 'react';
import type { ShirtDesign, WornKit, WornKeeper } from '../../../../packages/contracts/src/identity';
import { startingShorts, startingSocks } from '../../../../packages/engine/src/kit-wear';
import { createFigurePainter, playerLook } from './figurePainting';
import { previewPose } from './identityPreview';
import { describeShirt } from './kitPainting';
import { drawNumberTag, numberTagStyle, placeNumberTags } from './numberTags';
import s from './KitSwatch.module.css';

/**
 * KIT-3–5, WEB-87: a player sample drawn by the same figure painter as match observation, so the
 * editor shows exactly the pattern and trim the pitch will. Passive: it only paints its props.
 */
export function KitSwatch({
  shirt,
  kit,
  label,
  size = 48,
  number,
  outline = '#ffffffcc',
  className,
}: {
  shirt: ShirtDesign;
  kit?: WornKit | WornKeeper;
  /** What the shirt is, e.g. "홈 유니폼"; the accessible name adds its pattern and colours. */
  label: string;
  /** Rendered width and height in CSS pixels. */
  size?: number;
  /** An optional sample number, drawn as on the pitch. */
  number?: number;
  /** Side outline colour, as on the pitch. */
  outline?: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // One painter, and so one sprite cache, per mounted swatch.
  const [painter] = useState(() => createFigurePainter());

  useLayoutEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixels = Math.round(size * dpr);
    if (element.width !== pixels || element.height !== pixels) {
      element.width = pixels;
      element.height = pixels;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const worn = kit ?? { shirt, shorts: startingShorts(shirt), socks: startingSocks(shirt) };
    const keeper = 'gloves' in worn;
    const id = keeper ? 'preview:keeper' : 'preview:player';
    const radius = size / 4;
    painter.draw(ctx, previewPose(id, keeper), worn, {
      x: size / 2,
      y: size / 2,
      radius,
      dpr,
      look: playerLook(id),
      outline,
      outlineWidth: 1,
    });
    if (number !== undefined) {
      const family = getComputedStyle(element).fontFamily || 'sans-serif';
      const tags = placeNumberTags([{ id, number, x: size / 2, y: size / 2, radius }]);
      for (const tag of tags)
        drawNumberTag(
          ctx,
          tag,
          numberTagStyle({ markerOutline: outline, ground: '#111111' }, family),
        );
    }
  }, [painter, shirt, kit, size, number, outline]);

  return (
    <canvas
      ref={canvas}
      className={`${s.swatch} ${className || ''}`}
      role="img"
      aria-label={`${label}: ${describeShirt(shirt)}${kit ? `, 하의 ${kit.shorts}, 양말 ${kit.socks}${'gloves' in kit ? `, 장갑 ${kit.gloves}` : ''}` : ''}`}
      style={{ width: size, height: size }}
      width={size}
      height={size}
    />
  );
}
