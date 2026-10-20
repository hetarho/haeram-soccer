import { useLayoutEffect, useRef, useState } from 'react';
import type { ShirtDesign } from '../../../../packages/contracts/src/identity';
import { createKitPainter, describeShirt } from './kitPainting';
import s from './KitSwatch.module.css';

/**
 * KIT-3–5, WEB-87: a large shirt sample drawn by the same painter as the match markers, so the
 * editor shows exactly the pattern and trim the pitch will. Passive: it only paints its props.
 */
export function KitSwatch({
  shirt,
  label,
  size = 48,
  number,
  outline = '#ffffffcc',
  className,
}: {
  shirt: ShirtDesign;
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
  const [painter] = useState(() => createKitPainter());
  const { pattern, primary, secondary, trim } = shirt;

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
    // Leave room for the outline inside the box.
    painter.draw(ctx, { pattern, primary, secondary, trim }, size / 2, size / 2, size / 2 - 1, {
      dpr,
      number,
      outline,
      font: `${Math.round(size * 0.36)}px ${getComputedStyle(element).fontFamily || 'sans-serif'}`,
    });
  }, [painter, pattern, primary, secondary, trim, size, number, outline]);

  return (
    <canvas
      ref={canvas}
      className={`${s.swatch} ${className || ''}`}
      role="img"
      aria-label={`${label}: ${describeShirt(shirt)}`}
      style={{ width: size, height: size }}
      width={size}
      height={size}
    />
  );
}
