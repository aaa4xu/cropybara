<script lang="ts">
  import Button from '$lib/Components/Button.svelte';

  // https://web.dev/learn/pwa/installation-prompt#gathering_analytics
  type BeforeInstallPromptEvent = Event & {
    prompt(): void;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };

  type WindowWithDeferredInstallPrompt = Window & {
    deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  };

  let installPrompt: BeforeInstallPromptEvent | null = $state(null);

  $effect(() => {
    if (installPrompt) return;

    const w = window as WindowWithDeferredInstallPrompt;

    if (w.deferredInstallPrompt instanceof Event) {
      installPrompt = w.deferredInstallPrompt;
      return;
    }

    const intervalId = setInterval(() => {
      if (w.deferredInstallPrompt instanceof Event) {
        installPrompt = w.deferredInstallPrompt;
        w.deferredInstallPrompt = null;
        clearInterval(intervalId);
      }
    }, 250);

    return () => clearInterval(intervalId);
  });

  async function install() {
    if (!installPrompt) return;

    installPrompt.prompt();

    // Find out whether the user confirmed the installation or not
    const { outcome } = await installPrompt.userChoice;
    // The deferredPrompt can only be used once.
    installPrompt = null;

    // Act on the user's choice
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt.');
    } else if (outcome === 'dismissed') {
      console.log('User dismissed the install prompt');
    }
  }
</script>

<section>
  {#if installPrompt}
    <Button onclick={install}>
      <img src="images/icon-128px.png" alt="Cropybara logo" />
      Install app
    </Button>
  {/if}
</section>

<style lang="scss">
  img {
    width: 1.5em;
    height: 1.5em;
  }

  section {
    text-align: center;
    height: 2.5em;
    display: none;
  }

  @media (display-mode: browser) {
    section {
      display: block;
    }
  }
</style>
