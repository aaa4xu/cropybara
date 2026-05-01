import type { DosDateTime } from './DosDateTime';
import type { ZipEntry } from './ZipEntry';
import { ZipFormat } from './ZipFormat';

export class ZipHeaderFactory {
  public createLocalHeader(nameBytes: Uint8Array, modifiedAt: DosDateTime): Uint8Array {
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, ZipFormat.utf8AndDataDescriptorFlag, true);
    view.setUint16(8, ZipFormat.compressionStore, true);
    view.setUint16(10, modifiedAt.time, true);
    view.setUint16(12, modifiedAt.date, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, 0, true);
    view.setUint32(22, 0, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    return header;
  }

  public createDataDescriptor(crc32: number, size: number): Uint8Array {
    const descriptor = new Uint8Array(ZipFormat.dataDescriptorLength);
    const view = new DataView(descriptor.buffer);

    view.setUint32(0, 0x08074b50, true);
    view.setUint32(4, crc32, true);
    view.setUint32(8, size, true);
    view.setUint32(12, size, true);

    return descriptor;
  }

  public createCentralDirectoryHeader(entry: ZipEntry): Uint8Array {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, ZipFormat.utf8AndDataDescriptorFlag, true);
    view.setUint16(10, ZipFormat.compressionStore, true);
    view.setUint16(12, entry.modifiedAt.time, true);
    view.setUint16(14, entry.modifiedAt.date, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.compressedSize, true);
    view.setUint32(24, entry.uncompressedSize, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.localHeaderOffset, true);
    header.set(entry.nameBytes, 46);

    return header;
  }

  public createEndOfCentralDirectory(
    entriesCount: number,
    centralDirectorySize: number,
    centralDirectoryOffset: number,
  ): Uint8Array {
    const header = new Uint8Array(22);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entriesCount, true);
    view.setUint16(10, entriesCount, true);
    view.setUint32(12, centralDirectorySize, true);
    view.setUint32(16, centralDirectoryOffset, true);
    view.setUint16(20, 0, true);

    return header;
  }
}
