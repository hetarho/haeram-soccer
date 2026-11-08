import { localizeValue, useTextLocale } from '../../../presentation/text';
import type { ReactNode } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import { FacilityArt } from '../../../entities/office/ui/FacilityArt';
import type { FacilityScene } from '../../../shared/routing/facilityScene';
import s from './FacilityOverview.module.css';

/**
 * A visit to an existing club facility, with current facts kept outside the artwork: the art in
 * its reserved slot, then a live caption naming the room and, when given, what it holds now.
 */
export function FacilityOverview({
  w,
  kind,
  title,
  children,
}: {
  w: World;
  kind: FacilityScene;
  title: string;
  children?: ReactNode;
}) {
  useTextLocale();
  return (
    <figure
      data-surface="panel"
      className={s.overview}
      aria-label={localizeValue(title)}
      data-testid="facility-overview"
    >
      <FacilityArt kind={kind} world={w} className={s.art} />
      <figcaption className={s.caption}>
        <strong>{localizeValue(title)}</strong>
        {localizeValue(children != null && <span>{localizeValue(children)}</span>)}
      </figcaption>
    </figure>
  );
}
