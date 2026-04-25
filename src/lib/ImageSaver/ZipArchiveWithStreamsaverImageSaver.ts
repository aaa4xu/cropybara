import type { ImagesSaver } from './ImagesSaver';

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
    const [{ default: streamSaver }, { default: JSZip }] = await Promise.all([
      import('streamsaver'),
      import('jszip'),
    ]);

    const zip = new JSZip();

    for await (const file of images) {
      zip.file(file.name, file.bytes());
      onprogress?.();
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

    const fileStream = streamSaver.createWriteStream(name + '.zip', {
      size: content.size,
    });

    const readableStream = content.stream();

    await writeReadableStreamToWritable(readableStream, fileStream);
    console.log('done writing');
    onprogress?.();
  }
}
