export class Crc32 {
  private static readonly table = Crc32.createTable();

  private value = 0xffffffff;

  public update(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.byteLength; i++) {
      this.value = Crc32.table[(this.value ^ chunk[i]) & 0xff] ^ (this.value >>> 8);
    }
  }

  public digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }

  private static createTable(): Uint32Array {
    const table = new Uint32Array(256);

    for (let i = 0; i < table.length; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }

    return table;
  }
}
