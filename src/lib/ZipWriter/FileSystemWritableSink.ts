import type { ZipWritableSink } from './ZipWritableSink';

export class FileSystemWritableSink implements ZipWritableSink {
  public constructor(private readonly fileStream: FileSystemWritableFileStream) {}

  public async write(chunk: Uint8Array): Promise<void> {
    await this.fileStream.write(chunk);
  }

  public async close(): Promise<void> {
    await this.fileStream.close();
  }

  public async abort(): Promise<void> {
    if ('abort' in this.fileStream) {
      await this.fileStream.abort();
    }
  }
}
