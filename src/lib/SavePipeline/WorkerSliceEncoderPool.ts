import { AbortPromise } from './AbortPromise';
import {
  DEFAULT_IMAGE_OUTPUT_OPTIONS,
  ImageOutputFormatRegistry,
  type ImageOutputOptions,
} from '$lib/ImageOutputFormat';
import type { SliceEncoder } from './SliceEncoder';
import type { SliceWorkerRequest, SliceWorkerResponse } from './SliceWorkerMessages';
import type { EncodedSliceDto, SliceJobDto, SliceSourceDto } from './SlicePipelineTypes';

interface WorkerSliceEncoderPoolOptions {
  readonly sources: readonly SliceSourceDto[];
  readonly workers: number;
  readonly output?: ImageOutputOptions;
}

interface PendingRequest {
  readonly resolve: (value: EncodedSliceDto) => void;
  readonly reject: (reason?: unknown) => void;
}

interface PendingRegistration {
  readonly resolve: () => void;
  readonly reject: (reason?: unknown) => void;
}

interface WorkerWaiter {
  readonly resolve: (worker: WorkerSliceEncoderClient) => void;
  readonly reject: (reason?: unknown) => void;
  readonly onAbort: () => void;
  readonly signal: AbortSignal;
}

class WorkerSliceEncoderClient {
  private requestId = 0;
  private registration: PendingRegistration | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private failed = false;

  public constructor(private readonly worker: Worker) {
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
    this.worker.addEventListener('messageerror', this.handleMessageError);
  }

  public get isAlive(): boolean {
    return !this.failed;
  }

  public registerSources(
    sources: readonly SliceSourceDto[],
    output: ImageOutputOptions,
  ): Promise<void> {
    if (this.failed) {
      return Promise.reject(new Error('Slice encoder worker is not available.'));
    }

    if (this.registration) {
      throw new Error('Sources registration is already in progress.');
    }

    return new Promise<void>((resolve, reject) => {
      this.registration = { resolve, reject };

      try {
        this.worker.postMessage({
          kind: 'register-sources',
          sources,
          output,
        } satisfies SliceWorkerRequest);
      } catch (error) {
        this.registration = null;
        reject(error);
      }
    });
  }

  public encode(job: SliceJobDto): Promise<EncodedSliceDto> {
    if (this.failed) {
      return Promise.reject(new Error('Slice encoder worker is not available.'));
    }

    const requestId = ++this.requestId;
    return new Promise<EncodedSliceDto>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });

      try {
        this.worker.postMessage({
          kind: 'encode',
          requestId,
          job,
        } satisfies SliceWorkerRequest);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  public terminate(): void {
    if (this.failed) {
      return;
    }

    this.failed = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.removeEventListener('messageerror', this.handleMessageError);
    this.worker.terminate();
    this.rejectAll(new Error('Slice encoder worker was terminated.'));
  }

  private readonly handleMessage = (event: MessageEvent<SliceWorkerResponse>): void => {
    const message = event.data;

    if (message.kind === 'sources-registered') {
      this.registration?.resolve();
      this.registration = null;
      return;
    }

    if (message.kind === 'error') {
      const error = new Error(message.error);

      if (message.requestId === -1) {
        this.registration?.reject(error);
        this.registration = null;
        return;
      }

      const pending = this.pending.get(message.requestId);
      this.pending.delete(message.requestId);
      pending?.reject(error);
      return;
    }

    const pending = this.pending.get(message.requestId);
    this.pending.delete(message.requestId);
    pending?.resolve(message.slice);
  };

  private readonly handleError = (event: ErrorEvent): void => {
    this.fail(new Error(`Slice encoder worker error: ${event.message}`));
  };

  private readonly handleMessageError = (): void => {
    this.fail(new Error('Slice encoder worker message error.'));
  };

  private rejectAll(error: Error): void {
    this.registration?.reject(error);
    this.registration = null;

    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }

  private fail(error: Error): void {
    if (this.failed) {
      return;
    }

    this.failed = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.removeEventListener('messageerror', this.handleMessageError);
    this.worker.terminate();
    this.rejectAll(error);
  }
}

export class WorkerSliceEncoderPool implements SliceEncoder {
  public static readonly isSupported =
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined' &&
    'convertToBlob' in OffscreenCanvas.prototype;

