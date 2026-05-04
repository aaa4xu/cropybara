import type { ZipEntriesSink } from '$lib/ImageSaver/ZipEntriesSink';
import type { ImageFile } from '$lib/ImageFile';
import {
  DEFAULT_IMAGE_OUTPUT_OPTIONS,
  ImageOutputFormatRegistry,
  type ImageOutputOptions,
} from '$lib/ImageOutputFormat';
import type { StoredZipEntrySource } from '$lib/ZipWriter';

import { OrderedAsyncPool } from './OrderedAsyncPool';
import type { SliceEncoder } from './SliceEncoder';
import { SlicePlanFactory } from './SlicePlanFactory';
import type { EncodedSliceDto, SliceJobDto } from './SlicePipelineTypes';

export interface SaveResultInput {
  readonly images: readonly ImageFile[];
  readonly cuts: readonly number[];
  readonly signal: AbortSignal;
  readonly sink: ZipEntriesSink;
  readonly onProgress?: () => void;
}

export class SaveResultService {
  private readonly output: ImageOutputOptions;

  public constructor(
    private readonly planner: SlicePlanFactory,
    private readonly encoder: SliceEncoder,
    private readonly concurrency: number,
    output: ImageOutputOptions = DEFAULT_IMAGE_OUTPUT_OPTIONS,
  ) {
    this.output = ImageOutputFormatRegistry.normalizeOptions(output);
  }

  public async writeToSink(input: SaveResultInput): Promise<void> {
    const jobs = this.planner.create(input.images, input.cuts, this.output.format);
    const pool = new OrderedAsyncPool<SliceJobDto, StoredZipEntrySource>({
      concurrency: this.concurrency,
    });

    const entries = pool.process(
      jobs,
      async (job, signal): Promise<StoredZipEntrySource> => {
        const slice = await this.encoder.encode(job, signal);

        return this.toEntry(slice);
      },
      input.signal,
    );

    for await (const entry of entries) {
      await input.sink.write(entry);
      input.onProgress?.();
    }
  }

  private toEntry(slice: EncodedSliceDto): StoredZipEntrySource {
    return {
      name: slice.name,
      bytes: slice.bytes,
      size: slice.size,
      crc32: slice.crc32,
      lastModified: slice.lastModified,
    };
  }
}
