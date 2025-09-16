import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type MockedSavedZip = {
  options?: { suggestedName?: string | null };
  chunks: Uint8Array[];
  base64?: string;
  closed?: boolean;
  aborted?: boolean;
};

declare global {
  interface Window {
    __cropybaraSavedZips?: MockedSavedZip[];
    showSaveFilePicker?: (options?: unknown) => Promise<{
      createWritable(): Promise<{
        write(chunk: Blob | ArrayBuffer | ArrayBufferView | Uint8Array): Promise<void>;
        close(): Promise<void>;
        abort(): Promise<void>;
      }>;
    }>;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixturePath(name: string) {
  return path.join(__dirname, 'fixtures', name);
}

async function uploadSampleImages(page: Page) {
  const imagesInput = page.getByLabel('Images');
  await expect(imagesInput).toBeVisible();
  await imagesInput.setInputFiles([
    fixturePath('sample-1.png'),
    fixturePath('sample-2.png'),
  ]);

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function mockZipDownload(page: Page) {
  await page.addInitScript(() => {
    const savedZips: MockedSavedZip[] = [];
    Object.defineProperty(window, '__cropybaraSavedZips', {
      value: savedZips,
      configurable: true,
    });

    const toUint8Array = async (
      value: Blob | Uint8Array | ArrayBuffer | ArrayBufferView,
    ): Promise<Uint8Array> => {
      if (value instanceof Uint8Array) {
        return new Uint8Array(value);
      }
      if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
      }
      if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      }
      if (value instanceof Blob) {
        const buffer = await value.arrayBuffer();
        return new Uint8Array(buffer);
      }

      throw new Error('Unsupported chunk type');
    };

    const toBase64 = (bytes: Uint8Array): string => {
      let binary = '';
      const blockSize = 0x8000;
      for (let i = 0; i < bytes.length; i += blockSize) {
        const chunk = bytes.subarray(i, i + blockSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    };

    window.showSaveFilePicker = async (options) => {
      const record: MockedSavedZip = {
        options: options as MockedSavedZip['options'],
        chunks: [] as Uint8Array[],
        closed: false,
      };
      savedZips.push(record);

      return {
        async createWritable() {
          return {
            async write(chunk) {
              record.chunks.push(await toUint8Array(chunk));
            },
            async close() {
              const totalLength = record.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
              const merged = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of record.chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
              }

              record.base64 = toBase64(merged);
              record.closed = true;
            },
            async abort() {
              record.closed = true;
              record.aborted = true;
            },
          };
        },
      };
    };
  });
}

test('should display link to russian version on the main page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Русская версия')).toBeVisible();
});

test('should allow uploading images and configure manual slicing', async ({ page }) => {
  await page.goto('/');
  await uploadSampleImages(page);

  await expect(page.getByLabel('Compression artifact removal')).toHaveValue('Off');

  await page.getByLabel('Detector type').selectOption('Manual');
  await expect(page.getByLabel('Object detection sensitivity, %')).toHaveCount(0);

  await page.getByRole('button', { name: 'Process' }).click();

  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-1.png' })).toBeVisible();
});

test('should let user return to the upload screen from the editor', async ({ page }) => {
  await page.goto('/');
  await uploadSampleImages(page);
  await page.getByLabel('Detector type').selectOption('Manual');
  await page.getByRole('button', { name: 'Process' }).click();

  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('heading', { name: 'Select images' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
});

test('should export a zip archive with processed slices', async ({ page }) => {
  await mockZipDownload(page);
  await page.goto('/');
  await uploadSampleImages(page);

  await page.getByLabel('Detector type').selectOption('Manual');
  await page.getByRole('button', { name: 'Process' }).click();

  const saveButton = page.getByRole('button', { name: 'Save' });
  await expect(saveButton).toBeVisible();

  const waitForZip = page.waitForFunction(() => {
    const saved = window.__cropybaraSavedZips as
      | Array<{ closed?: boolean; base64?: string }>
      | undefined;
    return !!saved && saved.some((entry) => entry.closed && entry.base64);
  });

  await saveButton.click();
  await waitForZip;

  const payload = await page.evaluate<
    | { base64: string; suggestedName: string | null }
    | null
  >(() => {
    const saved = window.__cropybaraSavedZips as
      | Array<{ closed?: boolean; base64?: string; options?: { suggestedName?: string | null } }>
      | undefined;
    if (!saved || saved.length === 0) return null;
    const last = saved[saved.length - 1];
    if (!last || !last.base64) return null;
    return {
      base64: last.base64,
      suggestedName: last.options?.suggestedName ?? null,
    };
  });

  expect(payload).not.toBeNull();
  const { base64, suggestedName } = payload!;
  expect(suggestedName).toBeTruthy();
  expect(suggestedName).toMatch(/\.zip$/);

  const zipBuffer = Buffer.from(base64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);
  expect(Object.keys(zip.files).sort()).toEqual(['1.png']);

  const pngFile = zip.file('1.png');
  expect(pngFile).not.toBeNull();
  const pngBytes = await pngFile!.async('uint8array');
  expect(pngBytes.length).toBeGreaterThan(0);
  expect(Array.from(pngBytes.slice(0, 8))).toEqual([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]);
});
