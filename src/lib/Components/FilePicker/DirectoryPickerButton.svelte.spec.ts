import '@testing-library/jest-dom/vitest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignInputFiles,
  createBrowserModule,
  createProgressBarMock,
  resetMocks,
  setupProgressBarMock,
} from './testUtils';

const { browserFlag } = vi.hoisted(() => ({
  browserFlag: { value: true },
}));

vi.mock('$app/environment', () => createBrowserModule(browserFlag));

import { fireEvent, render, screen } from '@testing-library/svelte';
import DirectoryPickerButton from './DirectoryPickerButton.svelte';

const useMock = setupProgressBarMock();
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
    resetMocks(useMock);
    browserFlag.value = true;
    resetDirectorySupport();
  });

  afterAll(() => {
    resetDirectorySupport();
  });

  it('does not render when directory input is not supported', () => {
    createProgressBarMock(useMock);

    render(DirectoryPickerButton, { props: { onFiles: vi.fn() } });

    expect(screen.queryByLabelText('Folder')).not.toBeInTheDocument();
  });

  it('renders a directory input when supported', () => {
    createProgressBarMock(useMock);
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
    createProgressBarMock(useMock, { display: true });
    enableDirectorySupport();

    render(DirectoryPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Folder');
    expect(input).toBeDisabled();

    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('sorts files before invoking onFiles callback', async () => {
    createProgressBarMock(useMock);
    enableDirectorySupport();

    const onFiles = vi.fn();
    render(DirectoryPickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('Folder') as HTMLInputElement;
    const unsortedFiles = [
      new File(['b'], 'chapter-10/page-3.png', { type: 'image/png' }),
      new File(['a'], 'chapter-2/page-12.png', { type: 'image/png' }),
    ];

    assignInputFiles(input, unsortedFiles);

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledTimes(1);
    const [sortedFiles] = onFiles.mock.calls[0];
    expect(sortedFiles.map((file: File) => file.name)).toEqual([
      'chapter-2/page-12.png',
      'chapter-10/page-3.png',
    ]);
  });
});
