/** Match entity, framework-free entry: the `lib/` helpers read outside the slice (pitch, figure and kit painting, the presentation clock and archive playback, material views and advanced match statistics), loadable outside the Vite build since it reaches no component or stylesheet. */
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
