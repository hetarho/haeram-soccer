import s from './FacilityArt.module.css';

export type FacilityScene = 'stadium' | 'locker' | 'training';

const IMAGES: Record<FacilityScene, { src: string; alt: string }> = {
  stadium: {
    src: '/art/stadium-tunnel.webp',
    alt: '벽돌 선수 터널 너머로 보이는 야간 축구장의 잔디와 터치라인 삽화',
  },
  locker: {
    src: '/art/locker-room.webp',
    alt: '나무 벤치와 유니폼, 축구화가 놓인 경기 전 라커룸 삽화',
  },
  training: {
    src: '/art/training-ground.webp',
    alt: '야간 훈련장의 잔디와 가죽 축구공, 장비 가방 삽화',
  },
};

/** Keep atmospheric art below the contrast of the surrounding game information. */
export function FacilityArt({ kind, className }: { kind: FacilityScene; className?: string }) {
  return (
    <span className={`${s.art} ${className || ''}`} data-facility-art={kind}>
      <img
        className={s.image}
        src={IMAGES[kind].src}
        alt={IMAGES[kind].alt}
        width="1440"
        height="480"
        loading={kind === 'stadium' ? 'eager' : 'lazy'}
        decoding="async"
      />
    </span>
  );
}
