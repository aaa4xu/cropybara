import { KnownEntryZipWriter, WritableStreamSink } from '$lib/ZipWriter';

import { KnownEntryZipEntriesSink } from './KnownEntryZipEntriesSink';
import type { ZipEntriesSink, ZipEntriesSinkFactory } from './ZipEntriesSink';

export class ZipEntriesWithStreamsaverImageSaver implements ZipEntriesSinkFactory {
  public async open(name: string): Promise<ZipEntriesSink> {
    const { default: streamSaver } = await import('streamsaver');
    const fileStream = streamSaver.createWriteStream(`${name}.zip`);
    const writableSink = new WritableStreamSink(fileStream);

    return new KnownEntryZipEntriesSink(new KnownEntryZipWriter(writableSink), writableSink);
  }
}
