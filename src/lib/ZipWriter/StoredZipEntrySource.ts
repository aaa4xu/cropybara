export interface StoredZipEntrySource {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly crc32: number;
  readonly lastModified: number;
}
