import type { ImageFile } from '$lib/ImageFile';
import type { CarvingKnifeSlice } from '$lib/CarvingKnife/CarvingKnifeSlice';

export interface Chef {
  process(
    slices: ReadonlyArray<CarvingKnifeSlice<ImageFile>>,
    signal: AbortSignal,
  ): AsyncGenerator<ImageFile>;
}
