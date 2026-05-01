import type { ZipWritableSink } from './ZipWritableSink';

export class WritableStreamSink implements ZipWritableSink {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private released = false;

  public constructor(fileStream: WritableStream<Uint8Array>) {
    this.writer = fileStream.getWriter();
  }

  public async write(chunk: Uint8Array): Promise<void> {
    await this.writer.write(chunk);
  }

  public async close(): Promise<void> {
    try {
      await this.writer.close();
    } finally {
      this.releaseLock();
    }
  }

  public async abort(error?: unknown): Promise<void> {
    try {
      await this.writer.abort(error);
    } finally {
      this.releaseLock();
    }
  }

  private releaseLock() {
    if (this.released) return;
    this.released = true;
    this.writer.releaseLock();
  }
}
