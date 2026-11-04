import { message as sourceMessage } from '../../contracts/src/messages';
import type { World } from '../../contracts/src/types';
import { delegatedSponsors, sponsorEnding } from './sponsors';

export {
  commercialValue,
  contractOf,
  exclusiveSponsor,
  SPONSOR_CONFIG,
  SPONSOR_KIND_LABELS,
  SPONSOR_KINDS,
  sponsorAnnual,
  sponsorOffers,
  sponsorReminder,
  sponsorSlotOpen,
  sponsorSlots,
  yearlySponsor,
} from './sponsors';
export type { SponsorBonus, SponsorOffer, SponsorSlotView } from './sponsors';

/**
 * Daily business (→ECON-21): with business delegated the commercial staff fill empty sponsor
 * slots; otherwise 1 April tells the owner of contracts in their final season.
 */
export function delegatedBusiness(w: World) {
  delegatedSponsors(w);
  sponsorEnding(w);
}
/**
 * The campaigns of rules before 1.19 (→ECON-7): none starts now; one started before settles with
 * its label and following share.
 */
export const CAMPAIGNS = [
  { kind: 'outreach', label: sourceMessage('copy.ops_commercial.eb6c4f1057'), fans: 0.08 },
  { kind: 'tickets', label: sourceMessage('copy.ops_commercial.4ed8f3b17e'), fans: 0.12 },
  { kind: 'merchandise', label: sourceMessage('copy.ops_commercial.1bbe9f0588'), fans: 0.04 },
  { kind: 'player', label: sourceMessage('copy.ops_commercial.2bb255cea3'), fans: 0.16 },
];
