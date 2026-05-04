import type { ConfigState } from './ConfigState';
import { ConfigDetector } from './ConfigState';
import type { ImageFile } from './ImageFile';
import type { ImageOutputOptions } from './ImageOutputFormat';

const BYTES_PER_MEBIBYTE = 1024 * 1024;
const PIXELS_PER_MEGAPIXEL = 1_000_000;

export interface ProcessingTelemetryInput {
  readonly processingId: string;
  readonly images: readonly ImageFile[];
  readonly cuts: readonly number[];
  readonly config: ConfigState;
  readonly output: ImageOutputOptions;
  readonly saveBackend: string;
  readonly workerCount: number;
}

export interface ProcessingTelemetryProperties {
  readonly processing_id: string;
  readonly detector: string;
  readonly denoiser: string;
  readonly unwatermark: string;
  readonly limit: number;
  readonly sensitivity?: number;
  readonly step?: number;
  readonly margins?: number;
  readonly output_format: string;
  readonly output_quality?: number;
  readonly save_backend: string;
  readonly worker_count: number;
  readonly file_count: number;
  readonly cut_count: number;
  readonly slice_count: number;
  readonly input_total_bytes: number;
  readonly input_total_mib: number;
  readonly input_total_pixels: number;
  readonly input_total_megapixels: number;
  readonly input_total_height: number;
  readonly input_min_width: number;
  readonly input_max_width: number;
  readonly input_min_height: number;
  readonly input_max_height: number;
  readonly file_count_bucket: string;
  readonly input_megapixels_bucket: string;
}

export function createProcessingTelemetry(
  input: ProcessingTelemetryInput,
): ProcessingTelemetryProperties {
  const widths = input.images.map((image) => image.width);
  const heights = input.images.map((image) => image.height);
  const totalBytes = input.images.reduce((sum, image) => sum + image.size, 0);
  const totalPixels = input.images.reduce((sum, image) => sum + image.width * image.height, 0);
  const totalMegapixels = totalPixels / PIXELS_PER_MEGAPIXEL;

  return compactProperties({
    processing_id: input.processingId,
    detector: input.config.detector,
    denoiser: input.config.denoiser,
    unwatermark: input.config.unwatermark,
    limit: input.config.limit,
    sensitivity:
      input.config.detector === ConfigDetector.PixelComparison
        ? input.config.sensitivity
        : undefined,
    step: input.config.detector === ConfigDetector.PixelComparison ? input.config.step : undefined,
    margins:
      input.config.detector === ConfigDetector.PixelComparison ? input.config.margins : undefined,
    output_format: input.output.format,
    output_quality: input.output.quality,
    save_backend: input.saveBackend,
    worker_count: input.workerCount,
    file_count: input.images.length,
    cut_count: input.cuts.length,
    slice_count: input.cuts.length + 1,
    input_total_bytes: totalBytes,
    input_total_mib: roundMetric(totalBytes / BYTES_PER_MEBIBYTE),
    input_total_pixels: totalPixels,
    input_total_megapixels: roundMetric(totalMegapixels),
    input_total_height: heights.reduce((sum, height) => sum + height, 0),
    input_min_width: minOrZero(widths),
    input_max_width: maxOrZero(widths),
    input_min_height: minOrZero(heights),
    input_max_height: maxOrZero(heights),
    file_count_bucket: bucketCount(input.images.length),
    input_megapixels_bucket: bucketMegapixels(totalMegapixels),
  });
}

export function createProcessingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function ratePerSecond(total: number, durationMs: number): number | undefined {
  if (!Number.isFinite(total) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return undefined;
  }

  return roundMetric(total / (durationMs / 1000));
}

export function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function compactProperties<T extends Record<string, unknown>>(properties: T): T {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as T;
}

function minOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

function maxOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function bucketCount(value: number): string {
  if (value <= 1) return '1';
  if (value <= 5) return '2-5';
  if (value <= 20) return '6-20';
  if (value <= 100) return '21-100';
  return '101+';
}

function bucketMegapixels(value: number): string {
  if (value < 10) return '<10';
  if (value < 50) return '10-50';
  if (value < 200) return '50-200';
  if (value < 500) return '200-500';
  return '500+';
}
