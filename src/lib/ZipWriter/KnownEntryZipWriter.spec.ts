import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import {
  Crc32,
  KnownEntryZipWriter,
  type StoredZipEntrySource,
  type ZipWritableSink,
} from '$lib/ZipWriter';

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

function entry(name: string, text: string, crc32 = crc(text)): StoredZipEntrySource {
  const bytes = new TextEncoder().encode(text);

  return {
    name,
    bytes,
    size: bytes.byteLength,
    crc32,
    lastModified: 0,
  };
}

function crc(text: string): number {
  const crc32 = new Crc32();
  crc32.update(new TextEncoder().encode(text));

  return crc32.digest();
}

describe('KnownEntryZipWriter', () => {
  it('writes a valid ZIP archive from known stored entries', async () => {
    const sink = new MemoryZipSink();
    const writer = new KnownEntryZipWriter(sink);

    await writer.addEntry(entry('1.txt', 'one'));
    await writer.addEntry(entry('папка/2.txt', 'два'));
    await writer.close();

    const archive = await JSZip.loadAsync(sink.bytes(), { checkCRC32: true });

    expect(Object.keys(archive.files).sort()).toStrictEqual(['1.txt', 'папка/2.txt']);
    await expect(archive.file('1.txt')?.async('string')).resolves.toBe('one');
    await expect(archive.file('папка/2.txt')?.async('string')).resolves.toBe('два');
    expect(sink.close).toHaveBeenCalledTimes(1);
    expect(sink.abort).not.toHaveBeenCalled();
  });

  it('uses the supplied CRC instead of recalculating it', async () => {
    const sink = new MemoryZipSink();
    const writer = new KnownEntryZipWriter(sink);

    await writer.addEntry(entry('bad.txt', 'payload', 0));
    await writer.close();

    await expect(JSZip.loadAsync(sink.bytes(), { checkCRC32: true })).rejects.toThrow();
  });

  it('rejects entries with mismatched size', async () => {
    const sink = new MemoryZipSink();
    const writer = new KnownEntryZipWriter(sink);

    await expect(
      writer.addEntry({
        name: 'bad.txt',
        bytes: new TextEncoder().encode('abc'),
        size: 10,
        crc32: 0,
        lastModified: 0,
      }),
    ).rejects.toThrow('size mismatch');
  });
});
