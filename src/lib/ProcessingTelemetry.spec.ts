import { describe, expect, it } from 'vitest';

import { ConfigDenoiser, ConfigDetector, ConfigUnwatermark, type ConfigState } from './ConfigState';
import { ImageFile } from './ImageFile';
import { ImageOutputFormat } from './ImageOutputFormat';
import { createProcessingTelemetry, ratePerSecond } from './ProcessingTelemetry';

function image(name: string, width: number, height: number, bytes: number): ImageFile {
  return new ImageFile(new File(['x'.repeat(bytes)], name, { type: 'image/png' }), width, height);
}

describe('ProcessingTelemetry', () => {
  it('summarizes image, config, output, and save metrics', () => {
    const config: ConfigState = {
      name: 'chapter',
      detector: ConfigDetector.PixelComparison,
      denoiser: ConfigDenoiser.Off,
      unwatermark: ConfigUnwatermark.Off,
      limit: 2000,
      sensitivity: 90,
      step: 5,
      margins: 8,
      output: {
        format: ImageOutputFormat.Webp,
        quality: 86,
      },
    };

    expect(
      createProcessingTelemetry({
        processingId: 'save-1',
        images: [image('a.png', 100, 200, 10), image('b.png', 120, 300, 20)],
        cuts: [150, 350],
        config,
        output: config.output,
        saveBackend: 'file-system-access',
        workerCount: 3,
      }),
    ).toEqual({
      processing_id: 'save-1',
      detector: 'PixelComparison',
      denoiser: 'Off',
      unwatermark: 'Off',
      limit: 2000,
      sensitivity: 90,
      step: 5,
      margins: 8,
      output_format: 'webp',
      output_quality: 86,
      save_backend: 'file-system-access',
      worker_count: 3,
      file_count: 2,
      cut_count: 2,
      slice_count: 3,
      input_total_bytes: 30,
      input_total_mib: 0,
      input_total_pixels: 56000,
      input_total_megapixels: 0.06,
      input_total_height: 500,
      input_min_width: 100,
      input_max_width: 120,
      input_min_height: 200,
      input_max_height: 300,
      file_count_bucket: '2-5',
      input_megapixels_bucket: '<10',
    });
  });

  it('omits pixel-comparison-only properties for manual saves', () => {
    const config: ConfigState = {
      name: 'manual',
      detector: ConfigDetector.Manual,
      denoiser: ConfigDenoiser.Off,
      unwatermark: ConfigUnwatermark.Off,
      limit: 2000,
      output: {
        format: ImageOutputFormat.Png,
      },
    };

    const metrics = createProcessingTelemetry({
      processingId: 'save-2',
      images: [image('a.png', 100, 100, 1)],
      cuts: [],
      config,
      output: config.output,
      saveBackend: 'streamsaver',
      workerCount: 1,
    });

    expect(metrics).not.toHaveProperty('sensitivity');
    expect(metrics).not.toHaveProperty('step');
    expect(metrics).not.toHaveProperty('margins');
    expect(metrics).not.toHaveProperty('output_quality');
  });

  it('calculates rounded rates only for positive durations', () => {
    expect(ratePerSecond(1000, 250)).toBe(4000);
    expect(ratePerSecond(1000, 0)).toBeUndefined();
  });
});
