import { afterEach, describe, expect, it, vi } from 'vitest';

const { fromFileMock } = vi.hoisted(() => ({
  fromFileMock: vi.fn(),
}));

vi.mock('$lib/ImageFile', () => ({
  ImageFile: {
    fromFile: fromFileMock,
  },
}));

import { loadAcqqWatermark } from './loadAcqqWatermark';

describe('loadAcqqWatermark', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fromFileMock.mockReset();
  });

  it('loads ACQQ watermark for the requested width', async () => {
    const image = { width: 1200, height: 200 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['png']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    fromFileMock.mockResolvedValue(image);

    await expect(loadAcqqWatermark(1200)).resolves.toBe(image);

    expect(fetchMock).toHaveBeenCalledWith('/watermarks/acqq-1200.png');
    expect(fromFileMock).toHaveBeenCalledTimes(1);
    const [file] = fromFileMock.mock.calls[0] as [File];
    expect(file.name).toBe('acqq-1200.png');
    expect(file.type).toBe('image/png');
  });

  it('throws a useful error when watermark fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('Not found', { status: 404, statusText: 'Not Found' })),
    );

    await expect(loadAcqqWatermark(1200)).rejects.toThrow(
      'Failed to fetch watermark acqq-1200.png: 404 Not Found',
    );
    expect(fromFileMock).not.toHaveBeenCalled();
  });

  it('propagates image decoding errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['not an image']))));
    fromFileMock.mockRejectedValue(new Error('Failed to load image'));

    await expect(loadAcqqWatermark(1200)).rejects.toThrow('Failed to load image');
  });
});
