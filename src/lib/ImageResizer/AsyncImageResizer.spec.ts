import { describe, expect, it } from 'vitest';

import { calculateResizedImageSize } from './AsyncImageResizer';

describe('calculateResizedImageSize', () => {
  it('keeps at least one pixel of height for very wide images', () => {
    expect(
      calculateResizedImageSize(
        {
          name: 'wide.png',
          width: 10000,
          height: 1,
        },
        1200,
      ),
    ).toStrictEqual({ width: 1200, height: 1 });
  });

  it('rejects invalid target width', () => {
    expect(() =>
      calculateResizedImageSize(
        {
          name: 'page.png',
          width: 1200,
          height: 1800,
        },
        0,
      ),
    ).toThrow('Target width must be a positive number');
  });

  it('rejects invalid source dimensions', () => {
    expect(() =>
      calculateResizedImageSize(
        {
          name: 'empty.svg',
          width: 0,
          height: 100,
        },
        1200,
      ),
    ).toThrow('Image "empty.svg" has invalid dimensions: 0x100.');
  });
});
