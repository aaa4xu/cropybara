import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browserFlag = { value: true };

vi.mock('$app/environment', () => ({
  get browser() {
    return browserFlag.value;
  },
}));

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
    AlertsState: {
      use: vi.fn(() => ({
        display: alertsDisplayMock,
      })),
    },
    AlertsLevel,
  };
});

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
import { AlertsLevel } from '$lib/States/AlertsState.svelte';
import ClipboardPasteButton from './ClipboardPasteButton.svelte';

const progressBarUseMock = ProgressBarState.use as unknown as ReturnType<typeof vi.fn>;

let clipboardReadMock: ReturnType<typeof vi.fn>;
const originalClipboard = (navigator as unknown as { clipboard?: Clipboard }).clipboard;

function setClipboard(value: Clipboard | undefined) {
  if (value) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value,
    });
  } else {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
}

describe('ClipboardPasteButton', () => {
  beforeEach(() => {
    browserFlag.value = true;
    clipboardReadMock = vi.fn();
    setClipboard({ read: clipboardReadMock } as unknown as Clipboard);
    alertsDisplayMock.mockReset();
    progressBarUseMock.mockReset();
  });

  afterEach(() => {
    if (originalClipboard) {
      setClipboard(originalClipboard);
    } else {
      setClipboard(undefined);
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

  it('does not render when clipboard API is not supported', () => {
    browserFlag.value = false;
    setupProgressBar();

    render(ClipboardPasteButton, { props: { onFiles: vi.fn() } });

    expect(screen.queryByRole('button', { name: 'Clipboard' })).not.toBeInTheDocument();
  });

  it('renders an enabled button when supported', () => {
    setupProgressBar();

    render(ClipboardPasteButton, { props: { onFiles: vi.fn() } });

    const button = screen.getByRole('button', { name: 'Clipboard' });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('disables the button while progress bar is shown', () => {
    setupProgressBar({ display: true });

    render(ClipboardPasteButton, { props: { onFiles: vi.fn() } });

    const button = screen.getByRole('button', { name: 'Clipboard' });
    expect(button).toBeDisabled();
  });

  it('reads images from clipboard and forwards them to onFiles', async () => {
    const progressBar = setupProgressBar();
    const onFiles = vi.fn();

    const blob = new Blob(['image'], { type: 'image/png' });
    clipboardReadMock.mockResolvedValue([
      {
        types: ['text/plain', 'image/png'],
        getType: vi.fn().mockResolvedValue(blob),
      },
    ]);

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    render(ClipboardPasteButton, { props: { onFiles } });
    const button = screen.getByRole('button', { name: 'Clipboard' });

    await fireEvent.click(button);

    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));

    const [files] = onFiles.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].type).toBe('image/png');
    expect(files[0].name).toBe('clipboard-1700000000000-0.png');

    expect(progressBar.add).toHaveBeenCalledTimes(1);
    const task = progressBar.add.mock.calls[0][0];
    expect(progressBar.remove).toHaveBeenCalledWith(task);
    expect(alertsDisplayMock).not.toHaveBeenCalled();

    dateSpy.mockRestore();
  });

  it('shows a warning when no images found in clipboard', async () => {
    const progressBar = setupProgressBar();
    const onFiles = vi.fn();

    clipboardReadMock.mockResolvedValue([
      {
        types: ['text/plain'],
        getType: vi.fn(),
      },
    ]);

    render(ClipboardPasteButton, { props: { onFiles } });
    const button = screen.getByRole('button', { name: 'Clipboard' });

    await fireEvent.click(button);

    await waitFor(() => expect(alertsDisplayMock).toHaveBeenCalled());

    expect(onFiles).not.toHaveBeenCalled();
    expect(alertsDisplayMock).toHaveBeenCalledWith(
      AlertsLevel.Warning,
      expect.stringContaining('No image data in clipboard'),
    );
    expect(progressBar.add).toHaveBeenCalledTimes(1);
    expect(progressBar.remove).toHaveBeenCalledWith(expect.any(Function));
  });

  it('shows not allowed error when clipboard access is denied', async () => {
    const progressBar = setupProgressBar();
    const onFiles = vi.fn();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    clipboardReadMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    render(ClipboardPasteButton, { props: { onFiles } });
    const button = screen.getByRole('button', { name: 'Clipboard' });

    await fireEvent.click(button);

    await waitFor(() =>
      expect(alertsDisplayMock).toHaveBeenCalledWith(
        AlertsLevel.Error,
        expect.stringContaining('access was denied'),
      ),
    );

    expect(onFiles).not.toHaveBeenCalled();
    expect(progressBar.add).not.toHaveBeenCalled();
    expect(progressBar.remove).toHaveBeenCalledWith(expect.any(Function));

    consoleError.mockRestore();
  });

  it('shows a generic error message when clipboard read fails', async () => {
    const progressBar = setupProgressBar();
    const onFiles = vi.fn();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    clipboardReadMock.mockRejectedValue(new Error('boom'));

    render(ClipboardPasteButton, { props: { onFiles } });
    const button = screen.getByRole('button', { name: 'Clipboard' });

    await fireEvent.click(button);

    await waitFor(() =>
      expect(alertsDisplayMock).toHaveBeenCalledWith(
        AlertsLevel.Error,
        expect.stringContaining('Failed to paste from clipboard'),
      ),
    );

    expect(onFiles).not.toHaveBeenCalled();
    expect(progressBar.add).not.toHaveBeenCalled();
    expect(progressBar.remove).toHaveBeenCalledWith(expect.any(Function));

    consoleError.mockRestore();
  });
});
