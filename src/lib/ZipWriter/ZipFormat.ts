export class ZipFormat {
  public static readonly utf8Flag = 0x0800;
  public static readonly compressionStore = 0;

  public static assertUint16(value: number, message: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(message);
    }
  }

  public static assertUint32(value: number, message: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error(message);
    }
  }
}
