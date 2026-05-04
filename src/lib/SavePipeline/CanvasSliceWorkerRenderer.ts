import {
  DEFAULT_IMAGE_OUTPUT_OPTIONS,
  ImageOutputFormatRegistry,
  type ImageOutputOptions,
} from '$lib/ImageOutputFormat';
import { Crc32 } from '$lib/ZipWriter/Crc32';

import { ImageBitmapLruCache } from './ImageBitmapLruCache';
import type { EncodedSliceDto, SliceJobDto, SliceSourceDto } from './SlicePipelineTypes';

type SliceEncodeStage = 'encode' | 'draw' | 'blob' | 'bytes' | 'crc';
const MAX_IMAGE_BITMAP_CACHE_ITEMS = 3;

export class CanvasSliceWorkerRenderer {
  private readonly sources = new Map<number, File>();
  private readonly imageCache = new ImageBitmapLruCache(MAX_IMAGE_BITMAP_CACHE_ITEMS);
  private readonly canvas = new OffscreenCanvas(1, 1);
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private output = DEFAULT_IMAGE_OUTPUT_OPTIONS;

  public constructor() {
    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to create OffscreenCanvas 2D context.');
    }

    this.ctx = ctx;
  }

  public registerSources(
    sources: readonly SliceSourceDto[],
    output: ImageOutputOptions = DEFAULT_IMAGE_OUTPUT_OPTIONS,
  ): void {
    this.output = ImageOutputFormatRegistry.normalizeOptions(output);

    for (const source of sources) {
      this.sources.set(source.id, source.file);
    }
  }

  public dispose(): void {
    this.imageCache.dispose();
    this.sources.clear();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  public async render(job: SliceJobDto): Promise<EncodedSliceDto> {
    this.mark(job, 'encode', 'start');

    try {
      this.mark(job, 'draw', 'start');
      this.canvas.width = job.width;
      this.canvas.height = job.height;
      this.ctx.clearRect(0, 0, job.width, job.height);

      for (const chunk of job.chunks) {
        const image = await this.getImage(chunk.sourceId);

        this.ctx.drawImage(
          image,
          chunk.srcX,
          chunk.srcY,
          chunk.srcWidth,
          chunk.srcHeight,
          chunk.dstX,
          chunk.dstY,
          chunk.dstWidth,
          chunk.dstHeight,
        );
      }
      this.mark(job, 'draw', 'end');
      this.measure(job, 'draw');

      const encodeOptions = ImageOutputFormatRegistry.toEncodeOptions(this.output);

      this.mark(job, 'blob', 'start');
      const blob = await this.canvas.convertToBlob(encodeOptions);
      this.mark(job, 'blob', 'end');
      this.measure(job, 'blob');

      if (blob.type !== encodeOptions.type) {
        throw new Error(
          `Browser encoded "${job.name}" as ${blob.type || 'unknown'} instead of ${
            encodeOptions.type
          }.`,
        );
      }

      this.mark(job, 'bytes', 'start');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      this.mark(job, 'bytes', 'end');
      this.measure(job, 'bytes');

      this.mark(job, 'crc', 'start');
      const crc32 = new Crc32();
      crc32.update(bytes);
      this.mark(job, 'crc', 'end');
      this.measure(job, 'crc');

      return {
        index: job.index,
        name: job.name,
        type: encodeOptions.type,
        bytes,
        size: bytes.byteLength,
        crc32: crc32.digest(),
        lastModified: Date.now(),
      };
    } finally {
      this.mark(job, 'encode', 'end');
      this.measure(job, 'encode');
    }
  }

  private async getImage(sourceId: number): Promise<ImageBitmap> {
    const cached = this.imageCache.get(sourceId);

    if (cached) {
      return cached;
    }

    const file = this.sources.get(sourceId);

    if (!file) {
      throw new Error(`Unknown source image: ${sourceId}.`);
    }

    const image = await createImageBitmap(file);
    this.imageCache.set(sourceId, image);

    return image;
  }

  private mark(job: SliceJobDto, stage: SliceEncodeStage, point: 'start' | 'end'): void {
    performance.mark(`${this.traceName(job, stage)}:${point}`);
  }

  private measure(job: SliceJobDto, stage: SliceEncodeStage): void {
    const name = this.traceName(job, stage);
    const start = `${name}:start`;
    const end = `${name}:end`;

    try {
      performance.measure(name, start, end);
    } catch {
      // Missing marks should not affect export.
    } finally {
      performance.clearMarks(start);
      performance.clearMarks(end);
      performance.clearMeasures(name);
    }
  }

  private traceName(job: SliceJobDto, stage: SliceEncodeStage): string {
    return `cropybara:save:slice:${job.index}:${job.name}:${stage}`;
  }
}
