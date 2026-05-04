export const SERVICE_WORKER_SKIP_WAITING_MESSAGE = 'SKIP_WAITING';

export interface ServiceWorkerSkipWaitingMessage {
  readonly type: typeof SERVICE_WORKER_SKIP_WAITING_MESSAGE;
}
