export class ImageFile extends File {
  public static async fromFile(file: File): Promise<ImageFile> {
    const image = await this.loadImageFromFile(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`Image has invalid dimensions: ${width}x${height}.`);
    }

    return new ImageFile(file, width, height);
  }

  protected static async loadImageFromFile(file: File) {
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

  public async image(): Promise<HTMLImageElement> {
    return ImageFile.loadImageFromFile(this);
  }
}
