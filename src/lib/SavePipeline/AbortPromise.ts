export class AbortPromise {
  public static create(signal: AbortSignal): {
    readonly promise: Promise<never>;
    readonly cleanup: () => void;
  } {
    let onAbort: (() => void) | undefined;

    const promise = new Promise<never>((_, reject) => {
      onAbort = () => {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });

    return {
      promise,
      cleanup: () => {
        if (onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      },
    };
  }
}
