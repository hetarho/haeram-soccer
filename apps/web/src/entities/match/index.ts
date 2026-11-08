/** Match entity: how a match is drawn and replayed; exports pitch, figure and kit painting, kit swatches and previews, replay timing, goal moments, material views, heat pitches and advanced match statistics. */
export { hundredths, matchComparison, PD, recordCounters, share, sideLines } from './lib/advanced';
export { figureActionWindows } from './lib/figureActions';
export {
  createFigurePainter,
  figurePoint,
  playerLook,
  type PlayerLook,
} from './lib/figurePainting';
export { type FigurePose, gaitDistances, poseAt } from './lib/figurePose';
export {
  advanceGoalFeedback,
  GOAL_FEEDBACK_CONFIG,
  type GoalFeedbackState,
  goalInstants,
  goalsShown,
  seekGoalFeedback,
} from './lib/goalFeedback';
export {
  GOAL_REPLAY_CONFIG,
  type GoalReplay,
  goalsSeen,
  replayClock,
  replayEnded,
  replayEntryOpen,
  replayFor,
  type ReplayGoal,
  replayGoals,
  replayGoalsReached,
  startGoalReplay,
} from './lib/goalReplay';
export { editorPreviewAppearance, KIT_ROLE_LABELS } from './lib/identityPreview';
export { describeShirt } from './lib/kitPainting';
export {
  keepersBySample,
  matchLook,
  type MatchLook,
  type SideLook,
  UNRECORDED_KIT,
  UNRECORDED_LOOK,
} from './lib/matchAppearance';
export {
  heatChoices,
  heatOf,
  networkView,
  ownSide,
  px,
  py,
  shotDots,
  shotTotals,
  sideReport,
  topToucher,
} from './lib/materialView';
export {
  goalFrame,
  incidentFrame,
  type Moment,
  recordedGoals,
  recordedIncidents,
  sampleAt,
  sentOff,
} from './lib/moments';
export { drawNumberTag, numberTagStyle, placeNumberTags } from './lib/numberTags';
export { figureInputs } from './lib/pitchFigures';
export {
  ballRadius,
  createGroundPainter,
  markerRadius,
  paintPitchBall,
  PITCH_PAD,
  type PitchSkin,
} from './lib/pitchPainting';
export { type PossessionCue, possessionKey, resolvePossessionCue } from './lib/possessionCue';
export {
  beatAt,
  beatCaptions,
  deadBallBeats,
  frameElapsedMs,
  locate,
  type Preparation,
  presentationSamples,
  runningLength,
  WATCH_DEFAULT_SPEED,
  WATCH_SPEEDS,
} from './lib/presentationClock';
export { archivePlayback } from './lib/replay';
export { scoreboardHalves } from './lib/scoreboardHalves';
export { usePitchSkin } from './model/usePitchSkin';
export { FIELD, HeatPitch, MaterialPitch } from './ui/HeatPitch';
export { KitPitchPreview } from './ui/KitPitchPreview';
export { KitSwatch } from './ui/KitSwatch';
