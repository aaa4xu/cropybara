<script lang="ts">
  import type { ImageFile } from '$lib/ImageFile';
  import Scroll from '$lib/Components/Scroll.svelte';
  import { onMount } from 'svelte';
  import { CutsState, MIN_CUT_DISTANCE } from '$lib/States/CutsState.svelte';
  import Cuts from '$lib/Components/Cuts.svelte';
  import { Analytics } from '$lib/Analytics';
  import { m } from '$lib/paraglide/messages.js';
  import CutsNavigation from '$lib/Components/CutsNavigation.svelte';
  import ZoomControl from '$lib/Components/ZoomControl.svelte';

  type Props = {
    images: ReadonlyArray<ImageFile>;
    limit: number;
    onCancel: () => void;
    onSubmit: (cuts: ReadonlyArray<number>) => void;
    cutsInit: number[];
  };
  const { images, limit, onCancel, onSubmit, cutsInit }: Props = $props();
  const height = $derived(images.reduce((acc, img) => acc + img.height, 0));
  /* svelte-ignore state_referenced_locally */
  const cuts = new CutsState(MIN_CUT_DISTANCE, limit, height, 1, cutsInit);
  // Width of the image
  const imagesWidth = $derived(images.length > 0 ? images[0].width : 0);

  let windowHeight = $state(0);
  let windowWidth = $state(0);

  let forcedZoom = $state(-1);
  const baseZoom = $derived(imagesWidth > 0 ? Math.min(1, windowWidth / imagesWidth) : 1);
  // Current zoom level
  let zoom = $derived(forcedZoom > 0 ? forcedZoom : baseZoom);
  let displayWidth = $derived(imagesWidth * zoom);
  // Current scroll position
  let scrollY = $state(0);
  let isProgrammaticScroll = $state(false);

  // Function to programmatically set scrollY
  function setScrollYProgrammatically(newY: number) {
    const roundedNewY = Math.round(newY);
    if (scrollY === roundedNewY) return;

    isProgrammaticScroll = true;
    scrollY = roundedNewY;
    window.scrollTo(0, roundedNewY);

    // Reset the flag after the browser has likely processed the event
    // Use requestAnimationFrame for greater reliability
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isProgrammaticScroll = false;
      });
    });
  }

  const currentCutIndex = $derived.by(() => {
    if (zoom === 0 || windowHeight === 0 || cuts.cuts.length === 0) return 0;
    const pos = scrollY / zoom + windowHeight / (2 * zoom);
    return cuts.cuts.map((p, i) => [Math.abs(p - pos), i]).sort(([a], [b]) => a - b)[0][1];
  });

  function calculateClampedScrollY(targetContentY: number, currentZoom: number): number {
    if (currentZoom <= 0.001) currentZoom = 0.001;
    if (windowHeight === 0) return 0; // Не можем рассчитать центр

    let idealScrollY = targetContentY * currentZoom - windowHeight / 2;

    const maxScrollY = Math.max(0, height * currentZoom - windowHeight);
    const minScrollY = 0;

    return Math.max(minScrollY, Math.min(idealScrollY, maxScrollY));
  }

  function prevCut() {
    if (zoom === 0) return;
    const prevCutPos = cuts.cuts[Math.max(0, currentCutIndex - 1)];
    setScrollYProgrammatically(calculateClampedScrollY(prevCutPos, zoom));
  }

  function nextCut() {
    if (zoom === 0) return;
    const nextCutPos = cuts.cuts[Math.min(cuts.cuts.length - 1, currentCutIndex + 1)];
    setScrollYProgrammatically(calculateClampedScrollY(nextCutPos, zoom));
  }

  function setZoomKeepingCenter(newForcedZoomValue: number) {
    if (windowHeight === 0 || imagesWidth === 0) {
      forcedZoom = newForcedZoomValue;
      return;
    }
    if (Math.abs(zoom) < 0.0001 && newForcedZoomValue !== -1) {
      forcedZoom = newForcedZoomValue;
      return;
    }

    // Use current scrollY and zoom to determine the point in the center
    const currentContentYAtScreenCenter = scrollY / zoom + windowHeight / (2 * zoom);

    let newActualZoom: number;
    if (newForcedZoomValue > 0) {
      newActualZoom = newForcedZoomValue;
    } else {
      newActualZoom = baseZoom;
    }
    if (newActualZoom <= 0.001) newActualZoom = 0.001;

    let idealNewScrollY = currentContentYAtScreenCenter * newActualZoom - windowHeight / 2;

    const maxScrollYForNewZoom = Math.max(0, height * newActualZoom - windowHeight);
    const minScrollYForNewZoom = 0;
    const newClampedScrollY = Math.round(
      Math.max(minScrollYForNewZoom, Math.min(idealNewScrollY, maxScrollYForNewZoom)),
    );

    forcedZoom = newForcedZoomValue;
    setScrollYProgrammatically(newClampedScrollY);
  }

  function handleZoomIn() {
    setZoomKeepingCenter(zoom * 1.2);
  }

  function handleZoomOut() {
    setZoomKeepingCenter(zoom * 0.85);
  }

  function handleReset() {
    setZoomKeepingCenter(-1);
  }

  function handleWindowScroll() {
    if (isProgrammaticScroll) {
      return;
    }

    const currentWindowScrollY = Math.round(window.scrollY);
    if (scrollY !== currentWindowScrollY) {
      scrollY = currentWindowScrollY;
    }
  }

  onMount(() => {
    Analytics.trackScreen('EditorScreen');
    // Set the initial scrollY value if the page was reloaded with scroll
    // Wrap in Promise.resolve().then() to execute after initial rendering
    Promise.resolve().then(() => {
      scrollY = Math.round(window.scrollY);
    });

    // Update windowHeight and windowWidth on mount
    windowHeight = window.innerHeight;
    windowWidth = window.innerWidth;
  });

  function handleMouseWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();

    if (e.deltaY > 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }
</script>

<!-- Убираем bind:scrollY из svelte:window -->
<svelte:window
  bind:innerHeight={windowHeight}
  bind:innerWidth={windowWidth}
  onscroll={handleWindowScroll}
/>

<svelte:head>
  <title>{m.EditorScreen_Title()}</title>
</svelte:head>

<main onwheel={handleMouseWheel}>
  <Scroll {images} width={displayWidth} />
  <Cuts {cuts} {zoom} />

  <button class="save" aria-label="Save" onclick={() => onSubmit(cuts.cuts)}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
      <path
        d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"
      />
      <path
        d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"
      />
    </svg>
  </button>

  <button class="close" aria-label="Close" onclick={onCancel}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
      <path
        d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"
      />
    </svg>
  </button>

  <ZoomControl {zoom} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={handleReset}
  ></ZoomControl>

  <CutsNavigation
    total={cuts.cuts.length}
    current={currentCutIndex + 1}
    onPrevClick={prevCut}
    onNextClick={nextCut}
  />
</main>

<style lang="scss">
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  button {
    position: fixed;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    padding: 0;
    z-index: 2;
    border: 2px solid var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  button:hover,
  button:focus {
    background-color: var(--color-accent);
  }

  button svg {
    width: 2rem;
    height: 2rem;
  }

  .close {
    left: 2rem;
    top: var(--editor-top-offset);
  }

  .save {
    right: 2rem;
    top: var(--editor-top-offset);
  }

  .save svg {
    width: 1.2rem;
    height: 1.2rem;
  }
</style>
