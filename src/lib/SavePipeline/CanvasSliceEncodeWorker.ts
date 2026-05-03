/// <reference lib="webworker" />
import { CanvasSliceWorkerRenderer } from './CanvasSliceWorkerRenderer';
import type { SliceWorkerRequest, SliceWorkerResponse } from './SliceWorkerMessages';

const renderer = new CanvasSliceWorkerRenderer();

self.onmessage = async (event: MessageEvent<SliceWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.kind === 'register-sources') {
      renderer.registerSources(message.sources);
      postMessage({ kind: 'sources-registered' } satisfies SliceWorkerResponse);
      return;
    }

    const slice = await renderer.render(message.job);

    postMessage(
      {
        kind: 'encoded',
        requestId: message.requestId,
        slice,
      } satisfies SliceWorkerResponse,
      [slice.bytes.buffer as ArrayBuffer],
    );
  } catch (error) {
    postMessage({
      kind: 'error',
      requestId: message.kind === 'encode' ? message.requestId : -1,
      error: error instanceof Error ? error.message : String(error),
    } satisfies SliceWorkerResponse);
  }
};

export {};
