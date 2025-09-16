import type { ImagesSaver } from './ImagesSaver';
import { browser } from '$app/environment';

export class ZipArchiveWithFSImageSaver implements ImagesSaver {
  public static readonly isSupported = browser && 'showSaveFilePicker' in window;

  public async save(
    name: string,
    images: AsyncGenerator<File>,
    onprogress?: () => void,
  ): Promise<void> {
    const jszipPromise = import('jszip');
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
      const { default: JSZip } = await jszipPromise;

      const zip = new JSZip();

      for await (const file of images) {
        zip.file(file.name, file.bytes());
        onprogress?.();
      }

      const stream = zip.generateInternalStream({
        type: 'arraybuffer',
        streamFiles: true,
        compression: 'STORE',
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => {
          void fileStream!.write(chunk).catch(reject);
        });
        stream.on('end', () => {
          fileStream!.close().then(resolve).catch(reject);
        });
        stream.on('error', reject);
        stream.resume();
      });
      onprogress?.();
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
