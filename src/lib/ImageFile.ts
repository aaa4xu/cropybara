export type ImageFileImage = CanvasImageSource & {
  width: number;
  height: number;
  close?: () => void;
};

export class ImageFile extends File {
  private imagePromise?: Promise<ImageFileImage>;

  public static async fromFile(file: File): Promise<ImageFile> {
    const image = await this.decodeFile(file);
    try {
      const width = 'naturalWidth' in image ? image.naturalWidth || image.width : image.width;
      const height = 'naturalHeight' in image ? image.naturalHeight || image.height : image.height;

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error(`Image has invalid dimensions: ${width}x${height}.`);
      }

      return new ImageFile(file, width, height);
    } finally {
      image.close?.();
    }
  }

  protected static async decodeFile(file: File): Promise<ImageFileImage> {
    if (typeof createImageBitmap !== 'undefined') {
      return createImageBitmap(file);
    }

    return ImageFile.loadImageFromFile(file);
  }

  private static async loadImageFromFile(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
      return await this.loadImageFromUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  protected static async loadImageFromUrl(url: string) {
    const image = new Image();

    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        image.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        image.onload = () => resolve(image);
        image.decoding = 'async';
        image.crossOrigin = 'Anonymous';
        image.src = url;
      });
    } finally {
      image.onerror = null;
      image.onload = null;
    }
  }

  public constructor(
    file: File,
    public readonly width: number,
    public readonly height: number,
    name?: string,
  ) {
    super([file], name ?? file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  public async bytes(): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  }

  protected decodeImage(): Promise<ImageFileImage> {
    return ImageFile.decodeFile(this);
  }

  public image(): Promise<ImageFileImage> {
    this.imagePromise ??= this.decodeImage().catch((err) => {
      this.imagePromise = undefined;
      throw err;
    });

    return this.imagePromise;
  }

  public releaseImage(): void {
    const image = this.imagePromise;
    this.imagePromise = undefined;
    void image?.then((source) => source.close?.()).catch(() => undefined);
  }
}
