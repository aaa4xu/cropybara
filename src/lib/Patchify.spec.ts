import { describe, expect, it, vi } from 'vitest';
import { Patchify } from './Patchify';
import { ImageFile } from '$lib/ImageFile';
import { NodeImageFile } from '$lib/NodeImageFile';
import { createCanvas, loadImage } from 'canvas';

describe('Patchify', () => {
  it('generates a tiled recipe that covers the full image area', () => {
    const file = new File([''], 'dummy.png', { type: 'image/png' });
    const image = new ImageFile(file, 64, 48);

    const patchify = new Patchify(image, 32, 8);

    expect(patchify.recipe).toStrictEqual([
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 32, y: 0 },
      { x: 0, y: 16 },
      { x: 24, y: 16 },
      { x: 32, y: 16 },
    ]);
  });

  it('throws when overlap is not smaller than the patch size', () => {
    const file = new File([''], 'dummy.png', { type: 'image/png' });
    const image = new ImageFile(file, 32, 32);

    expect(() => new Patchify(image, 16, 16)).toThrow(
      'minOverlap (16) must be less than patch size (16).',
    );
  });

  it('processes every patch and stitches the original image back together', async () => {
    const { imageFile, pixels } = createGradientImage(4, 4);
    const patchify = new Patchify(imageFile, 2, 1);

    const patchProcessor = vi.fn(async (patch) => patch);

    const result = await patchify.process(patchProcessor);

    expect(patchProcessor).toHaveBeenCalledTimes(patchify.recipe.length);
    expect(result.width).toBe(imageFile.width);
    expect(result.height).toBe(imageFile.height);

    const buffer = Buffer.from(await result.arrayBuffer());
    const image = await loadImage(buffer);
    const canvas = createCanvas(imageFile.width, imageFile.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const reconstructed = ctx.getImageData(0, 0, imageFile.width, imageFile.height);

    expect(Array.from(reconstructed.data)).toStrictEqual(Array.from(pixels));
  });
});

function createGradientImage(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      data[index] = (x * 50) % 256;
      data[index + 1] = (y * 70) % 256;
      data[index + 2] = (x * 30 + y * 40) % 256;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  const file = new File([buffer], 'patchify-source.png', { type: 'image/png' });
  const imageFile = new NodeImageFile(file, width, height, 'patchify-source.png');

  return { imageFile, pixels: imageData.data };
}
