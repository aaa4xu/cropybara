import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { ImageOutputFormat, ImageOutputFormatRegistry } from '$lib/ImageOutputFormat';
import ConfigScreen from './ConfigScreen.svelte';

const { alertsDisplayMock, detectOutputFormatsMock, onlineUseMock, progressBarUseMock } =
  vi.hoisted(() => ({
    alertsDisplayMock: vi.fn(),
    detectOutputFormatsMock: vi.fn(),
    onlineUseMock: vi.fn(),
    progressBarUseMock: vi.fn(),
  }));

vi.mock('$lib/BrowserImageOutputFormatSupport', () => ({
  BrowserImageOutputFormatSupport: {
    detect: detectOutputFormatsMock,
  },
}));

vi.mock('$lib/States/AlertsState.svelte', () => ({
  AlertsLevel: {
    Error: 'error',
    Warning: 'warning',
    Info: 'info',
    Success: 'success',
  },
  AlertsState: {
    use: vi.fn(() => ({
      display: alertsDisplayMock,
    })),
  },
}));

vi.mock('$lib/States/OnlineState.svelte', () => ({
  OnlineState: {
    use: onlineUseMock,
  },
}));

vi.mock('$lib/States/ProgressBarState.svelte', () => ({
  ProgressBarState: {
    use: progressBarUseMock,
  },
}));

describe('ConfigScreen', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => 'en'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    alertsDisplayMock.mockReset();
    detectOutputFormatsMock.mockReset();
    detectOutputFormatsMock.mockResolvedValue(ImageOutputFormatRegistry.defaultSupported);
    onlineUseMock.mockReturnValue({ state: true });
    progressBarUseMock.mockReturnValue({ display: false, add: vi.fn(), remove: vi.fn() });
  });

  it('submits PNG output by default', async () => {
    const onSubmit = vi.fn();

    render(ConfigScreen, {
      props: {
        widths: [[1200, ['page.png']]],
        height: 1000,
        onCancel: vi.fn(),
        onSubmit,
      },
    });

    expect(screen.getByLabelText(/Output image format/i)).toHaveValue(ImageOutputFormat.Png);
    expect(screen.queryByLabelText(/Quality/i)).not.toBeInTheDocument();

    const limitInput = screen.getByLabelText(/Height limit/i) as HTMLInputElement;
    await fireEvent.submit(limitInput.form as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        output: {
          format: ImageOutputFormat.Png,
          quality: undefined,
        },
      }),
    );
  });

  it('shows quality for formats with browser-supported quality controls', async () => {
    detectOutputFormatsMock.mockResolvedValue([
      {
        ...ImageOutputFormatRegistry.get(ImageOutputFormat.Png),
        supportsQuality: false,
      },
      {
        ...ImageOutputFormatRegistry.get(ImageOutputFormat.Jpeg),
        supportsQuality: true,
      },
    ]);
    const onSubmit = vi.fn();

    render(ConfigScreen, {
      props: {
        widths: [[1200, ['page.png']]],
        height: 1000,
        onCancel: vi.fn(),
        onSubmit,
      },
    });

    await screen.findByRole('option', { name: 'JPEG' });

    const formatSelect = screen.getByLabelText(/Output image format/i) as HTMLSelectElement;
    await fireEvent.change(formatSelect, { target: { value: ImageOutputFormat.Jpeg } });

    const qualityInput = screen.getByLabelText(/Quality/i) as HTMLInputElement;
    expect(qualityInput).toHaveValue(92);

    await fireEvent.input(qualityInput, { target: { value: '80' } });
    await fireEvent.submit(qualityInput.form as HTMLFormElement);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          output: {
            format: ImageOutputFormat.Jpeg,
            quality: 80,
          },
        }),
      );
    });
  });

  it('rejects height limits that cannot satisfy cut distance constraints', async () => {
    const onSubmit = vi.fn();

    render(ConfigScreen, {
      props: {
        widths: [[1200, ['page.png']]],
        height: 1000,
        onCancel: vi.fn(),
        onSubmit,
      },
    });

    const limitInput = screen.getByLabelText(/Height limit/i) as HTMLInputElement;
    expect(limitInput).toHaveAttribute('min', '51');

    await fireEvent.input(limitInput, { target: { value: '50' } });
    await fireEvent.submit(limitInput.form as HTMLFormElement);

    expect(alertsDisplayMock).toHaveBeenCalledWith('error', 'Height limit must be at least 51px.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
