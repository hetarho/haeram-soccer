import s from './FacilityArt.module.css';
import { facilityScene, type FacilityScene } from './facilityScene';
import type { World } from '../../../../packages/contracts/src/types';
import { useLocale, usePresentation, useTheme, useThemeNeed } from '../presentation/react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Keep atmospheric art below the contrast of the surrounding game information. */
export function FacilityArt({
  kind,
  world,
  className,
  eager = false,
}: {
  kind: FacilityScene;
  world: World;
  className?: string;
  eager?: boolean;
}) {
  const locale = useLocale();
  const theme = useTheme();
  const themeLabel = usePresentation().themeEntry!.label;
  const scene = facilityScene(kind, world, { locale, theme, themeLabel });
  const element = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const update = () => setWidth(Math.ceil(node.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useThemeNeed(
    width
      ? {
          type: 'facility',
          era: scene.era,
          kind,
          stage: scene.stage,
          width: width * (globalThis.devicePixelRatio || 1),
        }
      : undefined,
  );
  return (
    <span
      ref={element}
      className={`${s.art} ${className || ''}`}
      data-facility-art={kind}
      data-era={scene.era}
      data-stage={scene.stage}
      style={{ '--facility-overlay': scene.treatment.overlay } as CSSProperties}
    >
      <img
        key={scene.src}
        className={s.image}
        src={width ? scene.src : undefined}
        srcSet={
          width && scene.variants.length
            ? scene.variants.map((variant) => `${variant.src} ${variant.width}w`).join(', ')
            : undefined
        }
        sizes={width ? `${width}px` : '100vw'}
        alt={scene.alt}
        width="240"
        height="80"
        loading={eager || kind === 'stadium' ? 'eager' : 'lazy'}
        decoding="async"
        style={{
          objectFit: scene.treatment.objectFit,
          objectPosition: scene.treatment.objectPosition,
          imageRendering: scene.treatment.imageRendering,
          filter: scene.treatment.filter,
        }}
      />
    </span>
  );
}
