import type { CarvingKnifeSlice } from '$lib/CarvingKnife/CarvingKnifeSlice';
import type { Chef } from './Chef';
import { ImageFile } from '$lib/ImageFile';

export class CanvasChef implements Chef {
  private readonly canvas = new OffscreenCanvas(1, 1);

  public async *process(
    slices: ReadonlyArray<CarvingKnifeSlice<ImageFile>>,
    signal: AbortSignal,
  ): AsyncGenerator<ImageFile> {
    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const length = slices.length.toString().length;
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      this.canvas.width = slice.width;
      this.canvas.height = slice.height;

      for (const chunk of slice.chunks) {
        signal.throwIfAborted();
        const image = await chunk.src.image();

        ctx.drawImage(
          image,
          chunk.srcX,
          chunk.srcY,
          chunk.srcWidth,
          chunk.srcHeight,
          chunk.dstX,
          chunk.dstY,
          chunk.dstWidth,
          chunk.dstHeight,
        );
      }

      const blob = await this.canvas.convertToBlob();
      yield new ImageFile(
        new File([blob], `${(i + 1).toString().padStart(length, '0')}.png`),
        slice.width,
        slice.height,
      );
    }

    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
