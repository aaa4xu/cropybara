import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/svelte';
import ConfigScreen from './ConfigScreen.svelte';

const { alertsDisplayMock, onlineUseMock, progressBarUseMock } = vi.hoisted(() => ({
  alertsDisplayMock: vi.fn(),
  onlineUseMock: vi.fn(),
  progressBarUseMock: vi.fn(),
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
    onlineUseMock.mockReturnValue({ state: true });
    progressBarUseMock.mockReturnValue({ display: false, add: vi.fn(), remove: vi.fn() });
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
