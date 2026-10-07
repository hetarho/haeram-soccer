import type { World } from '../../contracts/src/types';
import { clubOf } from './world';

export interface ClubGoal {
  id: string;
  title: string;
  description: string;
  action: string;
  current: number;
  target: number;
  done: boolean;
  progress: number;
}

function goal(
  id: string,
  title: string,
  description: string,
  action: string,
  value: number,
  target: number,
): ClubGoal {
  const earned = Math.round(Math.max(0, value) * 100) / 100;
  const current = Math.min(target, earned);
  return {
    id,
    title,
    description,
    action,
    current,
    target,
    done: earned >= target,
    progress: Math.round(Math.min(100, (earned / target) * 100) * 100) / 100,
  };
}

/** Retained canonical facts are the only source; reading milestones never awards or writes anything. */
export function clubMilestones(w: World) {
  const own = clubOf(w),
    archived = [...w.history].sort((a, b) => a.year - b.year),
    wins = w.ownMatches.filter((match) =>
      match.home === w.playerClub
        ? match.score.home > match.score.away
        : match.score.away > match.score.home,
    ).length;
  const hasPromotion =
    w.events.some((event) => event.kind === 'promotion') ||
    archived.some((season, index) => season.tier > (archived[index + 1]?.tier ?? own.tier));
  const goals: ClubGoal[] = [
    goal(
      'debut',
      '첫 경기의 발자국',
      '우리 클럽의 첫 공식 경기를 마쳐요.',
      '다음 우리 경기 진행하기',
      Math.max(
        w.ownMatches.length,
        w.tables[w.playerClub]?.played || 0,
        ...archived.map((season) => season.played),
      ),
      1,
    ),
    goal(
      'preparation',
      '우리만의 선발',
      '경기 준비에서 선발을 정하고 저장해요.',
      '경기 준비에서 선발 확정하기',
      w.lineup || w.events.some((event) => event.kind === 'lineup') ? 1 : 0,
      1,
    ),
    goal(
      'first-win',
      '첫 승리의 기쁨',
      '공식 경기에서 첫 승리를 기록해요.',
      '상대 전술과 피로를 살펴 경기 준비하기',
      Math.max(wins, w.tables[w.playerClub]?.won || 0, ...archived.map((season) => season.won)),
      1,
    ),
    goal(
      'player-growth',
      '함께 자라는 선수들',
      '선수들의 실제 주요 능력 성장을 합쳐 1을 쌓아요.',
      '유소년 훈련을 선택하고 라운드 진행하기',
      w.players.reduce((sum, player) => sum + (player.developed || 0), 0),
      1,
    ),
    goal(
      'facilities',
      '동네의 작은 구장',
      '시설을 2단계까지 키워 성장과 관중석을 준비해요.',
      '구단 운영에서 시설 2단계 만들기',
      w.facilities,
      2,
    ),
    goal(
      'supporters',
      '천 명의 목소리',
      '현재 또는 시즌 기록에서 서포터 1,000명을 모아요.',
      '캠페인과 경기로 서포터 늘리기',
      Math.max(own.fans, ...archived.map((season) => season.fans)),
      1000,
    ),
    goal(
      'season',
      '한 시즌의 이야기',
      '첫 시즌을 끝내고 기록을 남겨요.',
      '시즌을 마치고 클럽 기록 확인하기',
      archived.length,
      1,
    ),
    goal(
      'promotion',
      '더 높은 무대로',
      '승격을 이루고 새로운 리그에 도전해요.',
      '승격선을 향해 시즌 준비하기',
      hasPromotion ? 1 : 0,
      1,
    ),
  ];
  return {
    goals,
    next: goals.find((item) => !item.done),
    completed: goals.filter((item) => item.done).length,
    total: goals.length,
  };
}
