export class ZipFormat {
  public static readonly utf8AndDataDescriptorFlag = 0x0808;
  public static readonly compressionStore = 0;
  public static readonly dataDescriptorLength = 16;

  public static assertUint16(value: number, message: string) {
    if (value > 0xffff) {
      throw new Error(message);
    }
  }

  public static assertUint32(value: number, message: string) {
    if (value > 0xffffffff) {
      throw new Error(message);
    }
  }
}
