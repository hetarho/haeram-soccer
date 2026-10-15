import s from './FacilityArt.module.css';
import { facilityScene, type FacilityScene } from './facilityScene';
import type { World } from '../../../../packages/contracts/src/types';

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
  const scene = facilityScene(kind, world);
  return (
    <span
      className={`${s.art} ${className || ''}`}
      data-facility-art={kind}
      data-era={scene.era}
      data-stage={scene.stage}
    >
      <img
        className={s.image}
        src={scene.src}
        alt={scene.alt}
        width="240"
        height="80"
        loading={kind === 'stadium' ? 'eager' : 'lazy'}
        decoding="async"
      />
    </span>
  );
}
