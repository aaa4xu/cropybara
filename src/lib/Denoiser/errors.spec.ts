import { describe, expect, it } from 'vitest';

import { isONNXRuntimeLoadError } from './errors';

describe('isONNXRuntimeLoadError', () => {
  it('detects ONNX wasm loading failures', () => {
    expect(
      isONNXRuntimeLoadError(
        new Error(
          'Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS for more info.',
        ),
      ),
    ).toBe(true);
  });

  it('ignores unrelated denoiser errors', () => {
    expect(isONNXRuntimeLoadError(new Error('Failed to process image'))).toBe(false);
  });
});
