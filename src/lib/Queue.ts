/**
 * Implements a queue that processes tasks (consumers) concurrently,
 * using a pool of provided resources.
 */
export class Queue<Resource> implements QueueInterface<Resource> {
  private readonly busyResources = new Set<Resource>();
  private readonly pendingTasks: Array<{
    task: QueueConsumer<Resource, unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    signal: AbortSignal;
  }> = [];

  /**
   * Creates an instance of Queue.
   * @param resources An array of resources to be used by consumers. Must not be empty.
   */
  public constructor(private readonly resources: ReadonlyArray<Resource>) {
    if (!resources || resources.length === 0) {
      throw new Error('Queue requires at least one resource.');
    }
  }

  /**
   * Adds a task to the queue.
   * The task will be executed as soon as a resource becomes available and if the signal is not aborted.
   * @param task The consumer function to execute.
   * @param signal A signal to cancel waiting for or executing the task.
   */
  public enqueue<T>(task: QueueConsumer<Resource, T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject: (err: Error) => void) => {
      // If the signal is already aborted, reject the promise immediately
      if (signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }

      const queueEntry = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
      };
      this.pendingTasks.push(queueEntry);

      // Signal abort handler
      const abortHandler = () => {
        // Remove the task from the pending queue if it's still there
        const index = this.pendingTasks.indexOf(queueEntry);
        if (index !== -1) {
          this.pendingTasks.splice(index, 1);
          // Reject the promise associated with this task
          reject(new DOMException('Aborted', 'AbortError'));
        }
        // If the task is already running, it should handle the abort signal itself
        // The resource will be released in the finally block
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      // Attempt to schedule task execution
      this.scheduleNext();
    });
  }

  /**
   * Method to attempt to run the next pending task if there is an available resource.
   */
  private scheduleNext(): void {
    // Are there any pending tasks?
    if (this.pendingTasks.length === 0) {
      return; // No tasks to execute
    }

    // Find an available resource
    let availableResource: Resource | undefined = undefined;
    for (const resource of this.resources) {
      if (!this.busyResources.has(resource)) {
        availableResource = resource;
        break;
      }
    }

    // Is there an available resource?
    if (!availableResource) {
      return; // All resources are busy
    }

    // Get the next task from the queue
    const nextTaskEntry = this.pendingTasks.shift();
    if (!nextTaskEntry) {
      // This should not happen if pendingTasks.length > 0, but for safety
      return;
    }

    const { task, resolve, reject, signal } = nextTaskEntry;

    // Check if the signal was aborted *before* starting execution
    if (signal.aborted) {
      // Reject the task's promise and try to schedule the next one
      reject(new DOMException('Aborted', 'AbortError'));
      this.scheduleNext(); // Try to get the next task for the available resource
      return;
    }

    // Resource found and task not canceled - run it
    this.busyResources.add(availableResource);

    task(availableResource!, signal)
      .then(resolve, reject) // Resolve/reject the `enqueue` promise
      .finally(() => {
        // Release the resource regardless of the outcome
        this.busyResources.delete(availableResource!);
        // Attempt to run the next task, as a resource has been freed
        this.scheduleNext();
      });
  }
}

// Define the interfaces and types for the queue system
export interface QueueInterface<Resource> {
  enqueue<T>(task: QueueConsumer<Resource, T>, signal: AbortSignal): Promise<T>;
}

// Defines the signature for a consumer function
export type QueueConsumer<Resource, Return> = (
  resource: Resource,
  signal: AbortSignal,
) => Promise<Return>;
