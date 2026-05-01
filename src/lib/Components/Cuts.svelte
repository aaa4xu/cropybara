<script lang="ts">
  import { CutsState } from '$lib/States/CutsState.svelte';
  import { CutsEditorState } from '$lib/States/CutsEditorState.svelte';
  import Cut from '$lib/Components/Cut.svelte';

  type Props = {
    cuts: CutsState;
    zoom: number;
  };

  const { cuts, zoom }: Props = $props();
  const state = $derived(new CutsEditorState(cuts));
  let wrapperElement: HTMLElement;

  function startMoveWithMouse(index: number, e: MouseEvent) {
    state.startMove(index, e.clientY);
  }

  function startMoveWithTouch(index: number, e: TouchEvent) {
    const touch = e.touches.item(0);
    if (!touch) return;

    if (wrapperElement) {
      wrapperElement.addEventListener('touchmove', moveCutWithTouch, {
        passive: false,
      });
    }

    state.startMove(index, touch.clientY);
  }

  function finishMove() {
    if (wrapperElement) {
      wrapperElement.removeEventListener('touchmove', moveCutWithTouch);
    }
    state.finishMove();
  }

  function moveCutWithMouse(e: MouseEvent) {
    state.performMove(e.clientY, zoom);
  }

  function moveWithKeyboard(index: number, e: KeyboardEvent) {
    if (e.key === 'Tab' || e.altKey) return;
    e.preventDefault();

    const preciseMode = e.shiftKey;

    let delta = 0;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
        delta = -1 * (preciseMode ? 1 : 10);
        break;

      case 'ArrowDown':
      case 's':
        delta = 1 * (preciseMode ? 1 : 10);
        break;
    }

    if (delta !== 0) {
      state.startMove(index, 0);
      state.performMove(delta, preciseMode ? 1 : zoom);
      state.finishMove();
    }
  }

  function moveCutWithTouch(e: TouchEvent) {
    const touch = e.touches.item(0);
    if (!touch) return;
    e.preventDefault();
    state.performMove(touch.clientY, zoom);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="cuts"
  bind:this={wrapperElement}
  onmousemove={moveCutWithMouse}
  onmouseleave={finishMove}
  onmouseup={finishMove}
  ontouchend={finishMove}
  ontouchcancel={finishMove}
  role="group"
>
  {#each state.cuts as cut, i (i)}
    <Cut
      position={cut * zoom}
      prev={cut - (cuts.cuts[i - 1] || 0)}
      next={(cuts.cuts[i + 1] || cuts.height) - cut}
      onmousedown={startMoveWithMouse.bind(null, i)}
      ontouchstart={startMoveWithTouch.bind(null, i)}
      onkeydown={moveWithKeyboard.bind(null, i)}
      tabindex={i + 1}
    />
  {/each}
</div>

<style lang="scss">
  .cuts {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    user-select: none;
  }
</style>
