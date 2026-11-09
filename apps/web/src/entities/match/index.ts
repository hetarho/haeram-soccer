/** Match entity: how a match is drawn and timed. Re-exports `logic.ts`, its framework-free entry (pitch, figure and kit painting, the presentation clock and archive playback, material views and advanced match statistics), beside the pitch skin hook, heat pitches, kit swatches and kit previews. */
export * from './logic';
export { usePitchSkin } from './model/usePitchSkin';
export { FIELD, HeatPitch, MaterialPitch } from './ui/HeatPitch';
export { KitPitchPreview } from './ui/KitPitchPreview';
export { KitSwatch } from './ui/KitSwatch';
