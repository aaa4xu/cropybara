export class Crc32 {
  private static readonly tables = Crc32.createTables();

  private value = 0xffffffff;

  public update(chunk: Uint8Array): void {
    const tables = Crc32.tables;
    let value = this.value;
    let offset = 0;
    const alignedEnd = chunk.byteLength - (chunk.byteLength % 8);

    while (offset < alignedEnd) {
      value ^=
        chunk[offset] |
        (chunk[offset + 1] << 8) |
        (chunk[offset + 2] << 16) |
        (chunk[offset + 3] << 24);
      value =
        tables[7][value & 0xff] ^
        tables[6][(value >>> 8) & 0xff] ^
        tables[5][(value >>> 16) & 0xff] ^
        tables[4][value >>> 24] ^
        tables[3][chunk[offset + 4]] ^
        tables[2][chunk[offset + 5]] ^
        tables[1][chunk[offset + 6]] ^
        tables[0][chunk[offset + 7]];
      offset += 8;
    }

    while (offset < chunk.byteLength) {
      value = tables[0][(value ^ chunk[offset]) & 0xff] ^ (value >>> 8);
      offset += 1;
    }

    this.value = value >>> 0;
  }

  public digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }

  private static createTables(): Uint32Array[] {
    const table = new Uint32Array(256);

    for (let i = 0; i < table.length; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }

    const tables = [table];

    for (let tableIndex = 1; tableIndex < 8; tableIndex++) {
      const previousTable = tables[tableIndex - 1];
      const nextTable = new Uint32Array(256);

      for (let i = 0; i < nextTable.length; i++) {
        nextTable[i] = table[previousTable[i] & 0xff] ^ (previousTable[i] >>> 8);
      }

      tables.push(nextTable);
    }

    return tables;
  }
}
