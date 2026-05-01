import { describe, it, expect } from 'vitest';
import { NodeImageFile } from '$lib/NodeImageFile';
import { PixelComparisonDetector } from './PixelComparisonDetector';
import path from 'node:path';
import { createCanvas } from 'canvas';

describe('PixelComparisonDetector', () => {
  it('should find multiple cuts at regular intervals on plain image', async () => {
    const image = await NodeImageFile.fromFS(fixture('50x1600.jpg'));
    const cuts = await PixelComparisonDetector.process([image], {
      step: 5,
      margins: 5,
      maxDistance: 300,
      maxSearchDeviationFactor: 0.5,
      sensitivity: 0.9,
    });

    expect(cuts).toStrictEqual([300, 600, 900, 1200, 1500]);
  });

  it('should make content-aware cuts avoiding distinct image features', async () => {
    const image = await NodeImageFile.fromFS(fixture('100x300.png'));
    const cuts = await PixelComparisonDetector.process([image], {
      step: 5,
      margins: 5,
      maxDistance: 100,
      maxSearchDeviationFactor: 0.5,
      sensitivity: 0.9,
    });

    expect(cuts).toStrictEqual([100, 190, 255]);
  });

  it('should keep regular cuts across image boundaries', async () => {
    const images = [createSolidImage(64, 180, '#202020'), createSolidImage(64, 140, '#404040')];
    const cuts = await PixelComparisonDetector.process(images, {
      step: 5,
      margins: 5,
      maxDistance: 100,
      maxSearchDeviationFactor: 0.5,
      sensitivity: 0.9,
    });

    expect(cuts).toStrictEqual([100, 200, 300]);
  });
});

function fixture(name: string) {
  return path.join(__dirname, '__fixtures__', name);
}

function createSolidImage(width: number, height: number, color: string) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  const buffer = canvas.toBuffer('image/png');
  const name = `solid-${width}x${height}.png`;
  const file = new File([buffer], name, { type: 'image/png' });

  return new NodeImageFile(file, width, height, name);
}
