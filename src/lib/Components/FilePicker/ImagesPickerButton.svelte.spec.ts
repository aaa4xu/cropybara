import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/svelte';
import {
  assignInputFiles,
  createProgressBarMock,
  resetMocks,
  setupProgressBarMock,
} from './testUtils';
import ImagesPickerButton from './ImagesPickerButton.svelte';

const useMock = setupProgressBarMock();

describe('ImagesPickerButton', () => {
  beforeEach(() => {
    resetMocks(useMock);
  });

  it('renders label and configures accept/multiple attributes', () => {
    createProgressBarMock(useMock);

    render(ImagesPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Images') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input.multiple).toBe(true);
    expect(input).not.toBeDisabled();
  });

  it('disables the picker when progress bar is displayed', () => {
    createProgressBarMock(useMock, { display: true });

    render(ImagesPickerButton, { props: { onFiles: vi.fn() } });

    const input = screen.getByLabelText('Images');

    expect(input).toBeDisabled();
    const label = input.closest('label');
    expect(label).toHaveClass('disabled');
  });

  it('forwards selected files via onFiles callback', async () => {
    createProgressBarMock(useMock);

    const onFiles = vi.fn();
    render(ImagesPickerButton, { props: { onFiles } });

    const input = screen.getByLabelText('Images') as HTMLInputElement;

    const fileA = new File(['a'], 'image-a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'image-b.jpg', { type: 'image/jpeg' });

    assignInputFiles(input, [fileA, fileB]);

    await fireEvent.change(input);

    expect(onFiles).toHaveBeenCalledWith([fileA, fileB]);
  });
});
