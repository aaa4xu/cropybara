import type { StoredZipEntrySource } from './StoredZipEntrySource';

export interface ZipEntryWriter {
  addEntry(entry: StoredZipEntrySource): Promise<void>;
  close(): Promise<void>;
}
