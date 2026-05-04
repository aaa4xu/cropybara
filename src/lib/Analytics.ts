import { browser } from '$app/environment';
import posthog, { type Properties } from 'posthog-js';

interface PerformanceMemory {
  readonly usedJSHeapSize?: number;
  readonly totalJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
}

type PerformanceWithMemory = Performance & {
  readonly memory?: PerformanceMemory;
};

type NavigatorWithDeviceMemory = Navigator & {
  readonly deviceMemory?: number;
};

export class Analytics {
  public static trackScreen(name: string) {
    if (!browser) return;
    posthog.capture('screen', { name });
    this.googleAnalytics('event', 'page_view', {
      page_title: name,
      page_path: `/${name}`,
      screen_name: name,
    });
  }

  public static trackUpload(source: string, onFiles: (files: File[]) => void | Promise<void>) {
    return (files: File[]) => {
      if (browser) {
        posthog.capture('upload', {
          source,
          count: files.length,
          types: [...new Set(files.map((f) => f.type || f.name.split('.').pop()))],
        });
      }

      return onFiles(files);
    };
  }

  public static trackConfig(config?: Properties) {
    if (!browser) return;

    posthog.capture('config', config);
  }

  public static trackProcessingStarted(metrics: Properties) {
    this.capturePerformanceEvent('processing_started', metrics);
  }

  public static trackProcessingFinished(metrics: Properties) {
    this.capturePerformanceEvent('processing_finished', metrics);
  }

  public static trackProcessingFailed(metrics: Properties, error: unknown) {
    const properties = {
      ...metrics,
      ...this.errorProperties(error),
    };

    this.capturePerformanceEvent('processing_failed', properties);

    if (!browser) return;

    posthog.captureException(
      error,
      this.compactProperties({
        ...properties,
        ...this.performanceContext(),
      }),
    );
  }

  protected static capturePerformanceEvent(event: string, metrics: Properties) {
    if (!browser) return;

    posthog.capture(
      event,
      this.compactProperties({
        ...metrics,
        ...this.performanceContext(),
      }),
    );
  }

  protected static performanceContext(): Properties {
    if (!browser) return {};

    const nav = navigator as NavigatorWithDeviceMemory;
    const memory = (performance as PerformanceWithMemory).memory;

    return this.compactProperties({
      memory_supported: Boolean(memory),
      device_memory_gb: nav.deviceMemory,
      hardware_concurrency: navigator.hardwareConcurrency,
      js_heap_used_bytes: memory?.usedJSHeapSize,
      js_heap_total_bytes: memory?.totalJSHeapSize,
      js_heap_limit_bytes: memory?.jsHeapSizeLimit,
    });
  }

  protected static errorProperties(error: unknown): Properties {
    if (error instanceof DOMException) {
      return {
        error_type: 'DOMException',
        error_name: error.name,
      };
    }

    if (error instanceof Error) {
      return {
        error_type: error.name || 'Error',
      };
    }

    return {
      error_type: typeof error,
    };
  }

  protected static compactProperties(properties: Properties): Properties {
    return Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value !== undefined),
    );
  }

  protected static googleAnalytics<Command extends keyof Gtag.GtagCommands>(
    ...args: [Command, ...Gtag.GtagCommands[Command]]
  ) {
    if (!browser) return;
    try {
      gtag(...args);
    } catch {
      // ignored
    }
  }
}
