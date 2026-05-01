import type { ImagesSaver } from './ImagesSaver';
import { browser } from '$app/environment';
import { FileSystemWritableSink, StoredZipWriter } from '$lib/ZipWriter';

export class ZipArchiveWithFSImageSaver implements ImagesSaver {
  public static readonly isSupported = browser && 'showSaveFilePicker' in window;

  public async save(
    name: string,
    images: AsyncGenerator<File>,
    onprogress?: () => void,
  ): Promise<void> {
    // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
    const handle: FileSystemFileHandle = await showSaveFilePicker({
      id: 'cropybara-results-zip',
      startIn: 'downloads',
      suggestedName: name + '.zip',
      types: [
        {
          description: 'Zip archive',
          accept: { 'application/zip': ['.zip'] },
        },
      ],
    });

    let fileStream: FileSystemWritableFileStream | null = null;
    try {
      fileStream = await handle.createWritable();
      await new StoredZipWriter(new FileSystemWritableSink(fileStream)).write(images, onprogress);
    } catch (err) {
      if (fileStream && 'abort' in fileStream) {
        try {
          await fileStream.abort();
        } catch (abortErr) {
          console.error('Failed to abort the file stream after error', abortErr);
        }
      }
      throw err;
    }
  }
}
