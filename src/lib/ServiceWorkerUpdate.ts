import {
  SERVICE_WORKER_SKIP_WAITING_MESSAGE,
  type ServiceWorkerSkipWaitingMessage,
} from '$lib/ServiceWorkerMessages';

type ReloadPage = () => void;
type IsInstalledAppClient = () => boolean;

export interface ServiceWorkerUpdateReadyEvent {
  readonly apply: () => boolean;
}

export interface ServiceWorkerUpdateWatcher {
  readonly stop: () => void;
}

interface WatchReadyServiceWorkerUpdateOptions {
  readonly onReady: (event: ServiceWorkerUpdateReadyEvent) => void;
  readonly isInstalledAppClient?: IsInstalledAppClient;
  readonly reloadPage?: ReloadPage;
}

export function watchReadyServiceWorkerUpdate({
  onReady,
  isInstalledAppClient = detectInstalledAppClient,
  reloadPage = () => window.location.reload(),
}: WatchReadyServiceWorkerUpdateOptions): ServiceWorkerUpdateWatcher {
  let activationRequested = false;
  let reloadRequested = false;
  let readyDispatched = false;
  let stopped = false;
  const cleanups: Array<() => void> = [];

  const stop = () => {
    stopped = true;
    clearCleanups();
  };

  const serviceWorker = getServiceWorkerContainer();

  if (!isInstalledAppClient() || !serviceWorker?.controller) {
    return { stop };
  }

  const serviceWorkerContainer = serviceWorker;

  void (async () => {
    let registration: ServiceWorkerRegistration | undefined;

    try {
      registration = await serviceWorkerContainer.getRegistration();
    } catch {
      return;
    }

    if (stopped || !registration) {
      return;
    }

    observeRegistration(registration);
    notifyReadyWorker(getReadyWorker(registration));

    if (stopped || readyDispatched) {
      return;
    }

    try {
      await registration.update();
    } catch {
      // An offline update check should not block the source picker.
    }

    if (stopped || readyDispatched) {
      return;
    }

    notifyReadyWorker(getReadyWorker(registration));
  })();

  return { stop };

  function observeRegistration(registration: ServiceWorkerRegistration): void {
    const handleUpdateFound = () => {
      watchInstallingWorker(registration.installing);
      notifyReadyWorker(getReadyWorker(registration));
    };

    registration.addEventListener('updatefound', handleUpdateFound);
    cleanups.push(() => registration.removeEventListener('updatefound', handleUpdateFound));

    watchInstallingWorker(registration.installing);
  }

  function watchInstallingWorker(worker: ServiceWorker | null): void {
    if (!worker || readyDispatched) {
      return;
    }

    if (isReadyWorker(worker)) {
      notifyReadyWorker(worker);
      return;
    }

    const handleStateChange = () => {
      if (isReadyWorker(worker)) {
        worker.removeEventListener('statechange', handleStateChange);
        notifyReadyWorker(worker);
      }
    };

    worker.addEventListener('statechange', handleStateChange);
    cleanups.push(() => worker.removeEventListener('statechange', handleStateChange));
  }

  function notifyReadyWorker(worker: ServiceWorker | null): void {
    if (stopped || readyDispatched || !worker || !isReadyWorker(worker)) {
      return;
    }

    readyDispatched = true;
    clearCleanups();

    onReady({
      apply: () => activateReadyServiceWorker(worker),
    });
  }

  function activateReadyServiceWorker(worker: ServiceWorker): boolean {
    if (activationRequested) {
      return true;
    }

    activationRequested = true;

    serviceWorkerContainer.addEventListener(
      'controllerchange',
      () => {
        reloadOnce();
      },
      { once: true },
    );

    if (worker.state === 'activated') {
      reloadOnce();
      return true;
    }

    const handleStateChange = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', handleStateChange);
        reloadOnce();
      }
    };

    worker.addEventListener('statechange', handleStateChange);

    worker.postMessage({
      type: SERVICE_WORKER_SKIP_WAITING_MESSAGE,
    } satisfies ServiceWorkerSkipWaitingMessage);

    return true;
  }

  function reloadOnce(): void {
    if (reloadRequested) {
      return;
    }

    reloadRequested = true;
    reloadPage();
  }

  function clearCleanups(): void {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  }
}

function detectInstalledAppClient(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  return (
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function getServiceWorkerContainer(): ServiceWorkerContainer | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
}

function getReadyWorker(registration: ServiceWorkerRegistration): ServiceWorker | null {
  return registration.waiting ?? getReadyInstallingWorker(registration.installing);
}

function getReadyInstallingWorker(worker: ServiceWorker | null): ServiceWorker | null {
  return worker && isReadyWorker(worker) ? worker : null;
}

function isReadyWorker(worker: ServiceWorker): boolean {
  return worker.state === 'installed' || worker.state === 'activated';
}
