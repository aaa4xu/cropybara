import '@testing-library/jest-dom/vitest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/States/ProgressBarState.svelte', () => ({
  ProgressBarState: {
    use: vi.fn(),
  },
}));

vi.mock('$app/environment', () => ({
  browser: true,
}));

import { fireEvent, render, screen } from '@testing-library/svelte';
import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
import DirectoryPickerButton from './DirectoryPickerButton.svelte';

const useMock = ProgressBarState.use as unknown as ReturnType<typeof vi.fn>;
const originalDirectoryDescriptor = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'webkitdirectory',
);

function enableDirectorySupport() {
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
    configurable: true,
    value: true,
  });
}

function resetDirectorySupport() {
  if (originalDirectoryDescriptor) {
    Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', originalDirectoryDescriptor);
  } else {
    Reflect.deleteProperty(HTMLInputElement.prototype, 'webkitdirectory');
  }
}

describe('DirectoryPickerButton', () => {
  beforeEach(() => {
    useMock.mockReset();
    resetDirectorySupport();
  });

  afterAll(() => {
    resetDirectorySupport();
  });

  it('does not render when directory input is not supported', () => {
    useMock.mockReturnValue({ display: false });

    render(DirectoryPickerButton, { props: { onFiles: vi.fn() } });

    expect(screen.queryByLabelText('Folder')).not.toBeInTheDocument();
  });

  it('renders a directory input when supported', () => {
    useMock.mockReturnValue({ display: false });
    enableDirectorySupport();

    render(DirectoryPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Folder') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', 'application/non-existing-mime-type');
    expect(input).toHaveAttribute('webkitdirectory');
    expect(input).not.toBeDisabled();

    const label = input.closest('label');
    expect(label).not.toHaveClass('disabled');
  });

  it('disables the picker while progress bar is visible', () => {
    useMock.mockReturnValue({ display: true });
    enableDirectorySupport();

    render(DirectoryPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Folder');
    expect(input).toBeDisabled();

    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('sorts files before invoking onFiles callback', async () => {
    useMock.mockReturnValue({ display: false });
    enableDirectorySupport();

    const onFiles = vi.fn();
    render(DirectoryPickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('Folder') as HTMLInputElement;
    const unsortedFiles = [
      new File(['b'], 'chapter-10/page-3.png', { type: 'image/png' }),
      new File(['a'], 'chapter-2/page-12.png', { type: 'image/png' }),
    ];

    const fileList = {
      0: unsortedFiles[0],
      1: unsortedFiles[1],
      length: unsortedFiles.length,
      item: (index: number) => unsortedFiles[index] ?? null,
    } as unknown as FileList;

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: fileList,
    });

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledTimes(1);
    const [sortedFiles] = onFiles.mock.calls[0];
    expect(sortedFiles.map((file: File) => file.name)).toEqual([
      'chapter-2/page-12.png',
      'chapter-10/page-3.png',
    ]);
  });
});
