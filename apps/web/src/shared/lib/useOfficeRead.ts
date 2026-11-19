import type { World } from '../../../../../packages/contracts/src/types';
import { useStoppedRead } from './useStoppedRead';

export function useOfficeRead(w: World) {
  return useStoppedRead('office', w.id);
}
