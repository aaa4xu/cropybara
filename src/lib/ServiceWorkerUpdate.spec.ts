import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SERVICE_WORKER_SKIP_WAITING_MESSAGE } from './ServiceWorkerMessages';
import type { ServiceWorkerUpdateReadyEvent } from './ServiceWorkerUpdate';

class MockServiceWorker extends EventTarget {
  public postMessage = vi.fn();

  public constructor(public state: ServiceWorkerState = 'installed') {
    super();
  }

  public setState(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class MockServiceWorkerRegistration extends EventTarget {
  public waiting: ServiceWorker | null = null;
  public installing: ServiceWorker | null = null;
  public update = vi.fn(async () => this as unknown as ServiceWorkerRegistration);
}

class MockServiceWorkerContainer extends EventTarget {
  public controller: ServiceWorker | null = {} as ServiceWorker;

  public constructor(private readonly registration: ServiceWorkerRegistration | null) {
    super();
  }

  public getRegistration = vi.fn(async () => this.registration);
}

async function importSubject() {
  vi.resetModules();
  return await import('./ServiceWorkerUpdate');
}

function stubServiceWorkerContainer(serviceWorker: ServiceWorkerContainer | undefined): void {
  vi.stubGlobal('navigator', {
    serviceWorker,
  });
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('watchReadyServiceWorkerUpdate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when service workers are unavailable', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();

    stubServiceWorkerContainer(undefined);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    expect(onReady).not.toHaveBeenCalled();
  });

  it('does not watch updates for regular browser-mode clients', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();
    const waiting = new MockServiceWorker();
    const registration = new MockServiceWorkerRegistration();
    registration.waiting = waiting as unknown as ServiceWorker;
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => false });
    await flushAsync();

    expect(serviceWorker.getRegistration).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('does not watch updates for an uncontrolled first-load page', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();
    const registration = new MockServiceWorkerRegistration();
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );
    serviceWorker.controller = null;

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    expect(registration.update).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('reports a waiting service worker without applying it until requested', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const reload = vi.fn();
    const onReady = vi.fn<(event: ServiceWorkerUpdateReadyEvent) => void>();
    const waiting = new MockServiceWorker();
    const registration = new MockServiceWorkerRegistration();
    registration.waiting = waiting as unknown as ServiceWorker;
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({
      onReady,
      isInstalledAppClient: () => true,
      reloadPage: reload,
    });
    await flushAsync();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(registration.update).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();

    const [event] = onReady.mock.calls[0];
    expect(event.apply()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: SERVICE_WORKER_SKIP_WAITING_MESSAGE,
    });
    expect(reload).not.toHaveBeenCalled();

    waiting.setState('activated');
    waiting.setState('activated');

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for an update and reports it when it becomes waiting', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn<(event: ServiceWorkerUpdateReadyEvent) => void>();
    const waiting = new MockServiceWorker();
    const registration = new MockServiceWorkerRegistration();
    registration.update.mockImplementation(async () => {
      registration.waiting = waiting as unknown as ServiceWorker;
      return registration as unknown as ServiceWorkerRegistration;
    });
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('ignores an update that becomes ready after the watcher is stopped', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();
    const waiting = new MockServiceWorker();
    const registration = new MockServiceWorkerRegistration();
    let resolveUpdate: (() => void) | undefined;
    registration.update.mockImplementation(
      () =>
        new Promise<ServiceWorkerRegistration>((resolve) => {
          resolveUpdate = () => {
            registration.waiting = waiting as unknown as ServiceWorker;
            resolve(registration as unknown as ServiceWorkerRegistration);
          };
        }),
    );
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    const watcher = watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();
    expect(registration.update).toHaveBeenCalledTimes(1);

    watcher.stop();
    resolveUpdate?.();
    await flushAsync();

    expect(onReady).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('reports an installing worker when updatefound fires and installation completes', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn<(event: ServiceWorkerUpdateReadyEvent) => void>();
    const installing = new MockServiceWorker('installing');
    const registration = new MockServiceWorkerRegistration();
    registration.update.mockImplementation(async () => {
      registration.installing = installing as unknown as ServiceWorker;
      registration.dispatchEvent(new Event('updatefound'));
      return registration as unknown as ServiceWorkerRegistration;
    });
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    expect(onReady).not.toHaveBeenCalled();

    installing.setState('installed');

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(installing.postMessage).not.toHaveBeenCalled();
  });

  it('removes installing-worker listeners when stopped before installation completes', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();
    const installing = new MockServiceWorker('installing');
    const registration = new MockServiceWorkerRegistration();
    registration.update.mockImplementation(async () => {
      registration.installing = installing as unknown as ServiceWorker;
      registration.dispatchEvent(new Event('updatefound'));
      return registration as unknown as ServiceWorkerRegistration;
    });
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    const watcher = watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    watcher.stop();
    installing.setState('installed');

    expect(onReady).not.toHaveBeenCalled();
    expect(installing.postMessage).not.toHaveBeenCalled();
  });

  it('ignores update check failures when no update is waiting', async () => {
    const { watchReadyServiceWorkerUpdate } = await importSubject();
    const onReady = vi.fn();
    const registration = new MockServiceWorkerRegistration();
    registration.update.mockRejectedValue(new Error('offline'));
    const serviceWorker = new MockServiceWorkerContainer(
      registration as unknown as ServiceWorkerRegistration,
    );

    stubServiceWorkerContainer(serviceWorker as unknown as ServiceWorkerContainer);

    watchReadyServiceWorkerUpdate({ onReady, isInstalledAppClient: () => true });
    await flushAsync();

    expect(onReady).not.toHaveBeenCalled();
  });
});
