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
        key={scene.src}
        className={s.image}
        src={scene.src}
        alt={scene.alt}
        width="240"
        height="80"
        loading={eager || kind === 'stadium' ? 'eager' : 'lazy'}
        decoding="sync"
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
