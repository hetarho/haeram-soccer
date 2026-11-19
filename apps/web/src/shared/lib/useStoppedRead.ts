import { useGameState } from '../../runtime/store';
import type { ProjectedWorld, View } from '../../runtime/protocol';

type StoppedReadValues = {
  managers: View['managers'];
  coaches: View['coaches'];
  transfers: View['transfers'];
  disciplineNames: ProjectedWorld['disciplineNames'];
  office: View['office'];
};

/** Reads a projection which is withheld while automatic progression is running. */
export function useStoppedRead(part: 'running'): boolean;
export function useStoppedRead<K extends keyof StoppedReadValues>(
  part: K,
  worldId?: string,
): StoppedReadValues[K] | undefined;
export function useStoppedRead(
  part: keyof StoppedReadValues | 'running',
  worldId?: string,
): boolean | StoppedReadValues[keyof StoppedReadValues] | undefined;
export function useStoppedRead(part: keyof StoppedReadValues | 'running', worldId?: string) {
  return useGameState((state) => {
    if (part === 'running') return !!state.clockRunning;
    if (state.clockRunning) return undefined;
    const view = state.view;
    if (!view) return undefined;
    if (worldId && view.world.id !== worldId) return undefined;
    return part === 'disciplineNames' ? view.world.disciplineNames : view[part];
  });
}
