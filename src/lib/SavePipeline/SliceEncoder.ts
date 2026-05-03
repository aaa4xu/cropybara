import type { EncodedSliceDto, SliceJobDto } from './SlicePipelineTypes';

export interface SliceEncoder {
  encode(job: SliceJobDto, signal: AbortSignal): Promise<EncodedSliceDto>;
}
