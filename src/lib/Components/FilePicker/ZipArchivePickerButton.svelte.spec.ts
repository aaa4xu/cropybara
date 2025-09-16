import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/States/ProgressBarState.svelte', () => ({
  ProgressBarState: {
    use: vi.fn(),
  },
}));

import { fireEvent, render, screen } from '@testing-library/svelte';
import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
import ZipArchivePickerButton from './ZipArchivePickerButton.svelte';

const useMock = ProgressBarState.use as unknown as ReturnType<typeof vi.fn>;

describe('ZipArchivePickerButton', () => {
  beforeEach(() => {
    useMock.mockReset();
  });

  it('renders ZIP archive label and accepts only zip files', () => {
    useMock.mockReturnValue({ display: false });

    render(ZipArchivePickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', '.zip');
    expect(input).not.toBeDisabled();

    const label = input.closest('label');
    expect(label).not.toHaveClass('disabled');
  });

  it('disables the button while the progress bar is visible', () => {
    useMock.mockReturnValue({ display: true });

    render(ZipArchivePickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;

    expect(input).toBeDisabled();
    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('forwards the onFiles callback to the underlying input', async () => {
    useMock.mockReturnValue({ display: false });

    const onFiles = vi.fn();
    render(ZipArchivePickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('ZIP archive') as HTMLInputElement;
    const file = new File(['content'], 'sample.zip', { type: 'application/zip' });
    const files = [file] as unknown as FileList;

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: files,
    });

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
