import type { ImageOutputOptions } from './ImageOutputFormat';

export interface ConfigStateCommon {
  name: string;
  limit: number;
  output: ImageOutputOptions;
  denoiser: ConfigDenoiser;
  unwatermark: ConfigUnwatermark;
}

export interface ConfigStateManualDetector {
  detector: ConfigDetector.Manual;
}

export interface ConfigStatePixelComparisonDetector {
  detector: ConfigDetector.PixelComparison;
  sensitivity: number;
  step: number;
  margins: number;
}

export enum ConfigDetector {
  Manual = 'Manual',
  PixelComparison = 'PixelComparison',
}

export enum ConfigDenoiser {
  Off = 'Off',
  ManhwaNullONNX = 'ManhwaNullONNX',
  Unjpeg = 'Unjpeg',
}

export enum ConfigUnwatermark {
  Off = 'Off',
  ACQQ = 'ACQQ',
}

export type ConfigState = ConfigStateCommon &
  (ConfigStateManualDetector | ConfigStatePixelComparisonDetector);
