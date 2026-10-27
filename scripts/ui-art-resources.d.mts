interface Atlas {
  file: string;
  width: number;
  height: number;
  pixels: Uint8Array;
}
interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface UiAsset {
  file: string;
  source: string;
  crop?: Crop;
  filter: string;
  bytes: number;
  sha256: string;
}
export const UI_PICTOGRAMS: readonly string[];
export const UI_ART_ENCODING: Readonly<{
  frameWidth: number;
  frameSlice: number;
  iconWidth: number;
  tileWidth: number;
  sidebarWidth: number;
  quality: number;
}>;
export function verifyUiAssets(output: string): Promise<number>;
export function createUiArtPipeline(options: { sources: string; output: string }): Promise<{
  assets: UiAsset[];
  decode(file: string): Atlas;
  bounds(
    sheet: Atlas,
    col: number,
    row: number,
    cols: number,
    rows: number,
    threshold?: number,
  ): Crop;
  encode(source: string, name: string, crop?: Crop, filter?: string): Promise<void>;
  close(): Promise<void>;
}>;
export function isolatedAtlasBounds(
  sheet: Atlas,
  cols: number,
  rows: number,
  threshold?: number,
): Crop[];
