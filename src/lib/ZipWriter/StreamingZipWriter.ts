import { Crc32 } from './Crc32';
import { DosDateTime } from './DosDateTime';
import { ZipEntry } from './ZipEntry';
import { ZipFormat } from './ZipFormat';
import { ZipHeaderFactory } from './ZipHeaderFactory';
import type { ZipWritableSink } from './ZipWritableSink';

export class StreamingZipWriter {
  private readonly entries: ZipEntry[] = [];
  private readonly textEncoder = new TextEncoder();
  private readonly headers = new ZipHeaderFactory();
  private offset = 0;
  private closed = false;

  public constructor(private readonly sink: ZipWritableSink) {}

  public async addFile(file: File): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot add files after closing the ZIP archive');
    }

    const nameBytes = this.textEncoder.encode(file.name);
    ZipFormat.assertUint16(nameBytes.length, 'ZIP entry filename is too long');

    const localHeaderOffset = this.offset;
    const modifiedAt = DosDateTime.fromTimestamp(file.lastModified);

    await this.write(this.headers.createLocalHeader(nameBytes, modifiedAt));

    const { crc32, size } = await this.writeFileBody(file);

    await this.write(this.headers.createDataDescriptor(crc32, size));

    this.entries.push(new ZipEntry(nameBytes, crc32, size, size, localHeaderOffset, modifiedAt));
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const centralDirectoryOffset = this.offset;

    for (const entry of this.entries) {
      await this.write(this.headers.createCentralDirectoryHeader(entry));
    }

    const centralDirectorySize = this.offset - centralDirectoryOffset;
    ZipFormat.assertUint16(
      this.entries.length,
      'ZIP archive has too many entries for non-ZIP64 output',
    );
    ZipFormat.assertUint32(centralDirectoryOffset, 'ZIP archive is too large for non-ZIP64 output');
    ZipFormat.assertUint32(
      centralDirectorySize,
      'ZIP central directory is too large for non-ZIP64 output',
    );

    await this.write(
      this.headers.createEndOfCentralDirectory(
        this.entries.length,
        centralDirectorySize,
        centralDirectoryOffset,
      ),
    );
    await this.sink.close();
  }

  private async writeFileBody(file: File): Promise<{ crc32: number; size: number }> {
    const reader = file.stream().getReader();
    const crc32 = new Crc32();
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        crc32.update(value);
        size += value.byteLength;
        ZipFormat.assertUint32(size, 'ZIP entry is too large for non-ZIP64 output');
        await this.write(value);
      }
    } finally {
      reader.releaseLock();
    }

    return {
      crc32: crc32.digest(),
      size,
    };
  }

  private async write(chunk: Uint8Array): Promise<void> {
    await this.sink.write(chunk);
    this.offset += chunk.byteLength;
    ZipFormat.assertUint32(this.offset, 'ZIP archive is too large for non-ZIP64 output');
  }
}
