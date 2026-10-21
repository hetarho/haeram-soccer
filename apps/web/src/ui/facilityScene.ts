import type { World } from '../../../../packages/contracts/src/types';
import { MAX_LEVEL, STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import type { LoadedLocale } from '../presentation/locale';
import type { ThemeResolver } from '../presentation/theme';

export type FacilityScene = 'stadium' | 'locker' | 'training';
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
  const raw = kind === 'training' ? w.trainingGround : w.stadium;
  const top = kind === 'training' ? MAX_LEVEL : STADIUM_STEPS.length - 1;
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
