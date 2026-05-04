import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import FileInput from './FileInput.svelte';
import { assignInputFiles } from './FilePicker/testUtils';

describe('FileInput', () => {
  it('keeps selected files attached until the files handler is done', async () => {
    let finishHandlingFiles!: () => void;
    const onFiles = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishHandlingFiles = resolve;
        }),
    );

    render(FileInput, {
      props: {
        'aria-label': 'Images',
        onFiles,
      },
    });

    const input = screen.getByLabelText('Images') as HTMLInputElement;
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    let value = '/fake/path/image.png';

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => value,
      set: (nextValue: string) => {
        value = nextValue;
      },
    });
    assignInputFiles(input, [file]);

    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]));
    expect(value).toBe('/fake/path/image.png');

    finishHandlingFiles();

    await waitFor(() => expect(value).toBe(''));
  });
});
