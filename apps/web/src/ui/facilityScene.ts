import type { World } from '../../../../packages/contracts/src/types';
import type { LoadedLocale } from '../presentation/locale';
import type { ThemeResolver } from '../presentation/theme';
import type { FacilityKind } from '../presentation/contracts';
import { facilityStageTop } from '../presentation/facilityImages';

export type FacilityScene = FacilityKind;
type SceneWorld = Pick<World, 'year' | 'calendar' | 'round' | 'stadium' | 'trainingGround'>;

/** Artwork follows completed world facts, never a pending construction target. */
export function facilityScene(
  kind: FacilityScene,
  w: SceneWorld,
  presentation: {
    locale: Pick<LoadedLocale, 't'>;
    theme: ThemeResolver;
    themeLabel: string;
  },
) {
  const day = w.calendar?.day ?? w.round * 7;
  const year = new Date(Date.UTC(w.year, 7, 1 + day)).getUTCFullYear();
  const era = year < 1970 ? 'heritage' : year < 2000 ? 'terraces' : 'contemporary';
  const top = facilityStageTop(kind);
  const raw = top === 0 ? 0 : kind === 'training' ? w.trainingGround : w.stadium;
  const stage = Math.min(top, Math.max(0, Math.trunc(Number.isFinite(raw) ? raw : 0)));
  const { t } = presentation.locale;
  const label =
    kind === 'training'
      ? t(stage ? 'facility.training.stage' : 'facility.training.base', { stage })
      : t(`facility.${kind}`, { stage: stage + 1 });
  return {
    ...presentation.theme.facility({ era, kind, stage }),
    alt: t('facility.alt', {
      era: t(`facility.era.${era}`),
      label,
      theme: presentation.themeLabel,
    }),
  };
}
