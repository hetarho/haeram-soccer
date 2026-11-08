/** Office entity: the owner's office as data and small views; exports desks, club setting controls, delegation rules, office changes, progress mode, owner figures, facility art, the cash summary and the owner sheet. */
export {
  DECISION_BUILDS,
  DECISION_DIRECTIONS,
  DECISION_POLICIES,
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
  ownerStatuses,
  stakeAmount,
  stakeOutlook,
} from './lib/ownerFigures';
export { modeSwitchBlocked, switchProgressMode } from './lib/progressMode';
export { ClubCashSummary } from './ui/ClubCashSummary';
export {
  BuildSetting,
  DecisionFinanceSetting,
  DirectionSetting,
  InvestmentSlider,
  RecruitmentGuideline,
  TicketSetting,
  useClubSettingAction,
  WageBudgetSetting,
} from './ui/ClubSettingControl';
export { FacilityArt } from './ui/FacilityArt';
export { DeskBody, DeskSettings, type DeskStat, DeskStats } from './ui/OfficeDesk';
export { OwnerFunds, OwnerSheet, OwnerSheetBody } from './ui/OwnerSheet';
