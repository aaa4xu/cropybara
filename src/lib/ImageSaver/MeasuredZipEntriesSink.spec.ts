import { describe, expect, it, vi } from 'vitest';

import type { StoredZipEntrySource } from '$lib/ZipWriter';

import { MeasuredZipEntriesSinkFactory, type ZipEntriesTelemetry } from './MeasuredZipEntriesSink';
import type { ZipEntriesSink, ZipEntriesSinkFactory } from './ZipEntriesSink';

function entry(name: string, size: number): StoredZipEntrySource {
  return {
    name,
    bytes: new Uint8Array(size),
    size,
    crc32: 0,
    lastModified: 0,
  };
}

describe('MeasuredZipEntriesSinkFactory', () => {
  it('counts written entries and payload bytes after successful writes', async () => {
    const innerSink: ZipEntriesSink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const factory: ZipEntriesSinkFactory = {
      open: vi.fn(async () => innerSink),
    };
    const telemetry: ZipEntriesTelemetry = {
      entriesWritten: 0,
      payloadBytesWritten: 0,
    };

    const sink = await new MeasuredZipEntriesSinkFactory(factory, telemetry).open('chapter');

    await sink.write(entry('1.png', 10));
    await sink.write(entry('2.png', 20));
    await sink.close();

    expect(factory.open).toHaveBeenCalledWith('chapter');
    expect(innerSink.write).toHaveBeenCalledTimes(2);
    expect(innerSink.close).toHaveBeenCalled();
    expect(telemetry).toEqual({
      entriesWritten: 2,
      payloadBytesWritten: 30,
    });
  });

  it('does not count failed writes', async () => {
    const innerSink: ZipEntriesSink = {
      write: vi.fn(async () => {
        throw new Error('write failed');
      }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const telemetry: ZipEntriesTelemetry = {
      entriesWritten: 0,
      payloadBytesWritten: 0,
    };
    const sink = await new MeasuredZipEntriesSinkFactory(
      { open: vi.fn(async () => innerSink) },
      telemetry,
    ).open('chapter');

    await expect(sink.write(entry('1.png', 10))).rejects.toThrow('write failed');

    expect(telemetry).toEqual({
      entriesWritten: 0,
      payloadBytesWritten: 0,
    });
  });
});
