import { describe, expect, it, vi } from 'vitest';

import type { StoredZipEntrySource, ZipEntryWriter, ZipWritableSink } from '$lib/ZipWriter';

import { KnownEntryZipEntriesSink } from './KnownEntryZipEntriesSink';

class FakeZipEntryWriter implements ZipEntryWriter {
  public readonly addEntry = vi.fn(async () => undefined);
  public readonly close = vi.fn(async () => undefined);
}

class FakeZipWritableSink implements ZipWritableSink {
  public readonly write = vi.fn(async () => undefined);
  public readonly close = vi.fn(async () => undefined);
  public readonly abort = vi.fn(async () => undefined);
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function entry(): StoredZipEntrySource {
  return {
    name: '1.png',
    bytes: new Uint8Array([1]),
    size: 1,
    crc32: 0,
    lastModified: 0,
  };
}

describe('KnownEntryZipEntriesSink', () => {
  it('serializes close and abort calls', async () => {
    const writer = new FakeZipEntryWriter();
    const writableSink = new FakeZipWritableSink();
    const closeGate = deferred<undefined>();
    writer.close.mockReturnValue(closeGate.promise);

    const sink = new KnownEntryZipEntriesSink(writer, writableSink);
    const close = sink.close();
    const abort = sink.abort(new Error('Abort requested'));
    await wait();

    expect(writer.close).toHaveBeenCalledTimes(1);
    expect(writableSink.abort).not.toHaveBeenCalled();

    closeGate.resolve(undefined);
    await close;
    await abort;

    expect(writableSink.abort).not.toHaveBeenCalled();
  });

  it('aborts underlying sink when writer.close fails', async () => {
    const writer = new FakeZipEntryWriter();
    const writableSink = new FakeZipWritableSink();
    const error = new Error('Close failed');
    writer.close.mockRejectedValue(error);

    const sink = new KnownEntryZipEntriesSink(writer, writableSink);

    await expect(sink.close()).rejects.toThrow(error);
    expect(writableSink.abort).toHaveBeenCalledWith(error);
  });

  it('does not abort after successful close', async () => {
    const writer = new FakeZipEntryWriter();
    const writableSink = new FakeZipWritableSink();
    const sink = new KnownEntryZipEntriesSink(writer, writableSink);

    await sink.close();
    await sink.abort(new Error('Abort requested'));

    expect(writer.close).toHaveBeenCalledTimes(1);
    expect(writableSink.abort).not.toHaveBeenCalled();
  });

  it('rejects write after close', async () => {
    const writer = new FakeZipEntryWriter();
    const writableSink = new FakeZipWritableSink();
    const sink = new KnownEntryZipEntriesSink(writer, writableSink);

    await sink.close();

    await expect(sink.write(entry())).rejects.toThrow(
      'Cannot write ZIP entries while sink is closed.',
    );
  });

  it('rejects write after abort', async () => {
    const writer = new FakeZipEntryWriter();
    const writableSink = new FakeZipWritableSink();
    const sink = new KnownEntryZipEntriesSink(writer, writableSink);

    await sink.abort(new Error('Abort requested'));

    await expect(sink.write(entry())).rejects.toThrow(
      'Cannot write ZIP entries while sink is aborted.',
    );
  });
});
