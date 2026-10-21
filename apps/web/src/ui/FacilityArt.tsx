import s from './FacilityArt.module.css';
import { facilityScene, type FacilityScene } from './facilityScene';
import type { World } from '../../../../packages/contracts/src/types';
import { useLocale, usePresentation, useTheme, useThemeNeed } from '../presentation/react';
import type { CSSProperties } from 'react';

/** Keep atmospheric art below the contrast of the surrounding game information. */
export function FacilityArt({
  kind,
  world,
  className,
}: {
  kind: FacilityScene;
  world: World;
  className?: string;
}) {
  const locale = useLocale();
  const theme = useTheme();
  const themeLabel = usePresentation().themeEntry!.label;
  const scene = facilityScene(kind, world, { locale, theme, themeLabel });
  useThemeNeed({ type: 'facility', era: scene.era, kind, stage: scene.stage });
  return (
    <span
      className={`${s.art} ${className || ''}`}
      data-facility-art={kind}
      data-era={scene.era}
      data-stage={scene.stage}
      style={{ '--facility-overlay': scene.treatment.overlay } as CSSProperties}
    >
      <img
        className={s.image}
        src={scene.src}
        alt={scene.alt}
        width="240"
        height="80"
        loading={kind === 'stadium' ? 'eager' : 'lazy'}
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
