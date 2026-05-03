import { browser } from '$app/environment';
import { markTrace, measureTrace } from '$lib/utils/performanceTrace';
import { FileSystemWritableSink, KnownEntryZipWriter } from '$lib/ZipWriter';

import { KnownEntryZipEntriesSink } from './KnownEntryZipEntriesSink';
import type { ZipEntriesSink, ZipEntriesSinkFactory } from './ZipEntriesSink';

export class ZipEntriesWithFSImageSaver implements ZipEntriesSinkFactory {
  public static readonly isSupported = browser && 'showSaveFilePicker' in window;

  public async open(name: string): Promise<ZipEntriesSink> {
    const handle = await this.selectSaveFile(name);
    const fileStream = await handle.createWritable();
    const writableSink = new FileSystemWritableSink(fileStream);

    return new KnownEntryZipEntriesSink(new KnownEntryZipWriter(writableSink), writableSink);
  }

  private async selectSaveFile(name: string): Promise<FileSystemFileHandle> {
    markTrace('save:location-picker:start');

    try {
      // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
      return await showSaveFilePicker({
        id: 'cropybara-results-zip',
        startIn: 'downloads',
        suggestedName: `${name}.zip`,
        types: [
          {
            description: 'Zip archive',
            accept: { 'application/zip': ['.zip'] },
          },
        ],
      });
    } finally {
      markTrace('save:location-picker:end');
      measureTrace(
        'save:location-picker',
        'save:location-picker:start',
        'save:location-picker:end',
      );
    }
  }
}
