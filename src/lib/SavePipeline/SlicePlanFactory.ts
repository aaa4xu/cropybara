import { CarvingKnife } from '$lib/CarvingKnife/CarvingKnife';
import type { ImageFile } from '$lib/ImageFile';

import { SliceCutsValidator } from './SliceCutsValidator';
import type { SliceChunkDto, SliceJobDto, SliceSourceDto } from './SlicePipelineTypes';

export class SlicePlanFactory {
  public constructor(private readonly cutsValidator = new SliceCutsValidator()) {}

  public createSources(images: readonly ImageFile[]): readonly SliceSourceDto[] {
    return images.map((image, id) => ({
      id,
      file: image,
      width: image.width,
      height: image.height,
    }));
  }

  public create(images: readonly ImageFile[], cuts: readonly number[]): readonly SliceJobDto[] {
    this.cutsValidator.validate(images, cuts);

    const sources = this.createSources(images);
    const slices = CarvingKnife.cut(sources, cuts);
    const digits = slices.length.toString().length;

    return slices.map(
      (slice, index): SliceJobDto => ({
        index,
        name: `${(index + 1).toString().padStart(digits, '0')}.png`,
        width: slice.width,
        height: slice.height,
        chunks: slice.chunks.map(
          (chunk): SliceChunkDto => ({
            sourceId: chunk.src.id,

            srcX: chunk.srcX,
            srcY: chunk.srcY,
            srcWidth: chunk.srcWidth,
            srcHeight: chunk.srcHeight,

            dstX: chunk.dstX,
            dstY: chunk.dstY,
            dstWidth: chunk.dstWidth,
            dstHeight: chunk.dstHeight,
          }),
        ),
      }),
    );
  }
}
