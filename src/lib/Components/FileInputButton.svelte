<script lang="ts">
  import FileInput from '$lib/Components/FileInput.svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Props = Omit<HTMLInputAttributes, 'type'> & {
    onFiles: (files: File[]) => void | Promise<void>;
    children: Snippet;
  };

  const { children, disabled, ...rest }: Props = $props();
</script>

<label class:disabled>
  {@render children()}
  <FileInput {disabled} {...rest} />
</label>

<style lang="scss">
  @use '../../style/mixins.scss';

  label {
    @include mixins.button;
  }
</style>
