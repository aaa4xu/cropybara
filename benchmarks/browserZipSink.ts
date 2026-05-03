import type { Page } from '@playwright/test';

export async function installZipSink(page: Page) {
  await page.addInitScript(() => {
    type Chunk = Blob | ArrayBuffer | ArrayBufferView;
    type ZipState = {
      suggestedName: string | null;
      bytesWritten: number;
      chunksWritten: number;
      localFileHeaders: number;
      closed: boolean;
      aborted: boolean;
    };
    const makeState = (suggestedName: string | null = null): ZipState => ({
      suggestedName,
      bytesWritten: 0,
      chunksWritten: 0,
      localFileHeaders: 0,
      closed: false,
      aborted: false,
    });
    const bytes = (chunk: Chunk) =>
      chunk instanceof Blob
        ? null
        : chunk instanceof ArrayBuffer
          ? new Uint8Array(chunk)
          : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const signature = (chunk: Chunk) => {
      const view = bytes(chunk);
      return view && view.length >= 4
        ? (view[0] | (view[1] << 8) | (view[2] << 16) | (view[3] << 24)) >>> 0
        : null;
    };
    const win = window as unknown as {
      __cropybaraE2EZip: ZipState;
      showSaveFilePicker?: (options?: { suggestedName?: string | null }) => Promise<{
        createWritable(): Promise<{
          write(chunk: Chunk): Promise<void>;
          close(): Promise<void>;
          abort(): Promise<void>;
        }>;
      }>;
    };

    win.__cropybaraE2EZip = makeState();
    win.showSaveFilePicker = async (options?: { suggestedName?: string | null }) => {
      const state = makeState(options?.suggestedName ?? null);
      win.__cropybaraE2EZip = state;
      return {
        async createWritable() {
          return {
            async write(chunk: Chunk) {
              state.bytesWritten += chunk instanceof Blob ? chunk.size : chunk.byteLength;
              state.chunksWritten += 1;
              if (signature(chunk) === 0x04034b50) state.localFileHeaders += 1;
            },
            async close() {
              state.closed = true;
            },
            async abort() {
              state.aborted = true;
            },
          };
        },
      };
    };
  });
}
