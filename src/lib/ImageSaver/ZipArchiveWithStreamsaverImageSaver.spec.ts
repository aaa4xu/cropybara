import { describe, expect, it, vi } from 'vitest';

import { writeReadableStreamToWritable } from './ZipArchiveWithStreamsaverImageSaver';

function createReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

describe('writeReadableStreamToWritable', () => {
  it('pipes through pipeTo when available', async () => {
    const fileStream = new WritableStream<Uint8Array>();
    const pipeTo = vi.fn().mockResolvedValue(undefined);
    const readableStream = {
      pipeTo,
    } as unknown as ReadableStream<Uint8Array>;

    await writeReadableStreamToWritable(readableStream, fileStream, true);

    expect(pipeTo).toHaveBeenCalledWith(fileStream);
  });

  it('awaits manual writes and closes the stream', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    const writtenChunks: Uint8Array[] = [];
    const close = vi.fn();
    const fileStream = new WritableStream<Uint8Array>({
      write(chunk) {
        writtenChunks.push(chunk);
      },
      close,
    });

    await writeReadableStreamToWritable(createReadableStream(chunks), fileStream, false);

    expect(writtenChunks).toStrictEqual(chunks);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('propagates manual write errors', async () => {
    const error = new Error('Od');
    const fileStream = new WritableStream<Uint8Array>({
      write() {
        throw error;
      },
    });

    await expect(
      writeReadableStreamToWritable(createReadableStream([new Uint8Array([1])]), fileStream, false),
    ).rejects.toThrow(error);
  });
});
