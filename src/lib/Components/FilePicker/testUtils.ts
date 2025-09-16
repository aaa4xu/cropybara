import { vi } from 'vitest';
import type { Mock } from 'vitest';

export interface ProgressBarStub {
  display: boolean;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export function setupProgressBarMock(): Mock {
  const { useMock } = vi.hoisted(() => ({
    useMock: vi.fn(),
  }));

  vi.mock('$lib/States/ProgressBarState.svelte', () => ({
    ProgressBarState: {
      use: useMock,
    },
  }));

  return useMock as unknown as Mock;
}

export function createProgressBarMock(
  useMock: Mock,
  overrides: Partial<ProgressBarStub> = {},
): ProgressBarStub {
  const progressBar: ProgressBarStub = {
    display: false,
    add: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };

  useMock.mockReturnValue(progressBar);
  return progressBar;
}

export function resetMocks(...mocks: Mock[]) {
  for (const mock of mocks) {
    mock.mockReset();
  }
}

export function createFileList(files: File[]): FileList {
  const indexed = files.reduce<Record<number, File>>((acc, file, index) => {
    acc[index] = file;
    return acc;
  }, {});

  const fileList: Record<number, File> & {
    length: number;
    item: (index: number) => File | null;
  } = {
    ...indexed,
    length: files.length,
    item(index: number) {
      return files[index] ?? null;
    },
  };

  return fileList as unknown as FileList;
}

export function assignInputFiles(input: HTMLInputElement, files: File[]) {
  const fileList = createFileList(files);
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: fileList,
  });
  return fileList;
}

type BrowserFlag = { value: boolean };

export function createBrowserModule(flag: BrowserFlag) {
  return {
    get browser() {
      return flag.value;
    },
  };
}

export function createAlertsModule(displayMock: ReturnType<typeof vi.fn>) {
  const AlertsLevel = {
    Error: 'error',
    Warning: 'warning',
    Info: 'info',
    Success: 'success',
  } as const;

  return {
    AlertsLevel,
    AlertsState: {
      use: vi.fn(() => ({
        display: displayMock,
      })),
    },
  };
}
