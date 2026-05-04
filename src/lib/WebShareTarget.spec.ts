import { describe, expect, it } from 'vitest';

import { WebShareTarget } from './WebShareTarget';

describe('WebShareTarget', () => {
  it('detects share-target launches from query parameters', () => {
    expect(WebShareTarget.isLaunch('?source=share-target')).toBe(true);
    expect(WebShareTarget.isLaunch('?foo=bar&source=share-target')).toBe(true);
  });

  it('does not match other sources', () => {
    expect(WebShareTarget.isLaunch('')).toBe(false);
    expect(WebShareTarget.isLaunch('?source=pwa')).toBe(false);
    expect(WebShareTarget.isLaunch('?source=share-target-next')).toBe(false);
  });
});
