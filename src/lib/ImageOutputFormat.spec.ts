import { describe, expect, it } from 'vitest';

import { ImageOutputFormat, ImageOutputFormatRegistry } from './ImageOutputFormat';

describe('ImageOutputFormatRegistry', () => {
  it('maps formats to MIME types and file extensions', () => {
    expect(ImageOutputFormatRegistry.get(ImageOutputFormat.Png)).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      canUseQuality: false,
    });
    expect(ImageOutputFormatRegistry.get(ImageOutputFormat.Jpeg)).toMatchObject({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      canUseQuality: true,
    });
  });

  it('converts percentage quality into canvas encoder quality', () => {
    expect(
      ImageOutputFormatRegistry.toEncodeOptions({
        format: ImageOutputFormat.Webp,
        quality: 80,
      }),
    ).toStrictEqual({
      type: 'image/webp',
      quality: 0.8,
    });
  });

  it('omits quality for PNG output', () => {
    expect(
      ImageOutputFormatRegistry.toEncodeOptions({
        format: ImageOutputFormat.Png,
        quality: 80,
      }),
    ).toStrictEqual({
      type: 'image/png',
    });
  });

  it('normalizes output options to cloneable primitives', () => {
    expect(
      ImageOutputFormatRegistry.normalizeOptions({
        format: ImageOutputFormat.Jpeg,
        quality: 80,
      }),
    ).toStrictEqual({
      format: ImageOutputFormat.Jpeg,
      quality: 80,
    });
    expect(
      ImageOutputFormatRegistry.normalizeOptions({
        format: ImageOutputFormat.Png,
        quality: 80,
      }),
    ).toStrictEqual({
      format: ImageOutputFormat.Png,
    });
  });
});
