import { describe, expect, it, vi } from 'vitest';

import type { ZipEntriesSink } from '$lib/ImageSaver/ZipEntriesSink';
import { ImageFile } from '$lib/ImageFile';
import { ImageOutputFormat } from '$lib/ImageOutputFormat';
import { Crc32, type StoredZipEntrySource } from '$lib/ZipWriter';

import { SaveResultService } from './SaveResultService';
import type { SliceEncoder } from './SliceEncoder';
import { SlicePlanFactory } from './SlicePlanFactory';
import type { EncodedSliceDto, SliceJobDto } from './SlicePipelineTypes';

function image(name: string, width: number, height: number): ImageFile {
  return new ImageFile(new File([''], name, { type: 'image/png' }), width, height);
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encoded(job: SliceJobDto): EncodedSliceDto {
  const text = `slice-${job.index}`;
  const bytes = new TextEncoder().encode(text);
  const crc32 = new Crc32();
  crc32.update(bytes);

  return {
    index: job.index,
    name: job.name,
    type: 'image/png',
    bytes,
    size: bytes.byteLength,
    crc32: crc32.digest(),
    lastModified: 0,
  };
}

class FakeSliceEncoder implements SliceEncoder {
  public readonly jobs: SliceJobDto[] = [];

  public constructor(private readonly encodeFn: (job: SliceJobDto) => Promise<EncodedSliceDto>) {}

  public async encode(job: SliceJobDto, signal: AbortSignal): Promise<EncodedSliceDto> {
    signal.throwIfAborted();
    this.jobs.push(job);

    return this.encodeFn(job);
  }
}

class MemoryEntriesSink implements ZipEntriesSink {
  public readonly entries: StoredZipEntrySource[] = [];
  public readonly close = vi.fn();
  public readonly abort = vi.fn();

  public async write(entry: StoredZipEntrySource): Promise<void> {
    this.entries.push(entry);
  }
}

describe('SaveResultService', () => {
  it('encodes and saves entries in slice order', async () => {
    const encoder = new FakeSliceEncoder(async (job) => {
      await wait(job.index === 0 ? 10 : 0);
      return encoded(job);
    });
    const sink = new MemoryEntriesSink();
    const onProgress = vi.fn();

    await new SaveResultService(new SlicePlanFactory(), encoder, 2).writeToSink({
      images: [image('first.png', 10, 100)],
      cuts: [50],
      signal: new AbortController().signal,
      sink,
      onProgress,
    });

    expect(sink.entries.map((entry) => entry.name)).toStrictEqual(['1.png', '2.png']);
    expect(sink.entries.map((entry) => new TextDecoder().decode(entry.bytes))).toStrictEqual([
      'slice-0',
      'slice-1',
    ]);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(sink.close).not.toHaveBeenCalled();
    expect(sink.abort).not.toHaveBeenCalled();
  });

  it('plans entries with the selected output extension', async () => {
    const encoder = new FakeSliceEncoder(async (job) => ({
      ...encoded(job),
      type: 'image/jpeg',
    }));
    const sink = new MemoryEntriesSink();

    await new SaveResultService(new SlicePlanFactory(), encoder, 1, {
      format: ImageOutputFormat.Jpeg,
      quality: 80,
    }).writeToSink({
      images: [image('first.png', 10, 100)],
      cuts: [50],
      signal: new AbortController().signal,
      sink,
    });

    expect(sink.entries.map((entry) => entry.name)).toStrictEqual(['1.jpg', '2.jpg']);
    expect(encoder.jobs.map((job) => job.name)).toStrictEqual(['1.jpg', '2.jpg']);
  });

  it('propagates encoder errors', async () => {
    const error = new Error('Encode failed');
    const encoder = new FakeSliceEncoder(async () => {
      throw error;
    });
    const sink = new MemoryEntriesSink();

    await expect(
      new SaveResultService(new SlicePlanFactory(), encoder, 1).writeToSink({
        images: [image('first.png', 10, 100)],
        cuts: [],
        signal: new AbortController().signal,
        sink,
      }),
    ).rejects.toThrow(error);
  });

  it('propagates sink errors', async () => {
    const error = new Error('Save failed');
    const encoder = new FakeSliceEncoder(async (job) => encoded(job));
    const sink: ZipEntriesSink = {
      async write() {
        throw error;
      },
      async close() {},
      async abort() {},
    };

    await expect(
      new SaveResultService(new SlicePlanFactory(), encoder, 1).writeToSink({
        images: [image('first.png', 10, 100)],
        cuts: [],
        signal: new AbortController().signal,
        sink,
      }),
    ).rejects.toThrow(error);
  });
});
