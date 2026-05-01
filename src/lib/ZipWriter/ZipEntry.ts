import type { DosDateTime } from './DosDateTime';

export class ZipEntry {
  public constructor(
    public readonly nameBytes: Uint8Array,
    public readonly crc32: number,
    public readonly compressedSize: number,
    public readonly uncompressedSize: number,
    public readonly localHeaderOffset: number,
    public readonly modifiedAt: DosDateTime,
  ) {}
}
