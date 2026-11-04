import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { FacilityScene } from './facilityScene';

export const INVESTMENT_AREAS = [
  {
    id: 'firstTeam',
    title: sourceMessage('team.view.players'),
    art: 'training',
    description: sourceMessage('copy.investmentAreas.09d82efac1'),
  },
  {
    id: 'youth',
    title: sourceMessage('team.view.academy'),
    art: 'academy',
    description: sourceMessage('copy.investmentAreas.ebb385fde7'),
  },
  {
    id: 'coaches',
    title: sourceMessage('copy.investmentAreas.243be11e44'),
    art: 'staff',
    description: sourceMessage('copy.investmentAreas.6ed8a570a1'),
  },
  {
    id: 'stadium',
    title: sourceMessage('copy.ClubOperations.64779ec1ad'),
    art: 'stadium',
    description: sourceMessage('copy.investmentAreas.0be5f698b0'),
  },
  {
    id: 'scouting',
    title: sourceMessage('copy.investmentAreas.f163d8ed88'),
    art: 'manager',
    description: sourceMessage('copy.investmentAreas.eabd121323'),
  },
  {
    id: 'community',
    title: sourceMessage('copy.investmentAreas.36aa92ebb0'),
    art: 'stadium',
    description: sourceMessage('copy.investmentAreas.68e757d65b'),
  },
  {
    id: 'finance',
    title: sourceMessage('copy.investmentAreas.7fd6d6d374'),
    art: 'manager',
    description: sourceMessage('copy.investmentAreas.9964916eb0'),
  },
  {
    id: 'identity',
    title: sourceMessage('club.operations.identity'),
    art: 'locker',
    description: sourceMessage('copy.investmentAreas.2786fb409b'),
  },
] as const satisfies readonly {
  id: string;
  title: string;
  art: FacilityScene;
  description: string;
}[];
export type InvestmentArea = (typeof INVESTMENT_AREAS)[number]['id'];
export const INVESTMENT_PAGES = [
  ['overview', sourceMessage('copy.TrainingView.9e820c8111')],
  ...INVESTMENT_AREAS.map((area) => [area.id, area.title] as const),
] as const;
