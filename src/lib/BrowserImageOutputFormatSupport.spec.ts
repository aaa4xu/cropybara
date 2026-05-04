import { describe, expect, it } from 'vitest';

import { BrowserImageOutputFormatSupport } from './BrowserImageOutputFormatSupport';
import { ImageOutputFormat } from './ImageOutputFormat';

describe('BrowserImageOutputFormatSupport', () => {
  it('keeps only formats encoded natively by the current canvas implementation', async () => {
    const supported = await BrowserImageOutputFormatSupport.detect();

    expect(supported.map((format) => format.format)).toContain(ImageOutputFormat.Png);
    expect(supported.map((format) => format.format)).toContain(ImageOutputFormat.Jpeg);
    expect(supported.map((format) => format.format)).not.toContain(ImageOutputFormat.Webp);
  });
});
