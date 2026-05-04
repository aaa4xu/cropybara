<script lang="ts">
  import LocalFilePicker from '$lib/Components/LocalFilePicker.svelte';
  import Footer from '$lib/Components/Footer.svelte';
  import type { ImageFile } from '$lib/ImageFile';
  import InstallButton from '$lib/Components/InstallButton.svelte';
  import { onMount } from 'svelte';
  import { Analytics } from '$lib/Analytics';
  import { m } from '$lib/paraglide/messages.js';
  import { markTrace } from '$lib/utils/performanceTrace';
  import {
    watchReadyServiceWorkerUpdate,
    type ServiceWorkerUpdateWatcher,
  } from '$lib/ServiceWorkerUpdate';
  import { WebShareTarget } from '$lib/WebShareTarget';

  const { onImages }: { onImages: (images: ImageFile[]) => void } = $props();
  let installingUpdate = $state(false);
  let updateWatcher: ServiceWorkerUpdateWatcher | null = null;

  onMount(() => {
    Analytics.trackScreen('UploadImageScreen');
    markTrace('upload-screen:ready');

    if (WebShareTarget.isLaunch()) {
      return;
    }

    updateWatcher = watchReadyServiceWorkerUpdate({
      onReady: (event) => {
        installingUpdate = true;
        event.apply();
      },
    });

    return () => {
      updateWatcher?.stop();
    };
  });

  function handleSourceSelected() {
    if (installingUpdate) {
      return;
    }

    updateWatcher?.stop();
    updateWatcher = null;
  }
</script>

<svelte:head>
  <title>{m.UploadImagesScreen_Title()}</title>
</svelte:head>

<main>
  <header>
    <InstallButton />
  </header>
  {#if installingUpdate}
    <p class="update-status" role="status" aria-live="polite">
      {m.UploadImagesScreen_UpdateInstalling()}
    </p>
  {/if}
  <LocalFilePicker {onImages} disabled={installingUpdate} onSourceSelected={handleSourceSelected} />
  <footer>
    <Footer />
  </footer>
</main>

<style lang="scss">
  .update-status {
    text-align: center;
    margin: 0 1rem 1rem;
  }

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
