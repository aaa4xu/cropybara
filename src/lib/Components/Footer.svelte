<script lang="ts">
  import LocaleSwitcher from '$lib/Components/LocaleSwitcher.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime';

  const commitUrl = `https://github.com/aaa4xu/cropybara/commit/${__BUILD_GIT_HASH__}`;
</script>

<footer>
  <div class="footer-links">
    <a href="https://github.com/aaa4xu/cropybara" target="_blank">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
        />
      </svg>

      {m.UploadImagesScreen_SourceCodeLink_Text()}
    </a>

    {#if getLocale() === 'ru'}
      <a href="https://t.me/cropybara" target="_blank">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path
            d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"
          />
        </svg>

        Новости проекта
      </a>
    {/if}

    <LocaleSwitcher />
  </div>

  <div class="build-metadata">
    <span>{m.Footer_BuildMetadata()}</span>
    <a href={commitUrl} target="_blank" rel="noreferrer">{__BUILD_GIT_HASH__}</a>
  </div>
</footer>

<style lang="scss">
  footer {
    display: flex;
    align-items: center;
    flex-direction: column;
    flex-wrap: wrap;
    gap: 0.5em;
    justify-content: center;
  }

  .footer-links {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1em;
    justify-content: center;
  }

  .build-metadata {
    display: flex;
    align-items: center;
    gap: 0.4em;
    color: var(--color-text-muted);

    a {
      color: var(--color-text-muted);

      &:hover,
      &:focus {
        color: var(--color-text-active);
      }
    }
  }
</style>
