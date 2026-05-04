import type { StoredZipEntrySource } from '$lib/ZipWriter';

import type { ZipEntriesSink, ZipEntriesSinkFactory } from './ZipEntriesSink';

export interface ZipEntriesTelemetry {
  entriesWritten: number;
  payloadBytesWritten: number;
}

export class MeasuredZipEntriesSinkFactory implements ZipEntriesSinkFactory {
  public constructor(
    private readonly factory: ZipEntriesSinkFactory,
    private readonly telemetry: ZipEntriesTelemetry,
  ) {}

  public async open(name: string): Promise<ZipEntriesSink> {
    return new MeasuredZipEntriesSink(await this.factory.open(name), this.telemetry);
  }
}

class MeasuredZipEntriesSink implements ZipEntriesSink {
  public constructor(
    private readonly sink: ZipEntriesSink,
    private readonly telemetry: ZipEntriesTelemetry,
  ) {}

  public async write(entry: StoredZipEntrySource): Promise<void> {
    await this.sink.write(entry);
    this.telemetry.entriesWritten += 1;
    this.telemetry.payloadBytesWritten += entry.size;
  }

  public close(): Promise<void> {
    return this.sink.close();
  }

  public abort(error?: unknown): Promise<void> {
    return this.sink.abort(error);
  }
}
