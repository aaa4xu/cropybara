import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerSliceEncoderPool } from './WorkerSliceEncoderPool';
import type { SliceWorkerRequest, SliceWorkerResponse } from './SliceWorkerMessages';
import type { EncodedSliceDto, SliceJobDto } from './SlicePipelineTypes';

type WorkerListener = (event: unknown) => void;

class MockWorker {
  public static readonly instances: MockWorker[] = [];
  public static registerPostMessageError: Error | null = null;

  public readonly messages: SliceWorkerRequest[] = [];
  public readonly postMessage = vi.fn((message: SliceWorkerRequest) => {
    const error =
      message.kind === 'register-sources'
        ? MockWorker.registerPostMessageError
        : this.nextPostMessageError;

    if (error) {
      this.nextPostMessageError = null;
      throw error;
    }

    this.messages.push(message);

    if (message.kind === 'register-sources') {
      queueMicrotask(() => {
        this.emit('message', { kind: 'sources-registered' } satisfies SliceWorkerResponse);
      });
    }
  });
  public readonly terminate = vi.fn(() => {
    this.terminated = true;
  });
  public nextPostMessageError: Error | null = null;
  public terminated = false;

  private readonly listeners = new Map<string, Set<WorkerListener>>();

  public constructor() {
    MockWorker.instances.push(this);
  }

  public addEventListener(type: string, listener: WorkerListener): void {
    const listeners = this.listeners.get(type) ?? new Set<WorkerListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: WorkerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data, message: String(data) });
    }
  }

  public resolveLastEncode(slice = encodedSlice()): void {
    const request = this.messages.findLast(
      (message): message is Extract<SliceWorkerRequest, { kind: 'encode' }> =>
        message.kind === 'encode',
    );

    if (!request) {
      throw new Error('No encode request to resolve.');
    }

    this.emit('message', {
      kind: 'encoded',
      requestId: request.requestId,
      slice,
    } satisfies SliceWorkerResponse);
  }
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function job(index = 0): SliceJobDto {
  return {
    index,
    name: `${index + 1}.png`,
    width: 1,
    height: 1,
    chunks: [],
  };
}

function encodedSlice(index = 0): EncodedSliceDto {
  const bytes = new Uint8Array([index]);

  return {
    index,
    name: `${index + 1}.png`,
    type: 'image/png',
    bytes,
    size: bytes.byteLength,
    crc32: 0,
    lastModified: 0,
  };
}

async function createPool(workers = 1): Promise<WorkerSliceEncoderPool> {
  return WorkerSliceEncoderPool.create({ sources: [], workers });
}

