import { browser } from '$app/environment';
import posthog, { type Properties } from 'posthog-js';

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

  public static trackUpload(source: string, onFiles: (files: File[]) => void) {
    return (files: File[]) => {
      if (browser) {
        posthog.capture('upload', {
          source,
          count: files.length,
          types: [...new Set(files.map((f) => f.type || f.name.split('.').pop()))],
        });
      }

      onFiles(files);
    };
  }

  public static trackConfig(config?: Properties) {
    if (!browser) return;

    posthog.capture('config', config);
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
