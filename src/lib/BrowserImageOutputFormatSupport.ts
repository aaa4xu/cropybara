import {
  ImageOutputFormatRegistry,
  type ImageOutputMimeType,
  type SupportedImageOutputFormat,
} from './ImageOutputFormat';

type OutputCanvas = HTMLCanvasElement | OffscreenCanvas;
type OutputCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class BrowserImageOutputFormatSupport {
  public static async detect(): Promise<readonly SupportedImageOutputFormat[]> {
    const formats = await Promise.all(
      ImageOutputFormatRegistry.all.map(async (definition) => {
        const supported = await this.canEncode(definition.mimeType);

        if (!supported) {
          return null;
        }

        return {
          ...definition,
          supportsQuality:
            definition.canUseQuality && (await this.canEncodeWithQuality(definition.mimeType)),
        } satisfies SupportedImageOutputFormat;
      }),
    );

    const supportedFormats = formats.filter(
      (format): format is SupportedImageOutputFormat => format !== null,
    );

    return supportedFormats.length > 0
      ? supportedFormats
      : ImageOutputFormatRegistry.defaultSupported;
  }

  private static async canEncode(type: ImageOutputMimeType): Promise<boolean> {
    try {
      const blob = await this.encode(type);

      return blob.type === type && blob.size > 0;
    } catch {
      return false;
    }
  }

  private static async canEncodeWithQuality(type: ImageOutputMimeType): Promise<boolean> {
    try {
      const [lowQuality, highQuality] = await Promise.all([
        this.encode(type, 0.1),
        this.encode(type, 0.95),
      ]);

      if (lowQuality.type !== type || highQuality.type !== type) {
        return false;
      }

      if (lowQuality.size !== highQuality.size) {
        return true;
      }

      const [lowBytes, highBytes] = await Promise.all([
        lowQuality.arrayBuffer(),
        highQuality.arrayBuffer(),
      ]);

      return !this.bytesEqual(new Uint8Array(lowBytes), new Uint8Array(highBytes));
    } catch {
      return false;
    }
  }

  private static async encode(type: ImageOutputMimeType, quality?: number): Promise<Blob> {
    const canvas = this.createCanvas();
    this.paint(canvas);

    if ('convertToBlob' in canvas) {
      return canvas.convertToBlob({ type, quality });
    }

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`Canvas failed to encode ${type}.`));
            return;
          }

          resolve(blob);
        },
        type,
        quality,
      );
    });
  }

  private static createCanvas(): OutputCanvas {
    if (typeof OffscreenCanvas !== 'undefined' && 'convertToBlob' in OffscreenCanvas.prototype) {
      return new OffscreenCanvas(32, 32);
    }

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;

      if (typeof canvas.toBlob === 'function') {
        return canvas;
      }
    }

    throw new Error('Canvas image encoding is not supported.');
  }

  private static paint(canvas: OutputCanvas): void {
    const ctx = canvas.getContext('2d') as OutputCanvasContext | null;

    if (!ctx) {
      throw new Error('Failed to create canvas context.');
    }

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        ctx.fillStyle = `rgb(${(x * 7 + y * 13) % 256}, ${(x * 17 + y * 5) % 256}, ${
          (x * 3 + y * 19) % 256
        })`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private static bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
      return false;
    }

    for (let i = 0; i < left.byteLength; i++) {
      if (left[i] !== right[i]) {
        return false;
      }
    }

    return true;
  }
}
