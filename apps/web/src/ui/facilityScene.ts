import type { World } from '../../../../packages/contracts/src/types';
import { MAX_LEVEL, STADIUM_STEPS } from '../../../../packages/engine/src/facilities';

export type FacilityScene = 'stadium' | 'locker' | 'training';
type SceneWorld = Pick<World, 'year' | 'calendar' | 'round' | 'stadium' | 'trainingGround'>;

const ERA_LABEL = {
  heritage: '1950–60년대',
  terraces: '1970–90년대',
  contemporary: '2000년 이후',
} as const;

/** Artwork follows completed world facts, never a pending construction target. */
export function facilityScene(kind: FacilityScene, w: SceneWorld) {
  const day = w.calendar?.day ?? w.round * 7;
  const year = new Date(Date.UTC(w.year, 7, 1 + day)).getUTCFullYear();
  const era = year < 1970 ? 'heritage' : year < 2000 ? 'terraces' : 'contemporary';
  const raw = kind === 'training' ? w.trainingGround : w.stadium;
  const top = kind === 'training' ? MAX_LEVEL : STADIUM_STEPS.length - 1;
  const stage = Math.min(top, Math.max(0, Math.trunc(Number.isFinite(raw) ? raw : 0)));
  const label =
    kind === 'training'
      ? stage
        ? `${stage}단계 훈련장`
        : '기본 훈련장'
      : kind === 'locker'
        ? `구장 ${stage + 1}단계 라커룸`
        : `구장 ${stage + 1}단계`;
  return {
    src: `/art/scenes/${era}/${kind}-${stage}.webp`,
    era,
    stage,
    alt: `${ERA_LABEL[era]} ${label} 픽셀아트`,
  };
}
