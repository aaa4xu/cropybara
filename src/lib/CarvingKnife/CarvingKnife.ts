import type { CarvingKnifeSlice } from './CarvingKnifeSlice';
import type { CarvingKnifeSliceChunk } from './CarvingKnifeSliceChunk';
import type { CarvingKnifeSource } from './CarvingKnifeSource';

export class CarvingKnife {
  public static cut<T extends CarvingKnifeSource>(
    sources: ReadonlyArray<T>,
    cuts: ReadonlyArray<number>,
  ): CarvingKnifeSlice<T>[] {
    if (sources.length === 0) {
      throw new Error('Empty sources');
    }

    const outlier = sources.find((s) => s.height === 0);
    if (outlier) {
      throw new Error(`Zero height source`);
    }

    const scrollHeight = sources.reduce((acc, source) => acc + source.height, 0);
    const src = this.calculateSourceOffset(sources);

    const slices: CarvingKnifeSlice<T>[] = [];
    for (let i = 0; i <= cuts.length; i++) {
      const start = cuts[i - 1] ?? 0;
      const end = cuts[i] ?? scrollHeight;

      if (end - start < 1) {
        throw new Error('Zero height slice');
      }

      const chunks = src
        .filter((source) => source.offset + source.image.height > start && source.offset < end)
        .map((chunk): CarvingKnifeSliceChunk<T> => {
          let targetY = chunk.offset - start;
          let sourceY = 0;

          if (targetY < 0) {
            sourceY = -targetY;
            targetY = 0;
          }

          const height = Math.min(targetY + chunk.image.height - sourceY, end - start) - targetY;

          if (height === 0) {
            throw new Error('Zero height chunk');
          }

          return {
            src: chunk.image,
            srcHeight: height,
            dstHeight: height,
            srcWidth: chunk.image.width,
            dstWidth: chunk.image.width,
            srcX: 0,
            dstX: 0,
            srcY: sourceY,
            dstY: targetY,
          };
        });

      slices.push({
        chunks,
        height: end - start,
        width: sources[0].width,
      });
    }

    return slices;
  }

  private static calculateSourceOffset<T extends CarvingKnifeSource>(
    sources: ReadonlyArray<T>,
  ): Array<{ image: T; offset: number }> {
    return sources.reduce(
      (acc, source) => {
        acc.sources.push({
          image: source,
          offset: acc.current,
        });

        acc.current += source.height;

        return acc;
      },
      {
        sources: [],
        current: 0,
      } as {
        sources: Array<{ image: T; offset: number }>;
        current: number;
      },
    ).sources;
  }
}
