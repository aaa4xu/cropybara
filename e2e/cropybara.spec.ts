import { expect, test, type Page } from '@playwright/test';
import { createCanvas, loadImage } from 'canvas';
import JSZip from 'jszip';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('should display link to russian version on the main page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Русская версия')).toBeVisible();
});

test('should reject non-image files and keep the upload screen open', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [
    {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    },
  ]);

  await expect(page.getByText('File "notes.txt" is not an image but text/plain.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Select images' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
});

test('should allow uploading images and configure manual slicing', async ({ page }) => {
  await page.goto('/');
  await uploadSampleImages(page);

  await expect(page.getByLabel('Project name')).toHaveValue(/^cropybara-\d+$/);
  await expect(page.getByLabel('Height limit, px')).toHaveValue('20000');
  await expect(page.getByText(/Total size:\s*6\s*x\s*24 px/)).toBeVisible();
  await expect(page.getByLabel('Compression artifact removal')).toHaveValue('Off');
  await expect(page.getByLabel('Unwatermark')).toHaveValue('Off');
  await expect(page.getByLabel('Detector type')).toHaveValue('PixelComparison');

  const heightLimitInput = page.getByLabel('Height limit, px');
  await heightLimitInput.fill('50');
  await page.getByRole('button', { name: 'Process' }).click();

  expect(
    await heightLimitInput.evaluate((input) => (input as HTMLInputElement).validity.rangeUnderflow),
  ).toBe(true);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await heightLimitInput.fill('20000');
  await page.getByLabel('Detector type').selectOption('Manual');
  await expect(page.getByLabel('Object detection sensitivity, %')).toHaveCount(0);

  await page.getByRole('button', { name: 'Process' }).click();

  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-1.png' })).toBeVisible();
});

