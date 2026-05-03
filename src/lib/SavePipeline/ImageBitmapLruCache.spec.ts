import { describe, expect, it, vi } from 'vitest';

import { ImageBitmapLruCache } from './ImageBitmapLruCache';

describe('ImageBitmapLruCache', () => {
  it('evicts least recently used bitmaps and closes them', () => {
    const cache = new ImageBitmapLruCache(2);
    const first = bitmap();
    const second = bitmap();
    const third = bitmap();

    cache.set(1, first);
    cache.set(2, second);
    expect(cache.get(1)).toBe(first);

    cache.set(3, third);

    expect(cache.get(2)).toBeNull();
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(cache.get(1)).toBe(first);
    expect(cache.get(3)).toBe(third);
    expect(first.close).not.toHaveBeenCalled();
    expect(third.close).not.toHaveBeenCalled();
  });

  it('closes all cached bitmaps on dispose', () => {
    const cache = new ImageBitmapLruCache(2);
    const first = bitmap();
    const second = bitmap();

    cache.set(1, first);
    cache.set(2, second);
    cache.dispose();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(cache.get(1)).toBeNull();
  });
});

function bitmap(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap;
}
