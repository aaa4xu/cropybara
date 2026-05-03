export class ImageBitmapLruCache {
  private readonly items = new Map<number, ImageBitmap>();

  public constructor(private readonly maxItems: number) {
    if (!Number.isInteger(maxItems) || maxItems < 1) {
      throw new Error(`Image bitmap cache size must be a positive integer, got ${maxItems}.`);
    }
  }

  public get(id: number): ImageBitmap | null {
    const item = this.items.get(id);

    if (!item) {
      return null;
    }

    this.items.delete(id);
    this.items.set(id, item);

    return item;
  }

  public set(id: number, bitmap: ImageBitmap): void {
    const existing = this.items.get(id);

    if (existing) {
      existing.close();
      this.items.delete(id);
    }

    this.items.set(id, bitmap);
    this.evict();
  }

  public dispose(): void {
    for (const bitmap of this.items.values()) {
      bitmap.close();
    }

    this.items.clear();
  }

  private evict(): void {
    while (this.items.size > this.maxItems) {
      const oldestKey = this.items.keys().next().value as number | undefined;

      if (oldestKey === undefined) {
        return;
      }

      this.items.get(oldestKey)?.close();
      this.items.delete(oldestKey);
    }
  }
}
