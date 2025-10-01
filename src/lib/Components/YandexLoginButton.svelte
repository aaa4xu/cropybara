<script lang="ts">
  import * as env from '$env/static/public';

  const clientId =
    'PUBLIC_YANDEX_OAUTH_CLIENT_ID' in env &&
    typeof env.PUBLIC_YANDEX_OAUTH_CLIENT_ID === 'string' &&
    env.PUBLIC_YANDEX_OAUTH_CLIENT_ID;

  const redirectUri =
    'PUBLIC_YANDEX_OAUTH_REDIRECT_URI' in env &&
    typeof env.PUBLIC_YANDEX_OAUTH_REDIRECT_URI === 'string' &&
    env.PUBLIC_YANDEX_OAUTH_REDIRECT_URI;

  const { disabled }: { disabled: boolean } = $props();
</script>

{#if clientId && redirectUri}
  <a
    href="https://oauth.yandex.ru/authorize?response_type=token&client_id={clientId}&redirect_uri={redirectUri}"
    class:disabled
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="2.429300308227539 10.662266731262207 43.65679931640625 23.41653347015381"
      fill="currentColor"
      ><defs
        ><style>
          .c {
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
        </style></defs
      ><ellipse
        class="c"
        cx="25.4155"
        cy="28.0413"
        rx="10.0649"
        ry="3.6455"
        transform="translate(-9.2264 12.8033) rotate(-24.0687)"
      /><ellipse
        class="c"
        cx="24.2577"
        cy="25.4491"
        rx="21.8284"
        ry="8.6297"
        transform="translate(-8.2699 12.1057) rotate(-24.0687)"
      /><path
        class="c"
        d="m4.1502,33.8583c-2.3092-5.773,2.0897-8.1645,4.5041-11.5885,3.4313-4.8662,2.4988-7.9099,9.6744-10.6114,6.6775-2.514,8.6175.5426,13.2841.3833,4.4995-.1536,8.2884-.538,11.9141,3.5172"
      /></svg
    >
    Яндекс Диск</a
  >
{/if}

<style lang="scss">
  @use '../../style/mixins.scss';

  a {
    @include mixins.button;
  }
</style>
