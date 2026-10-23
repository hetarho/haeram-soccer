import { writeFile } from 'node:fs/promises';

/** Keep review captures small enough to version beside their image sources. */
export async function savePrintCapture(page, path) {
  const png = await page.screenshot();
  const encoded = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  }, png.toString('base64'));
  // WebKit falls back to PNG when its canvas encoder does not support WebP.
  const destination = encoded.startsWith('data:image/webp;')
    ? path
    : path.replace(/\.webp$/, '.png');
  await writeFile(destination, Buffer.from(encoded.split(',')[1], 'base64'));
}