describe('WorkerSliceEncoderPool', () => {
  beforeEach(() => {
    MockWorker.instances.length = 0;
    MockWorker.registerPostMessageError = null;
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects invalid worker counts', async () => {
    await expect(
      WorkerSliceEncoderPool.create({ sources: [], workers: Number.NaN }),
    ).rejects.toThrow('Worker count must be a positive integer');
  });

  it('terminates already created workers when worker construction fails', async () => {
    let constructed = 0;

    class PartiallyFailingWorker extends MockWorker {
      public constructor() {
        super();
        constructed++;

        if (constructed === 2) {
          throw new Error('Worker constructor failed');
        }
      }
    }

    vi.stubGlobal('Worker', PartiallyFailingWorker);

    await expect(WorkerSliceEncoderPool.create({ sources: [], workers: 3 })).rejects.toThrow(
      'Worker constructor failed',
    );
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('does not return a messageerror-failed worker to the idle pool', async () => {
    const pool = await createPool(2);
    const failedWorker = MockWorker.instances[1];
    const aliveWorker = MockWorker.instances[0];

    failedWorker.emit('messageerror', undefined);
    const promise = pool.encode(job(), new AbortController().signal);
    await wait();

    expect(failedWorker.terminate).toHaveBeenCalledTimes(1);
    expect(failedWorker.messages.filter((message) => message.kind === 'encode')).toHaveLength(0);
    expect(aliveWorker.messages.some((message) => message.kind === 'encode')).toBe(true);

    aliveWorker.resolveLastEncode();
    await expect(promise).resolves.toMatchObject({ name: '1.png' });
    pool.terminate();
  });

  it('rejects new work when every worker has failed', async () => {
    const pool = await createPool(1);
    MockWorker.instances[0].emit('messageerror', undefined);

    await expect(pool.encode(job(), new AbortController().signal)).rejects.toThrow(
      'No slice encoder workers are available.',
    );
  });

  it('rejects waiters when the pool is terminated', async () => {
    const pool = await createPool(1);
    const signal = new AbortController().signal;
    const first = pool.encode(job(0), signal);
    await wait();
    const second = pool.encode(job(1), signal);
    await wait();

    pool.terminate();

    await expect(first).rejects.toThrow('Slice encoder worker was terminated.');
    await expect(second).rejects.toThrow('Slice encoder pool was terminated.');
  });

  it('terminates only the worker used by an aborted encode', async () => {
    const pool = await createPool(2);
    const abortedWorker = MockWorker.instances[1];
    const aliveWorker = MockWorker.instances[0];
    const controller = new AbortController();
    const promise = pool.encode(job(), controller.signal);
    await wait();

    controller.abort(new Error('Stopped'));

    await expect(promise).rejects.toThrow('Stopped');
    expect(abortedWorker.terminate).toHaveBeenCalledTimes(1);
    expect(aliveWorker.terminate).not.toHaveBeenCalled();
    pool.terminate();
  });

  it('keeps other workers available after one encode is aborted', async () => {
    const pool = await createPool(2);
    const abortedWorker = MockWorker.instances[1];
    const aliveWorker = MockWorker.instances[0];
    const controller = new AbortController();
    const aborted = pool.encode(job(0), controller.signal);
    await wait();

    controller.abort(new Error('Stopped'));
    await expect(aborted).rejects.toThrow('Stopped');

    const next = pool.encode(job(2), new AbortController().signal);
    await wait();
    expect(abortedWorker.messages.filter((message) => message.kind === 'encode')).toHaveLength(1);
    expect(aliveWorker.messages.some((message) => message.kind === 'encode')).toBe(true);

    aliveWorker.resolveLastEncode(encodedSlice(2));
    await expect(next).resolves.toMatchObject({ name: '3.png' });
    pool.terminate();
  });

  it('does not terminate a worker when signal aborts before encode starts', async () => {
    const pool = await createPool(1);
    const worker = MockWorker.instances[0];
    const first = pool.encode(job(0), new AbortController().signal);
    await wait();
    const controller = new AbortController();
    const second = pool.encode(job(1), controller.signal);
    await wait();

    controller.abort(new Error('Stopped before encode'));

    await expect(second).rejects.toThrow('Stopped before encode');
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.resolveLastEncode(encodedSlice(0));
    await expect(first).resolves.toMatchObject({ name: '1.png' });
    pool.terminate();
  });

  it('recovers after a synchronous encode postMessage error', async () => {
    const pool = await createPool(1);
    const worker = MockWorker.instances[0];
    worker.nextPostMessageError = new DOMException('Cannot clone', 'DataCloneError');

    await expect(pool.encode(job(), new AbortController().signal)).rejects.toThrow('Cannot clone');

    const promise = pool.encode(job(), new AbortController().signal);
    await wait();
    worker.resolveLastEncode();
    await expect(promise).resolves.toMatchObject({ name: '1.png' });
    pool.terminate();
  });

  it('terminates workers after a synchronous source registration postMessage error', async () => {
    MockWorker.registerPostMessageError = new DOMException('Cannot clone', 'DataCloneError');

    await expect(createPool(1)).rejects.toThrow('Cannot clone');
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
