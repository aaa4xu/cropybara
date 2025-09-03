import { createCanvas, loadImage } from 'canvas';

export const losslessThreshold = 0.000001;

export async function mae(value: Uint8Array | string, golden: Uint8Array | string) {
  const [img1, img2] = await Promise.all([
    loadImage(typeof value === 'string' ? value : Buffer.from(value)),
    loadImage(typeof golden === 'string' ? golden : Buffer.from(golden)),
  ]);

  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error(
      `Image dimensions do not match. Expected: ${img2.width}x${img2.height}, Actual: ${img1.width}x${img1.height}`,
    );
  }

  const width = img1.width;
  const height = img1.height;
  const totalRgbChannels = width * height * 3;

  if (totalRgbChannels === 0) {
    throw new Error('Image has no pixels.');
  }

  // Draw both images to canvases and read RGBA buffers
  const canvas1 = createCanvas(width, height);
  const ctx1 = canvas1.getContext('2d');
  ctx1.drawImage(img1, 0, 0);
  const data1 = ctx1.getImageData(0, 0, width, height).data;

  const canvas2 = createCanvas(width, height);
  const ctx2 = canvas2.getContext('2d');
  ctx2.drawImage(img2, 0, 0);
  const data2 = ctx2.getImageData(0, 0, width, height).data;

  // Compute MAE over RGB channels only (ignore alpha)
  let totalDifference = 0;
  for (let i = 0; i < data1.length; i += 4) {
    totalDifference += Math.abs(data1[i] - data2[i]); // R
    totalDifference += Math.abs(data1[i + 1] - data2[i + 1]); // G
    totalDifference += Math.abs(data1[i + 2] - data2[i + 2]); // B
  }

  return totalDifference / totalRgbChannels;
}
