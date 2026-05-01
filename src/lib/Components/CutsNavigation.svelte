<script lang="ts">
  const {
    onNextClick,
    onPrevClick,
    current,
    total,
  }: {
    onPrevClick: () => void;
    onNextClick: () => void;
    current: number;
    total: number;
  } = $props();
</script>

<section>
  <button class="prev" aria-label="Prev" onclick={onPrevClick}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="bi bi-chevron-left"
      viewBox="0 0 16 16"
    >
      <path
        fill-rule="evenodd"
        d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"
      />
    </svg>
  </button>

  <div class="editor-control-value">
    {current}&nbsp;/&nbsp;{total}
  </div>

  <button class="next" aria-label="Next" onclick={onNextClick}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="bi bi-chevron-right"
      viewBox="0 0 16 16"
    >
      <path
        fill-rule="evenodd"
        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"
      />
    </svg>
  </button>
</section>

<style lang="scss">
  @use '../../style/mixins.scss';

  section {
    bottom: 3rem;
    @include mixins.editor-control;
  }
</style>
