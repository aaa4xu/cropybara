import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/svelte';
import {
  assignInputFiles,
  createProgressBarMock,
  resetMocks,
  setupProgressBarMock,
} from './testUtils';
import ZipArchivePickerButton from './ZipArchivePickerButton.svelte';

const useMock = setupProgressBarMock();

describe('ZipArchivePickerButton', () => {
  beforeEach(() => {
    resetMocks(useMock);
  });

  it('renders ZIP archive label and accepts only zip files', () => {
    createProgressBarMock(useMock, { display: false });

    render(ZipArchivePickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', '.zip');
    expect(input).not.toBeDisabled();

    const label = input.closest('label');
    expect(label).not.toHaveClass('disabled');
  });

  it('disables the button while the progress bar is visible', () => {
    createProgressBarMock(useMock, { display: true });

    render(ZipArchivePickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;

    expect(input).toBeDisabled();
    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('forwards the onFiles callback to the underlying input', async () => {
    createProgressBarMock(useMock);

    const onFiles = vi.fn();
    render(ZipArchivePickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;
    const file = new File(['content'], 'sample.zip', { type: 'application/zip' });
    assignInputFiles(input, [file]);

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
