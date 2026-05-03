import { AbortPromise } from './AbortPromise';

export interface OrderedAsyncPoolOptions {
  readonly concurrency: number;
  readonly maxBufferedResults?: number;
}

export class OrderedAsyncPool<TInput, TResult> {
  private readonly concurrency: number;
  private readonly maxBufferedResults: number;

  public constructor(options: OrderedAsyncPoolOptions) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error(`Concurrency must be a positive integer, got ${options.concurrency}.`);
    }

    const maxBufferedResults = options.maxBufferedResults ?? options.concurrency * 2;

    if (!Number.isInteger(maxBufferedResults) || maxBufferedResults < 1) {
      throw new Error(
        `Max buffered results must be a positive integer, got ${maxBufferedResults}.`,
      );
    }

    this.concurrency = options.concurrency;
    this.maxBufferedResults = maxBufferedResults;
  }

  public async *process(
    items: readonly TInput[],
    handler: (item: TInput, signal: AbortSignal) => Promise<TResult>,
    parentSignal: AbortSignal,
  ): AsyncGenerator<TResult> {
    const controller = new AbortController();
    const signal = controller.signal;
    const forwardAbort = (): void => {
      controller.abort(parentSignal.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    if (parentSignal.aborted) {
      forwardAbort();
    } else {
      parentSignal.addEventListener('abort', forwardAbort, { once: true });
    }

    let nextToStart = 0;
    let nextToYield = 0;

    const running = new Map<
      number,
      Promise<{ readonly index: number; readonly result: TResult }>
    >();
    const completed = new Map<number, TResult>();
    const { promise: abortPromise, cleanup: cleanupAbortPromise } = AbortPromise.create(signal);

    const startMore = (): void => {
      signal.throwIfAborted();

      while (
        nextToStart < items.length &&
        running.size < this.concurrency &&
        completed.size < this.maxBufferedResults
      ) {
        const index = nextToStart++;
        const promise = handler(items[index], signal).then((result) => ({ index, result }));
        promise.catch(() => undefined);
        running.set(index, promise);
      }
    };

    try {
      startMore();

      while (nextToYield < items.length) {
        signal.throwIfAborted();

        while (completed.has(nextToYield)) {
          const result = completed.get(nextToYield)!;
          completed.delete(nextToYield);
          nextToYield++;
          startMore();

          yield result;
        }

        if (nextToYield >= items.length) {
          return;
        }

        const finished = await Promise.race([...running.values(), abortPromise]);
        running.delete(finished.index);
        completed.set(finished.index, finished.result);
        startMore();
      }
    } finally {
      parentSignal.removeEventListener('abort', forwardAbort);

      if (!signal.aborted) {
        controller.abort(new DOMException('OrderedAsyncPool stopped.', 'AbortError'));
      }

      cleanupAbortPromise();

      for (const promise of running.values()) {
        promise.catch(() => undefined);
      }
    }
  }
}
