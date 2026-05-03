import { DosDateTime } from './DosDateTime';
import type { StoredZipEntrySource } from './StoredZipEntrySource';
import { ZipEntry } from './ZipEntry';
import type { ZipEntryWriter } from './ZipEntryWriter';
import { ZipFormat } from './ZipFormat';
import { ZipHeaderFactory } from './ZipHeaderFactory';
import type { ZipWritableSink } from './ZipWritableSink';

export class KnownEntryZipWriter implements ZipEntryWriter {
  private readonly entries: ZipEntry[] = [];
  private readonly textEncoder = new TextEncoder();
  private readonly headers = new ZipHeaderFactory();
  private offset = 0;
  private closed = false;

  public constructor(private readonly sink: ZipWritableSink) {}

  public async addEntry(entry: StoredZipEntrySource): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot add ZIP entries after close.');
    }

    if (entry.bytes.byteLength !== entry.size) {
      throw new Error(
        `ZIP entry "${entry.name}" size mismatch: declared ${entry.size}, actual ${entry.bytes.byteLength}.`,
      );
    }

    ZipFormat.assertUint32(entry.size, 'ZIP entry is too large for non-ZIP64 output.');
    ZipFormat.assertUint32(entry.crc32, 'ZIP entry CRC32 is out of uint32 range.');

    const nameBytes = this.textEncoder.encode(entry.name);
    ZipFormat.assertUint16(nameBytes.length, 'ZIP entry filename is too long.');

    const modifiedAt = DosDateTime.fromTimestamp(entry.lastModified);
    const localHeaderOffset = this.offset;

    await this.write(
      this.headers.createKnownLocalHeader({
        nameBytes,
        modifiedAt,
        crc32: entry.crc32,
        size: entry.size,
      }),
    );

    await this.write(entry.bytes);

    this.entries.push(
      new ZipEntry(
        nameBytes,
        entry.crc32,
        entry.size,
        entry.size,
        localHeaderOffset,
        modifiedAt,
        ZipFormat.utf8Flag,
      ),
    );
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    const centralDirectoryOffset = this.offset;

    for (const entry of this.entries) {
      await this.write(this.headers.createCentralDirectoryHeader(entry));
    }

    const centralDirectorySize = this.offset - centralDirectoryOffset;

    ZipFormat.assertUint16(
      this.entries.length,
      'ZIP archive has too many entries for non-ZIP64 output.',
    );
    ZipFormat.assertUint32(centralDirectoryOffset, 'ZIP archive is too large.');
    ZipFormat.assertUint32(centralDirectorySize, 'ZIP central directory is too large.');

    await this.write(
      this.headers.createEndOfCentralDirectory(
        this.entries.length,
        centralDirectorySize,
        centralDirectoryOffset,
      ),
    );

    await this.sink.close();
  }

  private async write(chunk: Uint8Array): Promise<void> {
    await this.sink.write(chunk);
    this.offset += chunk.byteLength;
    ZipFormat.assertUint32(this.offset, 'ZIP archive is too large for non-ZIP64 output.');
  }
}
