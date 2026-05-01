import type { Denoiser } from '$lib/Denoiser/Denoiser';
import { ImageFile } from '$lib/ImageFile';
import pLimit from 'p-limit';

export class Unwatermarker implements Denoiser {
  private readonly canvas = new OffscreenCanvas(1, 1);
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  protected readonly queue = pLimit(1);
  protected readonly watermark: Promise<ImageData>;

  // --- Optimization constants and LUT ---
  private readonly alphaImgLUT: Float32Array;
  private readonly alphaWmLUT: Float32Array;
  private readonly alphaAdjust: number;
  private readonly transparencyThreshold: number;
  private readonly opaqueThreshold: number;
  private readonly factor1_denominator: number;
  private readonly isValidFactor1Denominator: boolean;
  // --- End of optimization constants ---

  public constructor(private readonly config: UnwatermarkerConfig) {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }
    this.ctx = ctx;

    // --- Parameter and LUT initialization ---
    this.alphaAdjust = config.alphaAdjust ?? 1.0;
    this.transparencyThreshold = config.transparencyThreshold ?? 1;
    this.opaqueThreshold = config.opaqueThreshold ?? 250;

    this.alphaImgLUT = new Float32Array(256);
    this.alphaWmLUT = new Float32Array(256);
    for (let val = 0; val < 256; val++) {
      if (val === 255) {
        // Use large numbers to simulate infinity or full replacement behavior.
        // This value is used if alpha_watermark_adjusted == 255.
        // If transparencyThreshold is always < 255, this case will not be reached in the main formula.
        this.alphaImgLUT[val] = 1.0; // Image pixel remains as is
        this.alphaWmLUT[val] = 0.0; // Watermark has no effect
      } else {
        this.alphaImgLUT[val] = 255.0 / (255.0 - val);
        this.alphaWmLUT[val] = -val / (255.0 - val);
      }
    }

    this.factor1_denominator = 255.0 - this.opaqueThreshold;
    this.isValidFactor1Denominator = this.factor1_denominator > 1e-6; // Avoid division by zero or a very small number
    // --- End of initialization ---

