import type { World } from '../../../../packages/contracts/src/types';
import { useGameState } from '../runtime/store';

export function useOfficeRead(w: World) {
  return useGameState((state) => (state.view?.world.id === w.id ? state.view.office : undefined));
}
