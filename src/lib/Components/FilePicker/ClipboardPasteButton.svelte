<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import Button from '$lib/Components/Button.svelte';
  import type { LocalFilesPickerProps } from '$lib/LocalFilesPickerProps';
  import { browser } from '$app/environment';
  import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
  import { AlertsLevel, AlertsState } from '$lib/States/AlertsState.svelte';

  const alerts = AlertsState.use();
  const progressBar = ProgressBarState.use();
  const { onFiles, disabled = false }: LocalFilesPickerProps = $props();
  const isSupported = browser && 'clipboard' in navigator && 'read' in navigator.clipboard;

  /**
   * Note: Browsers don't provide direct access to copied image *files* (e.g., copying a file in a file explorer).
   * However, they *do* allow access to the raw image *data* when an image is copied
   * (e.g., using "Copy Image" in a browser, copying from an image editor, or taking a screenshot).
   * This function reads that raw image data from the clipboard.
   */
  async function pasteFromClipboard() {
    if (disabled || progressBar.display) return;

    const state = $state({ total: 1, ready: 0 });
    const task = () => state;

    try {
      const clipboard = await navigator.clipboard.read();
      state.total += clipboard.length;
      progressBar.add(task);

      const files: File[] = [];
      for (let i = 0; i < clipboard.length; i++) {
        const item = clipboard[i];

        try {
          const imageType = item.types.includes('image/png')
            ? 'image/png'
            : item.types.find((type) => type.startsWith('image/'));
          if (!imageType) continue;

          const blob = await item.getType(imageType);
          const ext = imageType.split('/').pop()!;
          const file = new File([blob], `clipboard-${Date.now()}-${i}.${ext}`, {
            type: imageType,
          });
          files.push(file);
        } catch (err) {
          console.error('Failed to process clipboard item:', 'item=', item, 'error=', err);
          alerts.display(
            AlertsLevel.Error,
            m.Picker_ClipboardPasteButton_FailedToProcessClipboardItem({
              error: err instanceof Error ? err.message : String(err),
              index: i + 1,
            }),
          );
        } finally {
          state.ready++;
        }
      }
      state.ready++;

      if (files.length === 0) {
        alerts.display(AlertsLevel.Warning, m.Picker_ClipboardPasteButton_NoImagesFound());
        return;
      }

      onFiles(files);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        alerts.display(AlertsLevel.Error, m.Picker_ClipboardPasteButton_NotAllowedError());
      } else {
        console.error('Failed to read clipboard:', 'error=', err);
        alerts.display(
          AlertsLevel.Error,
          m.Picker_ClipboardPasteButton_Error({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } finally {
      progressBar.remove(task);
    }
  }
</script>

{#if isSupported}
  <Button onclick={pasteFromClipboard} disabled={disabled || progressBar.display}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      viewBox="0 0 16 16"
    >
      <path
        d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"
      />
      <path
        d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"
      />
    </svg>
    {m.Picker_ClipboardPasteButton_Text()}
  </Button>
{/if}
