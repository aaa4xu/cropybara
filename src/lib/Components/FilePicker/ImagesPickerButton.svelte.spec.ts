import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/States/ProgressBarState.svelte', () => ({
  ProgressBarState: {
    use: vi.fn(),
  },
}));

import { fireEvent, render, screen } from '@testing-library/svelte';
import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
import ImagesPickerButton from './ImagesPickerButton.svelte';

const useMock = ProgressBarState.use as unknown as ReturnType<typeof vi.fn>;

describe('ImagesPickerButton', () => {
  beforeEach(() => {
    useMock.mockReset();
  });

  it('renders label and configures accept/multiple attributes', () => {
    useMock.mockReturnValue({ display: false });

    render(ImagesPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Images') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input.multiple).toBe(true);
    expect(input).not.toBeDisabled();
  });

  it('disables the picker when progress bar is displayed', () => {
    useMock.mockReturnValue({ display: true });

    render(ImagesPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Images');

    expect(input).toBeDisabled();
    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('forwards selected files via onFiles callback', async () => {
    useMock.mockReturnValue({ display: false });

    const onFiles = vi.fn();
    render(ImagesPickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('Images') as HTMLInputElement;

    const fileA = new File(['a'], 'image-a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'image-b.jpg', { type: 'image/jpeg' });

    const filesArray = [fileA, fileB];
    const fileList = {
      0: fileA,
      1: fileB,
      length: filesArray.length,
      item: (index: number) => filesArray[index] ?? null,
    } as unknown as FileList;

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: fileList,
    });

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledWith([fileA, fileB]);
  });
});
