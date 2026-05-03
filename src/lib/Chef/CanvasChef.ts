import type { CarvingKnifeSlice } from '$lib/CarvingKnife/CarvingKnifeSlice';
import type { Chef } from './Chef';
import { ImageFile } from '$lib/ImageFile';

export class CanvasChef implements Chef {
  private static readonly pipelineSize = 2;

  public async *process(
    slices: ReadonlyArray<CarvingKnifeSlice<ImageFile>>,
    signal: AbortSignal,
  ): AsyncGenerator<ImageFile> {
    const length = slices.length.toString().length;
    const pending = new Map<number, Promise<ImageFile>>();
    let next = 0;

    const queue = () => {
      while (next < slices.length && pending.size < CanvasChef.pipelineSize) {
        const index = next++;
        const task = this.renderSlice(slices[index], index, length, signal);
        task.catch(() => undefined);
        pending.set(index, task);
      }
    };

    queue();

    for (let index = 0; index < slices.length; index++) {
      const slice = await pending.get(index)!;
      pending.delete(index);
      queue();
      yield slice;
    }
  }

  private async renderSlice(
    slice: CarvingKnifeSlice<ImageFile>,
    index: number,
    length: number,
    signal: AbortSignal,
  ): Promise<ImageFile> {
    signal.throwIfAborted();

    const canvas = new OffscreenCanvas(slice.width, slice.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    try {
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

      const blob = await canvas.convertToBlob();
      return new ImageFile(
        new File([blob], `${(index + 1).toString().padStart(length, '0')}.png`),
        slice.width,
        slice.height,
      );
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
