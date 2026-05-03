import type { ZipEntriesSink, ZipEntriesSinkFactory } from '$lib/ImageSaver/ZipEntriesSink';

import type { SaveResultInput } from './SaveResultService';

export type SaveResultExportInput = Omit<SaveResultInput, 'sink'> & {
  readonly name: string;
};

export interface SaveResultWriter {
  writeToSink(input: SaveResultInput): Promise<void>;
}

type SaveResultServiceProvider =
  | SaveResultWriter
  | (() => SaveResultWriter | Promise<SaveResultWriter>);

export class SaveResultExporter {
  public constructor(
    private readonly sinkFactory: ZipEntriesSinkFactory,
    private readonly serviceProvider: SaveResultServiceProvider,
  ) {}

  public async save(input: SaveResultExportInput): Promise<void> {
    let sink: ZipEntriesSink | null = null;

    try {
      sink = await this.sinkFactory.open(input.name);

      const service = await this.createService();
      await service.writeToSink({
        images: input.images,
        cuts: input.cuts,
        signal: input.signal,
        sink,
        onProgress: input.onProgress,
      });

      await sink.close();
      sink = null;
      input.onProgress?.();
    } catch (error) {
      await sink?.abort(error).catch(() => undefined);
      throw error;
    }
  }

  private createService(): SaveResultWriter | Promise<SaveResultWriter> {
    if (typeof this.serviceProvider === 'function') {
      return this.serviceProvider();
    }

    return this.serviceProvider;
  }
}
