<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import FileInputButton from '$lib/Components/FileInputButton.svelte';
  import type { LocalFilesPickerProps } from '$lib/LocalFilesPickerProps';
  import { browser } from '$app/environment';
  import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';

  const progressBar = ProgressBarState.use();
  const isSupported = browser && 'webkitdirectory' in document.createElement('input');
  const { onFiles, disabled = false, ...rest }: LocalFilesPickerProps = $props();

  function handleFiles(files: File[]) {
    // webkitdirectory return a list of files in a directory without any kind of sorting
    files.sort((l, r) =>
      l.name.localeCompare(r.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );

    return onFiles(files);
  }
</script>

{#if isSupported}
  <FileInputButton
    webkitdirectory
    accept="application/non-existing-mime-type"
    onFiles={handleFiles}
    disabled={disabled || progressBar.display}
    {...rest}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      viewBox="0 0 16 16"
    >
      <path
        d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5zM2.5 3a.5.5 0 0 0-.5.5V6h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3zM14 7H2v5.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5z"
      />
    </svg>
    {m.Picker_DirectoryPickerButton_Text()}
  </FileInputButton>
{/if}
