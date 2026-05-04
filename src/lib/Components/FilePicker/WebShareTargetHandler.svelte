<script lang="ts">
  import type { LocalFilesPickerProps } from '$lib/LocalFilesPickerProps';
  import { WebShareTarget } from '$lib/WebShareTarget';

  const { onFiles, disabled = false, onSourceSelected }: LocalFilesPickerProps = $props();
  let handled = false;

  $effect(() => {
    if (handled || disabled || !WebShareTarget.isLaunch()) return;

    handled = true;
    onSourceSelected?.();

    (async () => {
      const mediaCache = await caches.open(WebShareTarget.CacheName);
      const keys = await mediaCache.keys();
      const sortedKeys = keys
        .map((k) => k.url)
        .sort((l, r) =>
          l.localeCompare(r, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        );

      const files: File[] = [];
      for (const key of sortedKeys) {
        const response = await mediaCache.match(key);
        if (!response) continue;

        const blob = await response.blob();
        files.push(
          new File(
            [blob],
            response.headers.get(WebShareTarget.FilenameHeader) ?? `file-${key}.bin`,
            {
              type: response.headers.get(WebShareTarget.TypeHeader) ?? 'image/png',
              lastModified: Date.now(),
            },
          ),
        );
      }

      onFiles(files);
      await caches.delete(WebShareTarget.CacheName);
    })();
  });
</script>
