import type { StoredZipEntrySource } from '$lib/ZipWriter';

export interface ZipEntriesSink {
  write(entry: StoredZipEntrySource): Promise<void>;
  close(): Promise<void>;
  abort(error?: unknown): Promise<void>;
}

export interface ZipEntriesSinkFactory {
  open(name: string): Promise<ZipEntriesSink>;
}
