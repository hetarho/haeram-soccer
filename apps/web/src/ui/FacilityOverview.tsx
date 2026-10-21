import type { ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { FacilityArt } from './FacilityArt';
import type { FacilityScene } from './facilityScene';
import s from './FacilityOverview.module.css';

/** A visit to an existing club facility, with current facts kept outside the artwork. */
export function FacilityOverview({
  w,
  kind,
  title,
  children,
}: {
  w: World;
  kind: FacilityScene;
  title: string;
  children: ReactNode;
}) {
  return (
    <figure className={s.overview} aria-label={title} data-testid="facility-overview">
      <FacilityArt kind={kind} world={w} className={s.art} />
      <figcaption className={s.caption}>
        <strong>{title}</strong>
        <span>{children}</span>
      </figcaption>
    </figure>
  );
}
