import { describe, expect, it, vi } from 'vitest';
import { Queue } from './Queue';

describe('Queue', () => {
  it('should process tasks in parallel across all workers', async () => {
    vi.useFakeTimers();
    try {
      const delay = () => (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

      const queue = new Queue([delay(), delay()]);

      const tasks = Array.from({ length: 4 }, () => async (resource: ReturnType<typeof delay>) => {
        await resource(100);
        return Date.now().toString();
      });

      const start = Date.now();
      const completion = Promise.all(tasks.map((task) => queue.enqueue(task, AbortSignal.timeout(1000))));

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      await completion;
      expect(Date.now() - start).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
