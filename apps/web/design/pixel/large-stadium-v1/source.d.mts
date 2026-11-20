export interface LargeStadiumScene {
  era: 'heritage' | 'terraces' | 'contemporary';
  kind: 'stadium' | 'locker';
  stage: 9 | 10;
  name: string;
  rgb: Uint8Array;
}

export const LARGE_STADIUM_FAMILY: string;
export const SCENE_WIDTH: number;
export const SCENE_HEIGHT: number;
export const SCENE_ERAS: readonly string[];
export const SCENE_KINDS: readonly string[];
export const SCENE_STAGES: readonly number[];
export function renderScene(shade: (x: number, y: number) => number[]): Uint8Array;
export function sceneShade(
  era: string,
  kind: string,
  stage: number,
): (x: number, y: number) => number[];
export function largeStadiumScenes(): LargeStadiumScene[];
