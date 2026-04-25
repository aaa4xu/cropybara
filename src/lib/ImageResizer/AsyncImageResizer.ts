import { ImageFile } from '$lib/ImageFile';
import { Queue } from '$lib/Queue';
import type { ImageResizer } from './ImageResizer';

export function calculateResizedImageSize(
  image: Pick<ImageFile, 'name' | 'width' | 'height'>,
  width: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Target width must be a positive number, got ${width}.`);
  }

  if (
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new Error(
      `Image "${image.name}" has invalid dimensions: ${image.width}x${image.height}.`,
    );
  }

  return {
    width,
    height: Math.max(1, Math.round((width * image.height) / image.width)),
  };
}

export class AsyncImageResizer implements ImageResizer {
  private readonly queue = new Queue([new OffscreenCanvas(1, 1)]);

  public async resize(image: ImageFile, width: number, signal: AbortSignal): Promise<ImageFile> {
    return this.queue.enqueue(async (canvas) => {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        const source = await image.image();
        const type = 'image/png';
        const size = calculateResizedImageSize(image, width);

        // Set canvas dimensions
        canvas.width = size.width;
        canvas.height = size.height;

        // Draw the resized image onto the canvas
        ctx.drawImage(source, 0, 0, size.width, size.height);

        // Convert canvas to blob
        const blob = await canvas.convertToBlob({ type });

        // Create a new File object
        const resizedFile = new File(
          [blob],
          image.name.split('.').slice(0, -1) + `-w${width}.png`,
          {
            type,
            lastModified: image.lastModified,
          },
        );

        // Create a new ImageFile from the resized file
        return new ImageFile(resizedFile, size.width, size.height);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    }, signal);
  }
}
