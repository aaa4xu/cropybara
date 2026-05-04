import { describe, expect, it } from 'vitest';

import { ImageFile } from '$lib/ImageFile';
import { ImageOutputFormat } from '$lib/ImageOutputFormat';

import { SlicePlanFactory } from './SlicePlanFactory';

function image(name: string, width: number, height: number): ImageFile {
  return new ImageFile(new File([''], name, { type: 'image/png' }), width, height);
}

describe('SlicePlanFactory', () => {
  it('pads slice names by total slice count', () => {
    const cuts = Array.from({ length: 104 }, (_, index) => index + 1);
    const jobs = new SlicePlanFactory().create([image('source.png', 10, 105)], cuts);

    expect(jobs[0].name).toBe('001.png');
    expect(jobs[1].name).toBe('002.png');
    expect(jobs[104].name).toBe('105.png');
  });

  it('uses the selected output format extension', () => {
    const jobs = new SlicePlanFactory().create(
      [image('source.png', 10, 100)],
      [50],
      ImageOutputFormat.Jpeg,
    );

    expect(jobs.map((job) => job.name)).toStrictEqual(['1.jpg', '2.jpg']);
  });

  it('keeps source ids and coordinates when a slice crosses image boundaries', () => {
    const jobs = new SlicePlanFactory().create(
      [image('first.png', 10, 100), image('second.png', 10, 100)],
      [50, 150],
    );

    expect(jobs[1]).toMatchObject({
      index: 1,
      name: '2.png',
      width: 10,
      height: 100,
    });
    expect(jobs[1].chunks).toStrictEqual([
      {
        sourceId: 0,
        srcX: 0,
        srcY: 50,
        srcWidth: 10,
        srcHeight: 50,
        dstX: 0,
        dstY: 0,
        dstWidth: 10,
        dstHeight: 50,
      },
      {
        sourceId: 1,
        srcX: 0,
        srcY: 0,
        srcWidth: 10,
        srcHeight: 50,
        dstX: 0,
        dstY: 50,
        dstWidth: 10,
        dstHeight: 50,
      },
    ]);
  });
});
