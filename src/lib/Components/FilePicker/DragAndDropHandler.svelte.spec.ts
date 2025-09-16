import '@testing-library/jest-dom/vitest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('$lib/States/ProgressBarState.svelte', () => ({
  ProgressBarState: {
    use: vi.fn(),
  },
}));

const alertsDisplayMock = vi.fn();

vi.mock('$lib/States/AlertsState.svelte', () => {
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
        display: alertsDisplayMock,
      })),
    },
  };
});

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
import { AlertsLevel } from '$lib/States/AlertsState.svelte';
import DragAndDropHandler from './DragAndDropHandler.svelte';

const progressBarUseMock = ProgressBarState.use as unknown as Mock;

const originalDragEvent = globalThis.DragEvent;

beforeAll(() => {
  if (typeof DragEvent === 'undefined') {
    class DragEventPolyfill extends Event {
      dataTransfer: DataTransfer | null;

      constructor(type: string, eventInitDict: DragEventInit = {}) {
        super(type, eventInitDict);
        this.dataTransfer = eventInitDict.dataTransfer ?? null;
      }
    }

    (globalThis as unknown as { DragEvent: typeof Event }).DragEvent = DragEventPolyfill as unknown as typeof DragEvent;
  }
});

afterAll(() => {
  if (originalDragEvent) {
    (globalThis as unknown as { DragEvent: typeof DragEvent }).DragEvent = originalDragEvent;
  } else {
    delete (globalThis as Record<string, unknown>).DragEvent;
  }
});

function setupProgressBar(overrides: Partial<{ display: boolean }> = {}) {
  const progressBar = {
    display: false,
    add: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
  progressBarUseMock.mockReturnValue(progressBar);
  return progressBar;
}

describe('DragAndDropHandler', () => {
  beforeEach(() => {
    progressBarUseMock.mockReset();
    alertsDisplayMock.mockReset();
  });

  it('toggles the drop zone visibility on drag enter/leave with files', async () => {
    setupProgressBar();
    render(DragAndDropHandler, { props: { onFiles: vi.fn() } });

    const section = screen.getByLabelText('File drop zone');
    expect(section).not.toHaveClass('visible');

    const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(dragEnter, 'dataTransfer', {
      value: { types: ['Files'] },
      configurable: true,
    });
    window.dispatchEvent(dragEnter);

    await waitFor(() => expect(section).toHaveClass('visible'));

    const dragLeave = new Event('dragleave', { bubbles: true, cancelable: true });
    Object.defineProperty(dragLeave, 'dataTransfer', {
      value: { types: ['Files'] },
      configurable: true,
    });
    window.dispatchEvent(dragLeave);

    await waitFor(() => expect(section).not.toHaveClass('visible'));
  });

  it('passes an empty list when nothing is dropped', async () => {
    const onFiles = vi.fn();
    const progressBar = setupProgressBar();
    render(DragAndDropHandler, { props: { onFiles } });

    await fireEvent.drop(screen.getByLabelText('File drop zone'), {
      dataTransfer: { items: [] },
    });

    expect(onFiles).toHaveBeenCalledWith([]);
    expect(progressBar.add).not.toHaveBeenCalled();
    expect(progressBar.remove).not.toHaveBeenCalled();
  });

  it('ignores drops while progress bar is visible', async () => {
    const onFiles = vi.fn();
    const progressBar = setupProgressBar({ display: true });
    render(DragAndDropHandler, { props: { onFiles } });

    await fireEvent.drop(screen.getByLabelText('File drop zone'), {
      dataTransfer: { items: [{ kind: 'file' }] },
    });

    expect(onFiles).not.toHaveBeenCalled();
    expect(progressBar.add).not.toHaveBeenCalled();
    expect(progressBar.remove).not.toHaveBeenCalled();
  });

  it('reads files using the File System Access API handle', async () => {
    const onFiles = vi.fn();
    const progressBar = setupProgressBar();
    render(DragAndDropHandler, { props: { onFiles } });

    const handle = {
      kind: 'file',
      name: 'chapter-10/page-02.png',
      async getFile() {
        return new File(['image'], 'page-02.png', { type: 'image/png' });
      },
    } as unknown as FileSystemFileHandle;

    const item = {
      kind: 'file',
      async getAsFileSystemHandle() {
        return handle;
      },
    };

    const dataTransfer = { items: [item] };

    await fireEvent.drop(screen.getByLabelText('File drop zone'), {
      dataTransfer,
    });

    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const [files] = onFiles.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('page-02.png');
    expect(files[0].type).toBe('image/png');

    expect(progressBar.add).toHaveBeenCalledTimes(1);
    const task = progressBar.add.mock.calls[0][0];
    expect(progressBar.remove).toHaveBeenCalledWith(task);
    expect(alertsDisplayMock).not.toHaveBeenCalled();
  });

  it('reads files via the legacy Entries API', async () => {
    const onFiles = vi.fn();
    const progressBar = setupProgressBar();
    render(DragAndDropHandler, { props: { onFiles } });

    const fileFromEntry = new File(['data'], 'art.png', { type: 'image/png', lastModified: 5 });

    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'art.png',
      file(cb: (file: File) => void) {
        cb(fileFromEntry);
      },
    } as unknown as FileSystemFileEntry;

    const item = {
      kind: 'file',
      webkitGetAsEntry() {
        return fileEntry;
      },
    };

    await fireEvent.drop(screen.getByLabelText('File drop zone'), {
      dataTransfer: { items: [item] },
    });

    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const [files] = onFiles.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('art.png');
    expect(progressBar.add).toHaveBeenCalledTimes(1);
    expect(progressBar.remove).toHaveBeenCalledWith(expect.any(Function));
    expect(alertsDisplayMock).not.toHaveBeenCalled();
  });

  it('reports an unsupported entry API', async () => {
    const onFiles = vi.fn();
    setupProgressBar();
    render(DragAndDropHandler, { props: { onFiles } });

    await fireEvent.drop(screen.getByLabelText('File drop zone'), {
      dataTransfer: {
        items: [
          {
            kind: 'file',
          },
        ],
      },
    });

    await waitFor(() =>
      expect(alertsDisplayMock).toHaveBeenCalledWith(
        AlertsLevel.Error,
        expect.stringContaining('Unsupported browser API'),
      ),
    );

    const [files] = onFiles.mock.calls[0];
    expect(files).toEqual([]);
  });
});
