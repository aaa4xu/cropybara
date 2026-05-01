import { StreamingZipWriter } from './StreamingZipWriter';
import type { ZipWritableSink } from './ZipWritableSink';

export class StoredZipWriter {
  public constructor(private readonly sink: ZipWritableSink) {}

  public async write(files: AsyncGenerator<File>, onprogress?: () => void): Promise<void> {
    const writer = new StreamingZipWriter(this.sink);

    for await (const file of files) {
      await writer.addFile(file);
      onprogress?.();
    }

    await writer.close();
    onprogress?.();
  }
}
