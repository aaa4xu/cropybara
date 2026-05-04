<script lang="ts">
  import { onMount } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Props = Omit<HTMLInputAttributes, 'type'> & {
    onFiles: (files: File[]) => void | Promise<void>;
  };

  const { onFiles, onchange, ...rest }: Props = $props();
  let input: HTMLInputElement;
  let processingFiles: Promise<void> | null = null;

  function processSelectedFiles(target: HTMLInputElement) {
    if (processingFiles) {
      return processingFiles;
    }

    const files = target.files;
    if (!files) {
      return Promise.resolve();
    }

    processingFiles = (async () => {
      try {
        await onFiles(Array.from(files));
      } finally {
        target.value = '';
        processingFiles = null;
      }
    })();

    return processingFiles;
  }

  async function handleFiles(event: Event & { currentTarget: HTMLInputElement }) {
    if (onchange) {
      onchange(event);
    }

    await processSelectedFiles(event.currentTarget);
  }

  onMount(() => {
    if (input.files?.length) {
      void processSelectedFiles(input);
    }
  });
</script>

<input bind:this={input} type="file" {...rest} onchange={handleFiles} />

<style>
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap; /* Added line */
    border-width: 0;
  }
</style>