test('should allow zooming and dragging manual cuts', async ({ page }) => {
  await page.goto('/');
  await uploadGeneratedChapter(page);

  await page.getByLabel('Project name').fill('keyboard-cuts');
  await page.getByLabel('Height limit, px').fill('120');
  await page.getByLabel('Detector type').selectOption('Manual');
  await page.getByRole('button', { name: 'Process' }).click();

  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.locator('.cut')).toHaveCount(4);

  const firstCut = page.locator('.cut').first();
  const firstCutBox = await firstCut.boundingBox();
  expect(firstCutBox).not.toBeNull();

  await page.mouse.move(
    firstCutBox!.x + firstCutBox!.width / 2,
    firstCutBox!.y + firstCutBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    firstCutBox!.x + firstCutBox!.width / 2,
    firstCutBox!.y + firstCutBox!.height / 2 - 10,
  );
  await page.mouse.up();
  await expect(page.locator('.info', { hasText: /^110$/ })).toBeVisible();

  const movedFirstCutBox = await firstCut.boundingBox();
  expect(movedFirstCutBox).not.toBeNull();

  await page.mouse.move(
    movedFirstCutBox!.x + movedFirstCutBox!.width / 2,
    movedFirstCutBox!.y + movedFirstCutBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    movedFirstCutBox!.x + movedFirstCutBox!.width / 2,
    movedFirstCutBox!.y + movedFirstCutBox!.height / 2 + 1,
  );
  await page.mouse.up();
  await expect(page.locator('.info', { hasText: /^111$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByText('120%')).toBeVisible();

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByText('102%')).toBeVisible();

  await page.getByText('102%').click();
  await expect(page.getByText('100%')).toBeVisible();
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

  const { zip, suggestedName } = await saveAndReadZip(page);
  expect(suggestedName).toBeTruthy();
  expect(suggestedName).toMatch(/\.zip$/);

  expect(Object.keys(zip.files).sort()).toEqual(['1.png']);

  const pngFile = zip.file('1.png');
  expect(pngFile).not.toBeNull();
  const { bytes: pngBytes } = await readImageDimensions(pngFile!);
  expect(pngBytes.length).toBeGreaterThan(0);
  expect(Array.from(pngBytes.slice(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
});

test('should export browser-supported formats with quality settings', async ({ page }) => {
  await mockZipDownload(page);
  await page.goto('/');
  await uploadGeneratedChapter(page);

  const formatSelect = page.getByLabel('Output image format');
  await expect(formatSelect).toHaveValue('png');
  await expect(page.getByLabel('Quality, %')).toHaveCount(0);

  await formatSelect.selectOption('jpeg');
  await expect(page.getByLabel('Quality, %')).toHaveValue('92');
  await page.getByLabel('Quality, %').fill('80');
  await page.getByLabel('Project name').fill('jpeg-slices');
  await page.getByLabel('Height limit, px').fill('120');
  await page.getByLabel('Detector type').selectOption('Manual');
  await page.getByRole('button', { name: 'Process' }).click();

  const { zip, suggestedName } = await saveAndReadZip(page);
  expect(suggestedName).toBe('jpeg-slices.zip');
  expect(Object.keys(zip.files).sort()).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg']);

  const jpegFile = zip.file('1.jpg');
  expect(jpegFile).not.toBeNull();
  const { bytes: jpegBytes, width, height } = await readImageDimensions(jpegFile!);
  expect(Array.from(jpegBytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  expect(width).toBe(64);
  expect(height).toBe(120);
});

test('should export all manual slices with expected dimensions', async ({ page }) => {
  await mockZipDownload(page);
  await page.goto('/');
  await uploadGeneratedChapter(page);

  await page.getByLabel('Project name').fill('manual-slices');
  await page.getByLabel('Height limit, px').fill('120');
  await page.getByLabel('Detector type').selectOption('Manual');
  await page.getByRole('button', { name: 'Process' }).click();

  const { zip, suggestedName } = await saveAndReadZip(page);
  expect(suggestedName).toBe('manual-slices.zip');
  expect(Object.keys(zip.files).sort()).toEqual(['1.png', '2.png', '3.png', '4.png', '5.png']);

  const dimensions = await Promise.all(
    ['1.png', '2.png', '3.png', '4.png', '5.png'].map(async (name) => {
      const file = zip.file(name);
      expect(file).not.toBeNull();
      return readImageDimensions(file!);
    }),
  );

  expect(dimensions.map(({ width }) => width)).toEqual([64, 64, 64, 64, 64]);
  expect(dimensions.map(({ height }) => height)).toEqual([120, 120, 120, 120, 20]);
});

test('should require confirmation before resizing width outliers and export resized slices', async ({
  page,
}) => {
  await mockZipDownload(page);
  await page.goto('/');
  await uploadGeneratedChapter(page, [
    createStripedPng('wide-1.png', 64, 120, ['#102030', '#203040']),
    createStripedPng('narrow.png', 32, 120, ['#405060', '#506070']),
    createStripedPng('wide-2.png', 64, 120, ['#708090', '#8090a0']),
  ]);

  await expect(
    page.getByText(/Not all images have the same width! Most images \(2\) have a width of 64px/),
  ).toBeVisible();

  const processButton = page.getByRole('button', { name: 'Process' });
  await expect(processButton).toBeDisabled();

  await page.getByLabel('Resize all images to 64px width').check();
  await expect(processButton).toBeEnabled();

  await page.getByLabel('Project name').fill('resized-outlier');
  await page.getByLabel('Height limit, px').fill('120');
  await page.getByLabel('Detector type').selectOption('Manual');
  await processButton.click();

  const { zip, suggestedName } = await saveAndReadZip(page);
  expect(suggestedName).toBe('resized-outlier.zip');
  expect(Object.keys(zip.files).sort()).toEqual(['1.png', '2.png', '3.png', '4.png']);

  const dimensions = await Promise.all(
    ['1.png', '2.png', '3.png', '4.png'].map(async (name) => {
      const file = zip.file(name);
      expect(file).not.toBeNull();
      return readImageDimensions(file!);
    }),
  );

  expect(dimensions.map(({ width }) => width)).toEqual([64, 64, 64, 64]);
  expect(dimensions.map(({ height }) => height)).toEqual([120, 120, 120, 120]);
});

type FilePayload = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

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

function createStripedPng(
  name: string,
  width: number,
  height: number,
  colors: string[],
): FilePayload {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const stripeHeight = Math.ceil(height / colors.length);

  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, index * stripeHeight, width, stripeHeight);
  });

  return {
    name,
    mimeType: 'image/png',
    buffer: canvas.toBuffer('image/png'),
  };
}

async function uploadImages(page: Page, files: string[] | FilePayload[]) {
  const imagesInput = page.getByLabel('Images');
  await expect(imagesInput).toBeVisible();
  await imagesInput.setInputFiles(files);
}

async function uploadSampleImages(page: Page) {
  await uploadImages(page, [fixturePath('sample-1.png'), fixturePath('sample-2.png')]);

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function uploadGeneratedChapter(page: Page, files?: FilePayload[]) {
  await uploadImages(
    page,
    files ?? [
      createStripedPng('chapter-1.png', 64, 250, ['#111111', '#333333', '#555555']),
      createStripedPng('chapter-2.png', 64, 250, ['#777777', '#999999', '#bbbbbb']),
    ],
  );

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
        return new Uint8Array(
          value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
        );
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

async function getLastSavedZip(page: Page) {
  const payload = await page.evaluate<{ base64: string; suggestedName: string | null } | null>(
    () => {
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
    },
  );

  expect(payload).not.toBeNull();

  const { base64, suggestedName } = payload!;
  return {
    suggestedName,
    zip: await JSZip.loadAsync(Buffer.from(base64, 'base64')),
  };
}

async function readImageDimensions(file: JSZip.JSZipObject) {
  const bytes = await file.async('uint8array');
  const image = await loadImage(Buffer.from(bytes));

  return {
    width: image.width,
    height: image.height,
    bytes,
  };
}

async function saveAndReadZip(page: Page) {
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

  return getLastSavedZip(page);
}