    this.watermark = this.queue(() => this.loadWatermark());
  }

  public async process(image: ImageFile, signal?: AbortSignal): Promise<ImageFile> {
    return this.queue(async () => {
      const watermark = await this.watermark;

      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.ctx.drawImage(await image.image(), 0, 0);

      // Calculate coordinates (x, y)
      const x =
        this.config.left >= 0 ? this.config.left : image.width - this.config.watermark.width;
      const y =
        this.config.top >= 0 ? this.config.top : image.height - this.config.watermark.height;

      // Determine the actual intersection area of the watermark with the image
      const imgClipX = Math.max(0, x);
      const imgClipY = Math.max(0, y);

      const imgClipMaxX = Math.min(image.width, x + this.config.watermark.width);
      const imgClipMaxY = Math.min(image.height, y + this.config.watermark.height);

      const actualW = imgClipMaxX - imgClipX;
      const actualH = imgClipMaxY - imgClipY;

      if (actualW <= 0 || actualH <= 0) {
        return image;
      }

      // Determine which part of the original watermark to use
      // If the watermark is offset beyond the left/top edge of the image
      const wmOffsetX = Math.max(0, -x);
      const wmOffsetY = Math.max(0, -y);

      console.log({ imgClipX, imgClipY, actualW, actualH });
      const imageRegionData = this.ctx.getImageData(imgClipX, imgClipY, actualW, actualH);

      this._applyUnwatermarkAlgorithm(
        imageRegionData, // ImageData of the target region on the main image
        watermark, // ImageData of the entire watermark
        actualW, // Actual width of the processed area
        actualH, // Actual height of the processed area
        wmOffsetX, // X offset within the watermark file
        wmOffsetY, // Y offset within the watermark file
        signal,
      );

      this.ctx.putImageData(imageRegionData, imgClipX, imgClipY);

      const resultBlob = await this.canvas.convertToBlob({ type: 'image/png' });

      if (!resultBlob) {
        throw new Error('Failed to convert canvas to blob after processing');
      }

      const file = new File([resultBlob], image.name, { type: 'image/png' });
      return ImageFile.fromFile(file);
    });
  }

  protected async loadWatermark() {
    this.canvas.width = this.config.watermark.width;
    this.canvas.height = this.config.watermark.height;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    const watermark = await this.config.watermark.image();
    ctx.drawImage(watermark, 0, 0);

    return ctx.getImageData(0, 0, this.config.watermark.width, this.config.watermark.height);
  }

  private _applyUnwatermarkAlgorithm(
    targetImageData: ImageData, // ImageData of the region on the main image (size actualW x actualH)
    watermarkFullImageData: ImageData, // ImageData of the entire watermark file
    regionW: number, // Width of the processed region (actualW)
    regionH: number, // Height of the processed region (actualH)
    watermarkSrcOffsetX: number, // X offset for reading from watermarkFullImageData
    watermarkSrcOffsetY: number, // Y offset for reading from watermarkFullImageData
    signal?: AbortSignal,
  ): void {
    const imgData = targetImageData.data;
    const wmData = watermarkFullImageData.data;
    const wmFullWidth = watermarkFullImageData.width; // Full width of the original watermark file

    // Check AbortSignal every N rows to avoid doing it on every pixel iteration
    const checkAbortInterval = Math.max(1, Math.floor(regionH / 100)); // For example, every 1% of rows

    for (let y = 0; y < regionH; y++) {
      if (y % checkAbortInterval === 0) {
        signal?.throwIfAborted();
      }

      const imgRowBase = y * (regionW * 4);
      // Calculate the row in the full watermark image, considering the offset
      const wmRowBase = (y + watermarkSrcOffsetY) * (wmFullWidth * 4);

      for (let x = 0; x < regionW; x++) {
        // Index in targetImageData (processed region)
        const j_offset = imgRowBase + x * 4;
        // Index in watermarkFullImageData, considering the offset
        const i_offset = wmRowBase + (x + watermarkSrcOffsetX) * 4;

        // Boundary check for i_offset (just in case, although wmOffsetX/Y calculations should cover this)
        if (
          x + watermarkSrcOffsetX >= wmFullWidth ||
          y + watermarkSrcOffsetY >= watermarkFullImageData.height
        ) {
          continue; // Watermark pixel is outside its actual data
        }

        const watermark_alpha_val = wmData[i_offset + 3];
        const alpha_watermark_adjusted = Math.min(this.alphaAdjust * watermark_alpha_val, 255);

        if (alpha_watermark_adjusted > this.transparencyThreshold) {
          const current_alpha_img = this.alphaImgLUT[alpha_watermark_adjusted];
          const current_alpha_wm = this.alphaWmLUT[alpha_watermark_adjusted];

          const orig_r = imgData[j_offset];
          const orig_g = imgData[j_offset + 1];
          const orig_b = imgData[j_offset + 2];

          const wm_r = wmData[i_offset];
          const wm_g = wmData[i_offset + 1];
          const wm_b = wmData[i_offset + 2];

          const r_new = current_alpha_img * orig_r + current_alpha_wm * wm_r;
          const g_new = current_alpha_img * orig_g + current_alpha_wm * wm_g;
          const b_new = current_alpha_img * orig_b + current_alpha_wm * wm_b;

          imgData[j_offset] = Math.round(r_new);
          imgData[j_offset + 1] = Math.round(g_new);
          imgData[j_offset + 2] = Math.round(b_new);

          if (alpha_watermark_adjusted > this.opaqueThreshold) {
            let factor1 = 0;
            if (this.isValidFactor1Denominator) {
              factor1 =
                (alpha_watermark_adjusted - this.opaqueThreshold) / this.factor1_denominator;
              factor1 = Math.max(0, Math.min(1, factor1)); // Ensure factor1 is in [0, 1]
            } else if (alpha_watermark_adjusted > this.opaqueThreshold) {
              // If the denominator is 0 (opaqueThreshold >= 255), and alpha is still greater, full borrowing
              factor1 = 1;
            }

            if (x > 0) {
              // Smoothing with the pixel to the left in the same row
              imgData[j_offset] = Math.round(
                factor1 * imgData[j_offset - 4] + (1 - factor1) * imgData[j_offset],
              );
              imgData[j_offset + 1] = Math.round(
                factor1 * imgData[j_offset - 3] + (1 - factor1) * imgData[j_offset + 1],
              );
              imgData[j_offset + 2] = Math.round(
                factor1 * imgData[j_offset - 2] + (1 - factor1) * imgData[j_offset + 2],
              );
            }
          }
        }
      }
    }
  }
}

export interface UnwatermarkerConfig {
  watermark: ImageFile;
  top: number;
  left: number;
  alphaAdjust?: number; // Watermark alpha channel amplification factor (default 1.0)
  transparencyThreshold?: number; // Transparency threshold for pixel processing (default 1)
  opaqueThreshold?: number; // Opacity threshold for additional smoothing (default 250)
}
