import type { StoredZipEntrySource, ZipEntryWriter, ZipWritableSink } from '$lib/ZipWriter';

import type { ZipEntriesSink } from './ZipEntriesSink';

enum ZipEntriesSinkState {
  Open = 'open',
  Closing = 'closing',
  Closed = 'closed',
  Aborted = 'aborted',
}

export class KnownEntryZipEntriesSink implements ZipEntriesSink {
  private state = ZipEntriesSinkState.Open;
  private operationQueue: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly writer: ZipEntryWriter,
    private readonly sink: ZipWritableSink,
  ) {}

  public write(entry: StoredZipEntrySource): Promise<void> {
    return this.enqueue(async () => {
      this.assertOpen();
      await this.writer.addEntry(entry);
    });
  }

  public close(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state === ZipEntriesSinkState.Closed) return;
      if (this.state === ZipEntriesSinkState.Aborted) return;

      this.assertOpen();
      this.state = ZipEntriesSinkState.Closing;

      try {
        await this.writer.close();
        this.state = ZipEntriesSinkState.Closed;
      } catch (error) {
        this.state = ZipEntriesSinkState.Aborted;
        await this.sink.abort(error).catch(() => undefined);
        throw error;
      }
    });
  }

  public abort(error?: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.state === ZipEntriesSinkState.Closed) return;
      if (this.state === ZipEntriesSinkState.Aborted) return;

      this.state = ZipEntriesSinkState.Aborted;
      await this.sink.abort(error);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.catch(() => undefined);

    return result;
  }

  private assertOpen(): void {
    if (this.state !== ZipEntriesSinkState.Open) {
      throw new Error(`Cannot write ZIP entries while sink is ${this.state}.`);
    }
  }
}
