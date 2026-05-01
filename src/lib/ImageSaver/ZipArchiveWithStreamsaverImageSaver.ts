import type { ImagesSaver } from './ImagesSaver';
import { StoredZipWriter, WritableStreamSink } from '$lib/ZipWriter';

export async function writeReadableStreamToWritable(
  readableStream: ReadableStream<Uint8Array>,
  fileStream: WritableStream<Uint8Array>,
  usePipeTo = typeof window !== 'undefined' &&
    Boolean(window.WritableStream) &&
    Boolean(readableStream.pipeTo),
): Promise<void> {
  // Safari-like browsers can lack a usable WritableStream path for StreamSaver.
  if (usePipeTo) {
    return readableStream.pipeTo(fileStream);
  }

  const writer = fileStream.getWriter();
  const reader = readableStream.getReader();

  try {
    while (true) {
      const res = await reader.read();

      if (res.done) {
        await writer.close();
        return;
      }

      await writer.write(res.value);
    }
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
}

export class ZipArchiveWithStreamsaverImageSaver implements ImagesSaver {
  public async save(
    name: string,
    images: AsyncGenerator<File>,
    onprogress?: () => void,
  ): Promise<void> {
    const { default: streamSaver } = await import('streamsaver');
    const fileStream = streamSaver.createWriteStream(name + '.zip');
    const sink = new WritableStreamSink(fileStream);

    try {
      await new StoredZipWriter(sink).write(images, onprogress);
    } catch (error) {
      await sink.abort(error).catch(() => undefined);
      throw error;
    }
  }
}
