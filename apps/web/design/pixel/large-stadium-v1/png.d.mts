export function encodeRgbPng(width: number, height: number, rgb: Uint8Array): Buffer;
export function decodeRgbPng(png: Buffer): { width: number; height: number; rgb: Uint8Array };
