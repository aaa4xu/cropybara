import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import { StoredZipWriter, type ZipWritableSink } from '$lib/ZipWriter';

class MemoryZipSink implements ZipWritableSink {
  public readonly chunks: Uint8Array[] = [];
  public readonly close = vi.fn();
  public readonly abort = vi.fn();

  public async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(new Uint8Array(chunk));
  }

  public bytes(): Uint8Array {
    const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return bytes;
  }
}

async function* files(items: File[]): AsyncGenerator<File> {
  for (const file of items) {
    yield file;
  }
}

describe('StoredZipWriter', () => {
  it('writes a valid ZIP archive with stored files', async () => {
    const sink = new MemoryZipSink();

    await new StoredZipWriter(sink).write(
      files([
        new File(['one'], '1.txt', { type: 'text/plain' }),
        new File(['два'], 'папка/2.txt', { type: 'text/plain' }),
      ]),
    );

    const archive = await JSZip.loadAsync(sink.bytes());

    expect(Object.keys(archive.files).sort()).toStrictEqual(['1.txt', 'папка/2.txt']);
    await expect(archive.file('1.txt')?.async('string')).resolves.toBe('one');
    await expect(archive.file('папка/2.txt')?.async('string')).resolves.toBe('два');
    expect(sink.close).toHaveBeenCalledTimes(1);
    expect(sink.abort).not.toHaveBeenCalled();
  });

  it('reports progress after every file and after archive finalization', async () => {
    const sink = new MemoryZipSink();
    const onprogress = vi.fn();

    await new StoredZipWriter(sink).write(
      files([
        new File(['a'], 'a.txt', { type: 'text/plain' }),
        new File(['b'], 'b.txt', { type: 'text/plain' }),
      ]),
      onprogress,
    );

    expect(onprogress).toHaveBeenCalledTimes(3);
  });
});
