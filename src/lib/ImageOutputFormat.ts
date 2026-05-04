export enum ImageOutputFormat {
  Png = 'png',
  Jpeg = 'jpeg',
  Webp = 'webp',
  Avif = 'avif',
}

export type ImageOutputMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export interface ImageOutputOptions {
  readonly format: ImageOutputFormat;
  readonly quality?: number;
}

export interface ImageOutputFormatDefinition {
  readonly format: ImageOutputFormat;
  readonly label: string;
  readonly mimeType: ImageOutputMimeType;
  readonly extension: string;
  readonly canUseQuality: boolean;
}

export interface SupportedImageOutputFormat extends ImageOutputFormatDefinition {
  readonly supportsQuality: boolean;
}

export interface ImageEncodeOptions {
  readonly type: ImageOutputMimeType;
  readonly quality?: number;
}

export const DEFAULT_IMAGE_OUTPUT_FORMAT = ImageOutputFormat.Png;
export const DEFAULT_IMAGE_OUTPUT_QUALITY = 92;
export const DEFAULT_IMAGE_OUTPUT_OPTIONS: ImageOutputOptions = {
  format: DEFAULT_IMAGE_OUTPUT_FORMAT,
};

const imageOutputFormats: readonly ImageOutputFormatDefinition[] = [
  {
    format: ImageOutputFormat.Png,
    label: 'PNG',
    mimeType: 'image/png',
    extension: 'png',
    canUseQuality: false,
  },
  {
    format: ImageOutputFormat.Jpeg,
    label: 'JPEG',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    canUseQuality: true,
  },
  {
    format: ImageOutputFormat.Webp,
    label: 'WebP',
    mimeType: 'image/webp',
    extension: 'webp',
    canUseQuality: true,
  },
  {
    format: ImageOutputFormat.Avif,
    label: 'AVIF',
    mimeType: 'image/avif',
    extension: 'avif',
    canUseQuality: true,
  },
];

export class ImageOutputFormatRegistry {
  public static readonly all = imageOutputFormats;

  public static readonly defaultSupported: readonly SupportedImageOutputFormat[] = [
    {
      ...this.get(DEFAULT_IMAGE_OUTPUT_FORMAT),
      supportsQuality: false,
    },
  ];

  public static get(format: ImageOutputFormat): ImageOutputFormatDefinition {
    const definition = imageOutputFormats.find((candidate) => candidate.format === format);

    if (!definition) {
      throw new Error(`Unsupported image output format: ${format}.`);
    }

    return definition;
  }

  public static toEncodeOptions(output: ImageOutputOptions): ImageEncodeOptions {
    const normalizedOutput = this.normalizeOptions(output);
    const definition = this.get(normalizedOutput.format);
    const options: ImageEncodeOptions = {
      type: definition.mimeType,
    };

    if (!definition.canUseQuality || normalizedOutput.quality == null) {
      return options;
    }

    return {
      ...options,
      quality: this.toEncoderQuality(normalizedOutput.quality),
    };
  }

  public static normalizeOptions(output: ImageOutputOptions): ImageOutputOptions {
    const definition = this.get(output.format);

    if (!definition.canUseQuality || output.quality == null) {
      return {
        format: definition.format,
      };
    }

    this.toEncoderQuality(output.quality);

    return {
      format: definition.format,
      quality: output.quality,
    };
  }

  public static toEncoderQuality(quality: number): number {
    if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
      throw new Error(`Image output quality must be between 1 and 100, got ${quality}.`);
    }

    return quality / 100;
  }
}
