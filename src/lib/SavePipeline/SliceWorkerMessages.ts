import type { EncodedSliceDto, SliceJobDto, SliceSourceDto } from './SlicePipelineTypes';

export type SliceWorkerRequest =
  | {
      readonly kind: 'register-sources';
      readonly sources: readonly SliceSourceDto[];
    }
  | {
      readonly kind: 'encode';
      readonly requestId: number;
      readonly job: SliceJobDto;
    };

export type SliceWorkerResponse =
  | {
      readonly kind: 'sources-registered';
    }
  | {
      readonly kind: 'encoded';
      readonly requestId: number;
      readonly slice: EncodedSliceDto;
    }
  | {
      readonly kind: 'error';
      readonly requestId: number;
      readonly error: string;
    };
