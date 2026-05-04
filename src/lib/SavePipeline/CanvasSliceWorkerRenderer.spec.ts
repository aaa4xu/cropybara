import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas, loadImage } from 'canvas';

import { ImageOutputFormat } from '$lib/ImageOutputFormat';
import { Crc32 } from '$lib/ZipWriter';

import { CanvasSliceWorkerRenderer } from './CanvasSliceWorkerRenderer';
import type { SliceJobDto, SliceSourceDto } from './SlicePipelineTypes';

describe('CanvasSliceWorkerRenderer', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', async (file: File) => {
      return loadImage(Buffer.from(await file.arrayBuffer()));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a slice across source images and computes CRC32', async () => {
    const renderer = new CanvasSliceWorkerRenderer();
    const sources: SliceSourceDto[] = [
      source(0, 'first.png', ['#111111', '#ff0000', '#00ff00', '#0000ff']),
      source(1, 'second.png', ['#ffff00', '#00ffff']),
    ];
    const job: SliceJobDto = {
      index: 0,
      name: '1.png',
      width: 2,
      height: 3,
      chunks: [
        {
          sourceId: 0,
          srcX: 0,
          srcY: 2,
          srcWidth: 2,
          srcHeight: 2,
          dstX: 0,
          dstY: 0,
          dstWidth: 2,
          dstHeight: 2,
        },
        {
          sourceId: 1,
          srcX: 0,
          srcY: 0,
          srcWidth: 2,
          srcHeight: 1,
          dstX: 0,
          dstY: 2,
          dstWidth: 2,
          dstHeight: 1,
        },
      ],
    };

    renderer.registerSources(sources);
    const slice = await renderer.render(job);

    expect(slice).toMatchObject({
      index: 0,
      name: '1.png',
      type: 'image/png',
      size: slice.bytes.byteLength,
    });

    const crc32 = new Crc32();
    crc32.update(slice.bytes);
    expect(slice.crc32).toBe(crc32.digest());
    await expectRows(slice.bytes, ['#00ff00', '#0000ff', '#ffff00']);
    expect(performance.getEntriesByName('cropybara:save:slice:0:1.png:draw:start')).toHaveLength(0);
    expect(performance.getEntriesByName('cropybara:save:slice:0:1.png:draw')).toHaveLength(0);
  });

  it('encodes slices with the selected output format and quality', async () => {
    const renderer = new CanvasSliceWorkerRenderer();
    const sources: SliceSourceDto[] = [source(0, 'first.png', ['#111111', '#ff0000'])];
    const job: SliceJobDto = {
      index: 0,
      name: '1.jpg',
      width: 2,
      height: 1,
      chunks: [
        {
          sourceId: 0,
          srcX: 0,
          srcY: 1,
          srcWidth: 2,
          srcHeight: 1,
          dstX: 0,
          dstY: 0,
          dstWidth: 2,
          dstHeight: 1,
        },
      ],
    };

    renderer.registerSources(sources, {
      format: ImageOutputFormat.Jpeg,
      quality: 80,
    });
    const slice = await renderer.render(job);

    expect(slice).toMatchObject({
      name: '1.jpg',
      type: 'image/jpeg',
      size: slice.bytes.byteLength,
    });
    expect(Array.from(slice.bytes.slice(0, 3))).toStrictEqual([0xff, 0xd8, 0xff]);
  });

  it('rejects unknown source ids', async () => {
    const renderer = new CanvasSliceWorkerRenderer();

    await expect(
      renderer.render({
        index: 0,
        name: '1.png',
        width: 1,
        height: 1,
        chunks: [
          {
            sourceId: 404,
            srcX: 0,
            srcY: 0,
            srcWidth: 1,
            srcHeight: 1,
            dstX: 0,
            dstY: 0,
            dstWidth: 1,
            dstHeight: 1,
          },
        ],
      }),
    ).rejects.toThrow('Unknown source image: 404.');
  });
});

function source(id: number, name: string, rows: string[]): SliceSourceDto {
  return {
    id,
    file: pngFile(name, rows),
    width: 2,
    height: rows.length,
  };
}

function pngFile(name: string, rows: string[]): File {
  const canvas = createCanvas(2, rows.length);
  const ctx = canvas.getContext('2d');

  for (const [y, color] of rows.entries()) {
    ctx.fillStyle = color;
    ctx.fillRect(0, y, 2, 1);
  }

  return new File([canvas.toBuffer('image/png')], name, { type: 'image/png' });
}

async function expectRows(bytes: Uint8Array, colors: string[]): Promise<void> {
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  for (const [y, color] of colors.entries()) {
    const [red, green, blue] = ctx.getImageData(0, y, 1, 1).data;
    expect(rgbToHex(red, green, blue)).toBe(color);
  }
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}
