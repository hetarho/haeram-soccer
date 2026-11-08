/** Match entity: how a match is drawn and timed; exports pitch, figure and kit painting, kit swatches and previews, the presentation clock and archive playback, material views, heat pitches and advanced match statistics. */
export { hundredths, matchComparison, PD, recordCounters, share, sideLines } from './lib/advanced';
export { figureActionWindows, PITCH_METRES } from './lib/figureActions';
export {
  createFigurePainter,
  figurePoint,
  playerLook,
  type PlayerLook,
} from './lib/figurePainting';
export {
  FIGURE_POSE_CONFIG,
  type FigureInput,
  type FigurePose,
  gaitDistances,
  poseAt,
} from './lib/figurePose';
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
export { drawNumberTag, numberTagStyle, placeNumberTags } from './lib/numberTags';
export {
  ballRadius,
  createGroundPainter,
  markerRadius,
  paintPitchBall,
  PITCH_PAD,
  type PitchSkin,
} from './lib/pitchPainting';
export {
  beatAt,
  beatCaptions,
  DEAD_BALL_CONFIG,
  deadBallBeats,
  FRAME_STEP_LIMIT_MS,
  frameElapsedMs,
  locate,
  type Preparation,
  presentationAdvance,
  presentationMs,
  type PresentationSample,
  presentationSamples,
  runningLength,
  runningRate,
  runningTime,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
} from './lib/presentationClock';
export { archivePlayback } from './lib/replay';
export { usePitchSkin } from './model/usePitchSkin';
export { FIELD, HeatPitch, MaterialPitch } from './ui/HeatPitch';
export { KitPitchPreview } from './ui/KitPitchPreview';
export { KitSwatch } from './ui/KitSwatch';
