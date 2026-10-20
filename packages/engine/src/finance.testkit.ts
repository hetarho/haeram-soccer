import type { Founding } from '../../contracts/src/types';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

export const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Budget Athletic',
  color: '#335544',
  seed: 'finance',
  level: 'easy',
};

export function world() {
  return simulatedWorld(FOUNDING);
}
