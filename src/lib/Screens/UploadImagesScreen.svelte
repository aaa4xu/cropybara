<script lang="ts">
  import LocalFilePicker from '$lib/Components/LocalFilePicker.svelte';
  import Footer from '$lib/Components/Footer.svelte';
  import type { ImageFile } from '$lib/ImageFile';
  import InstallButton from '$lib/Components/InstallButton.svelte';
  import { onMount } from 'svelte';
  import { Analytics } from '$lib/Analytics';
  import { m } from '$lib/paraglide/messages.js';
  import { markTrace } from '$lib/utils/performanceTrace';

  const { onImages }: { onImages: (images: ImageFile[]) => void } = $props();
  onMount(() => {
    Analytics.trackScreen('UploadImageScreen');
    markTrace('upload-screen:ready');
  });
</script>

<svelte:head>
  <title>{m.UploadImagesScreen_Title()}</title>
</svelte:head>

<main>
  <header>
    <InstallButton />
  </header>
  <LocalFilePicker {onImages} />
  <footer>
    <Footer />
  </footer>
</main>

<style lang="scss">
  main {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100vh;
  }

  footer {
    margin-bottom: 3em;
  }

  header {
    margin-top: 3em;
  }

  @supports (height: 100dvh) {
    /** vh unit computes the viewport size without factoring in the toolbar height */
    main {
      height: 100dvh;
    }
  }
</style>
