/** Office entity: the owner's office as data and small views; exports desks, club setting controls and their page homes, delegation plans and notes, office changes, progress mode, owner figures, facility art, the cash summary and the owner sheet. */
export {
  AREA_DELEGATIONS,
  AREA_DIRECTIONS,
  delegationArea,
  PASSIVE_BUILDS,
  PASSIVE_POLICIES,
} from './lib/clubControls';
export {
  decisionOwner,
  RESPONSIBILITY_DETAILS,
  RESPONSIBILITY_LABELS,
  responsibilityAssignee,
  responsibilityAssignees,
  responsibilityDelegates,
  type ResponsibilityPost,
} from './lib/intervention';
export {
  applyOfficeChange,
  officeBulkChange,
  type OfficeChange,
  officeProposal,
  type OfficeProposal,
  officeSettings,
} from './lib/officeChanges';
export {
  businessChance,
  careerOver,
  dividendOutlook,
  endCause,
  fanMovers,
  ffpRoom,
  gameOverFacts,
  injectionLimit,
  injectionMood,
  injectionSteps,
  livingCost,
  mood,
  moodChange,
  nextSettlement,
  ownerLock,
  ownerSeasonRows,
  ownerStatuses,
  settlementsLeft,
  stakeExpectation,
  stakeAmount,
  stakeOutlook,
} from './lib/ownerFigures';
export { modeSwitchBlocked, switchProgressMode } from './lib/progressMode';
export { ClubBudget } from './ui/ClubBudget';
export {
  BuildSetting,
  DirectionSetting,
  InvestmentSlider,
  settingLock,
  TicketSetting,
  useClubSettingAction,
} from './ui/ClubSettingControl';
export { DelegationNote, PlanPreview } from './ui/DelegationPlan';
export { FacilityArt } from './ui/FacilityArt';
export { DeskBody, DeskSettings, type DeskStat, DeskStats } from './ui/OfficeDesk';
export { OwnerFunds, OwnerSheetBody } from './ui/OwnerSheet';