  private readonly idle: WorkerSliceEncoderClient[];
  private readonly waiters: WorkerWaiter[] = [];
  private terminated = false;

  private constructor(private readonly workers: readonly WorkerSliceEncoderClient[]) {
    this.idle = [...workers];
  }

  public static async create(
    options: WorkerSliceEncoderPoolOptions,
  ): Promise<WorkerSliceEncoderPool> {
    const workerCount = this.normalizeWorkerCount(options.workers);
    const output = ImageOutputFormatRegistry.normalizeOptions(
      options.output ?? DEFAULT_IMAGE_OUTPUT_OPTIONS,
    );

    const workers: WorkerSliceEncoderClient[] = [];

    try {
      for (let i = 0; i < workerCount; i++) {
        workers.push(
          new WorkerSliceEncoderClient(
            new Worker(new URL('./CanvasSliceEncodeWorker.ts', import.meta.url), {
              type: 'module',
            }),
          ),
        );
      }

      await Promise.all(workers.map((worker) => worker.registerSources(options.sources, output)));

      return new WorkerSliceEncoderPool(workers);
    } catch (error) {
      for (const worker of workers) {
        worker.terminate();
      }

      throw error;
    }
  }

  private static normalizeWorkerCount(value: number): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Worker count must be a positive integer, got ${value}.`);
    }

    return value;
  }

  public async encode(job: SliceJobDto, signal: AbortSignal): Promise<EncodedSliceDto> {
    signal.throwIfAborted();

    const worker = await this.acquire(signal);
    const abort = AbortPromise.create(signal);
    let taskStarted = false;

    try {
      signal.throwIfAborted();

      taskStarted = true;
      const encodeTask = worker.encode(job);

      return await Promise.race([encodeTask, abort.promise]);
    } catch (error) {
      if (signal.aborted && taskStarted) {
        worker.terminate();
      }

      throw error;
    } finally {
      abort.cleanup();
      this.release(worker);
    }
  }

  public terminate(): void {
    if (this.terminated) {
      return;
    }

    this.terminated = true;

    for (const waiter of this.waiters.splice(0)) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
      waiter.reject(new Error('Slice encoder pool was terminated.'));
    }

    for (const worker of this.workers) {
      worker.terminate();
    }

    this.idle.length = 0;
  }

  private acquire(signal: AbortSignal): Promise<WorkerSliceEncoderClient> {
    signal.throwIfAborted();

    const worker = this.acquireIdleWorker();

    if (worker) {
      return Promise.resolve(worker);
    }

    if (this.terminated) {
      return Promise.reject(new Error('Slice encoder pool was terminated.'));
    }

    if (!this.hasAliveWorker()) {
      return Promise.reject(new Error('No slice encoder workers are available.'));
    }

    return new Promise((resolve, reject) => {
      const waiter: WorkerWaiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          this.removeWaiter(waiter);

          try {
            signal.throwIfAborted();
            reject(new Error('Operation aborted.'));
          } catch (error) {
            reject(error);
          }
        },
      };

      this.waiters.push(waiter);
      signal.addEventListener('abort', waiter.onAbort, { once: true });
    });
  }

  private release(worker: WorkerSliceEncoderClient): void {
    if (this.terminated) {
      return;
    }

    if (!worker.isAlive) {
      this.rejectWaitersIfNoAliveWorkers();
      return;
    }

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;

      waiter.signal.removeEventListener('abort', waiter.onAbort);

      if (waiter.signal.aborted) {
        waiter.reject(waiter.signal.reason);
        continue;
      }

      waiter.resolve(worker);
      return;
    }

    this.idle.push(worker);
  }

  private acquireIdleWorker(): WorkerSliceEncoderClient | undefined {
    while (this.idle.length > 0) {
      const worker = this.idle.pop()!;

      if (worker.isAlive) {
        return worker;
      }
    }
  }

  private hasAliveWorker(): boolean {
    return this.workers.some((worker) => worker.isAlive);
  }

  private rejectWaitersIfNoAliveWorkers(): void {
    if (this.hasAliveWorker()) {
      return;
    }

    for (const waiter of this.waiters.splice(0)) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
      waiter.reject(new Error('No slice encoder workers are available.'));
    }
  }

  private removeWaiter(waiter: WorkerWaiter): void {
    const index = this.waiters.indexOf(waiter);

    if (index !== -1) {
      this.waiters.splice(index, 1);
    }
  }
}
