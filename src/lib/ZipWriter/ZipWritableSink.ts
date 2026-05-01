export interface ZipWritableSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(error?: unknown): Promise<void>;
}
