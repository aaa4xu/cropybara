export interface SliceSourceDto {
  readonly id: number;
  readonly file: File;
  readonly width: number;
  readonly height: number;
}

export interface SliceChunkDto {
  readonly sourceId: number;

  readonly srcX: number;
  readonly srcY: number;
  readonly srcWidth: number;
  readonly srcHeight: number;

  readonly dstX: number;
  readonly dstY: number;
  readonly dstWidth: number;
  readonly dstHeight: number;
}

export interface SliceJobDto {
  readonly index: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly chunks: readonly SliceChunkDto[];
}

export interface EncodedSliceDto {
  readonly index: number;
  readonly name: string;
  readonly type: 'image/png';
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly crc32: number;
  readonly lastModified: number;
}
