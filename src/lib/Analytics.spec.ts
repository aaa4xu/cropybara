import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureExceptionMock, captureMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('$app/environment', () => ({
  browser: true,
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: captureMock,
    captureException: captureExceptionMock,
  },
}));

import { Analytics } from './Analytics';

describe('Analytics', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    captureMock.mockClear();
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 8,
      deviceMemory: 4,
    });
    vi.stubGlobal('performance', {
      memory: {
        usedJSHeapSize: 1,
        totalJSHeapSize: 2,
        jsHeapSizeLimit: 3,
      },
    });
  });

  it('captures processing failures as both an event and a PostHog exception', () => {
    const error = new Error('Encode failed');

    Analytics.trackProcessingFailed(
      {
        processing_id: 'processing-1',
        duration_ms: 123,
      },
      error,
    );

    expect(captureMock).toHaveBeenCalledWith(
      'processing_failed',
      expect.objectContaining({
        duration_ms: 123,
        error_type: 'Error',
        processing_id: 'processing-1',
      }),
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        duration_ms: 123,
        error_type: 'Error',
        processing_id: 'processing-1',
      }),
    );
  });
});
