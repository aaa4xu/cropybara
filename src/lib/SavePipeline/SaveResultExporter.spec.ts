import { describe, expect, it, vi } from 'vitest';

import type { ZipEntriesSink, ZipEntriesSinkFactory } from '$lib/ImageSaver/ZipEntriesSink';

import { SaveResultExporter } from './SaveResultExporter';

class FakeZipEntriesSink implements ZipEntriesSink {
  public readonly write = vi.fn(async () => undefined);
  public readonly close = vi.fn(async () => undefined);
  public readonly abort = vi.fn(async () => undefined);
}

class FakeZipEntriesSinkFactory implements ZipEntriesSinkFactory {
  public readonly open = vi.fn(async () => this.sink);

  public constructor(public readonly sink = new FakeZipEntriesSink()) {}
}

class FakeSaveResultService {
  public readonly writeToSink = vi.fn(async () => undefined);
}

const input = {
  name: 'result',
  images: [],
  cuts: [],
  signal: new AbortController().signal,
};

describe('SaveResultExporter', () => {
  it('opens sink, writes entries and closes on success', async () => {
    const factory = new FakeZipEntriesSinkFactory();
    const service = new FakeSaveResultService();
    const onProgress = vi.fn();

    await new SaveResultExporter(factory, service).save({ ...input, onProgress });

    expect(factory.open).toHaveBeenCalledWith('result');
    expect(service.writeToSink).toHaveBeenCalledWith({
      images: input.images,
      cuts: input.cuts,
      signal: input.signal,
      sink: factory.sink,
      onProgress,
    });
    expect(factory.sink.close).toHaveBeenCalledTimes(1);
    expect(factory.sink.abort).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('aborts sink when writeToSink fails', async () => {
    const factory = new FakeZipEntriesSinkFactory();
    const service = new FakeSaveResultService();
    const error = new Error('Write failed');
    service.writeToSink.mockRejectedValue(error);

    await expect(new SaveResultExporter(factory, service).save(input)).rejects.toThrow(error);

    expect(factory.sink.close).not.toHaveBeenCalled();
    expect(factory.sink.abort).toHaveBeenCalledWith(error);
  });

  it('aborts sink when close fails', async () => {
    const factory = new FakeZipEntriesSinkFactory();
    const service = new FakeSaveResultService();
    const error = new Error('Close failed');
    factory.sink.close.mockRejectedValue(error);

    await expect(new SaveResultExporter(factory, service).save(input)).rejects.toThrow(error);

    expect(factory.sink.abort).toHaveBeenCalledWith(error);
  });
});
