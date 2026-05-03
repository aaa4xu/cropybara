import { describe, expect, it } from 'vitest';

import { OrderedAsyncPool } from './OrderedAsyncPool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('OrderedAsyncPool', () => {
  it('rejects zero maxBufferedResults because it cannot make progress', () => {
    expect(
      () =>
        new OrderedAsyncPool<number, number>({
          concurrency: 2,
          maxBufferedResults: 0,
        }),
    ).toThrow('Max buffered results must be a positive integer');
  });

  it('yields results in input order', async () => {
    const pool = new OrderedAsyncPool<number, number>({ concurrency: 3 });
    const controller = new AbortController();
    const results: number[] = [];

    for await (const result of pool.process(
      [0, 1, 2],
      async (item) => {
        await wait((3 - item) * 5);
        return item;
      },
      controller.signal,
    )) {
      results.push(result);
    }

    expect(results).toStrictEqual([0, 1, 2]);
  });

  it('starts new work when any task finishes before an earlier index can yield', async () => {
    const pool = new OrderedAsyncPool<number, number>({ concurrency: 2 });
    const controller = new AbortController();
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    const starts: number[] = [];

    const iterator = pool
      .process(
        [0, 1, 2],
        (item) => {
          starts.push(item);
          return gates[item].promise;
        },
        controller.signal,
      )
      [Symbol.asyncIterator]();

    const first = iterator.next();
    await wait();
    expect(starts).toStrictEqual([0, 1]);

    gates[1].resolve(1);
    await wait();
    expect(starts).toStrictEqual([0, 1, 2]);

    gates[2].resolve(2);
    await wait();
    gates[0].resolve(0);

    await expect(first).resolves.toStrictEqual({ done: false, value: 0 });
    await expect(iterator.next()).resolves.toStrictEqual({ done: false, value: 1 });
    await expect(iterator.next()).resolves.toStrictEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
  });

  it('does not exceed configured concurrency', async () => {
    const pool = new OrderedAsyncPool<number, number>({ concurrency: 2 });
    const controller = new AbortController();
    let active = 0;
    let maxActive = 0;

    const results: number[] = [];

    for await (const result of pool.process(
      [0, 1, 2, 3, 4],
      async (item) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await wait(5);
        active--;
        return item;
      },
      controller.signal,
    )) {
      results.push(result);
    }

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toStrictEqual([0, 1, 2, 3, 4]);
  });

  it('rejects when the signal is aborted', async () => {
    const pool = new OrderedAsyncPool<number, number>({ concurrency: 1 });
    const controller = new AbortController();
    controller.abort(new Error('Stopped'));

    const iterator = pool.process([1], async (item) => item, controller.signal);

    await expect(iterator.next()).rejects.toThrow('Stopped');
  });

  it('does not start more work while out-of-order results fill the buffer', async () => {
    const pool = new OrderedAsyncPool<number, number>({
      concurrency: 2,
      maxBufferedResults: 1,
    });
    const controller = new AbortController();
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    const starts: number[] = [];

    const iterator = pool
      .process(
        [0, 1, 2],
        (item) => {
          starts.push(item);
          return gates[item].promise;
        },
        controller.signal,
      )
      [Symbol.asyncIterator]();

    const first = iterator.next();
    await wait();
    expect(starts).toStrictEqual([0, 1]);

    gates[1].resolve(1);
    await wait();
    expect(starts).toStrictEqual([0, 1]);

    gates[0].resolve(0);
    await expect(first).resolves.toStrictEqual({ done: false, value: 0 });

    const second = iterator.next();
    await wait();
    expect(starts).toStrictEqual([0, 1, 2]);
    await expect(second).resolves.toStrictEqual({ done: false, value: 1 });
    gates[2].resolve(2);
    await expect(iterator.next()).resolves.toStrictEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
  });

  it('aborts in-flight work when the consumer stops early', async () => {
    const pool = new OrderedAsyncPool<number, number>({ concurrency: 2 });
    const controller = new AbortController();
    const childSignals: AbortSignal[] = [];

    for await (const result of pool.process(
      [0, 1],
      (item, signal) => {
        childSignals.push(signal);

        if (item === 0) {
          return Promise.resolve(item);
        }

        return new Promise<number>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
      controller.signal,
    )) {
      expect(result).toBe(0);
      break;
    }

    expect(childSignals).toHaveLength(2);
    expect(childSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
