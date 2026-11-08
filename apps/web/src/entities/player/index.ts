/**
 * Player entity: naming a player and asking for his detail. The detail itself is the
 * `widgets/player-detail` host; anything that names a player uses `PlayerLink` or `openPlayer`.
 */
export { PlayerLink } from './ui/PlayerLink';
export { openPlayer, usePlayerDetail, type PlayerScope, type PlayerTarget } from './model/detail';
export { ballonDorLine, ballonDorPremiumLine } from './lib/ballonDorText';
export {
  boardPlaces,
  careerRecords,
  clubLeaders,
  clubRanks,
  divisionName,
  LEADER_BOARDS,
  LEADER_LIMIT,
  LEADER_PAGE,
  type LeaderBoard,
  nextLeaderCount,
  trophyCabinet,
} from './lib/careerRecords';
export { bansOf, banText, leagueDiscipline } from './lib/discipline';
export { observedRate } from './lib/matchAnalysis';
export {
  appearanceText,
  explorePlayers,
  ofScope,
  per90,
  performanceRows,
  type PlayerOrder,
  playerStatus,
  type PlayerTally,
  type PositionFilter,
} from './lib/playerAnalysis';
export { squadRegistration } from './lib/squadRegistration';
export {
  callLine,
  cashState,
  clubSituation,
  placeAcademy,
  playerCallLine,
  runwayText,
  seasonBooks,
  type SituationFact,
  squadAvailability,
  type StateKey,
  stateWarning,
  teamStates,
  youthCall,
} from './lib/teamState';
export { Attributes } from './ui/Attributes';
export { FormationPitch, LEVEL_LABEL, positionsLabel } from './ui/FormationPitch';
export { clubOvr, cohesionLine, OvrBadge, ovrTier } from './ui/OvrBadge';
export { PlayerAdvancedStats } from './ui/PlayerAdvancedStats';
export { PlayerPerformance } from './ui/PlayerPerformance';
export { bestRoles, gradeLabel, multiplierLabel, PlayerProfile } from './ui/PlayerProfile';
export { PositionBadge } from './ui/PositionBadge';
