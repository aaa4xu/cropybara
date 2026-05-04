<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import LabeledInput from '$lib/Components/LabeledInput.svelte';
  import Button from '$lib/Components/Button.svelte';
  import LabeledCheckbox from '$lib/Components/LabeledCheckbox.svelte';
  import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
  import { onMount } from 'svelte';
  import { Analytics } from '$lib/Analytics';
  import LabeledSelect from '$lib/Components/LabeledSelect.svelte';
  import { BrowserImageOutputFormatSupport } from '$lib/BrowserImageOutputFormatSupport';
  import {
    ConfigDenoiser,
    ConfigDetector,
    type ConfigState,
    ConfigUnwatermark,
  } from '$lib/ConfigState';
  import {
    DEFAULT_IMAGE_OUTPUT_FORMAT,
    DEFAULT_IMAGE_OUTPUT_QUALITY,
    ImageOutputFormat,
    ImageOutputFormatRegistry,
    type SupportedImageOutputFormat,
  } from '$lib/ImageOutputFormat';
  import { OnlineState } from '$lib/States/OnlineState.svelte';
  import { AlertsLevel, AlertsState } from '$lib/States/AlertsState.svelte';
  import { getLocale } from '$lib/paraglide/runtime';
  import { MIN_CUT_DISTANCE } from '$lib/States/CutsState.svelte';

  type Props = {
    widths: Array<[number, string[]]>;
    height: number;
    onCancel: () => void;
    onSubmit: (options: ConfigState) => void;
  };

  const { onCancel, onSubmit, widths, height }: Props = $props();
  const progressBar = ProgressBarState.use();
  const online = OnlineState.use();
  const alerts = AlertsState.use();
  const minHeightLimit = MIN_CUT_DISTANCE + 1;
  let name = $state(`cropybara-${Math.round(Date.now() / 1000)}`);
  let outputFormat: ImageOutputFormat = $state(DEFAULT_IMAGE_OUTPUT_FORMAT);
  let outputQuality = $state(DEFAULT_IMAGE_OUTPUT_QUALITY);
  let supportedOutputFormats = $state<readonly SupportedImageOutputFormat[]>(
    ImageOutputFormatRegistry.defaultSupported,
  );
  let limit = $state(20_000);
  let forceWidth = $state(false);
  let unwatermark = $state(ConfigUnwatermark.Off);

  let denoiser: ConfigDenoiser = $state(ConfigDenoiser.Off);

  let detectors = [ConfigDetector.Manual, ConfigDetector.PixelComparison];
  let detectorType: ConfigDetector = $state(ConfigDetector.PixelComparison);
  let pcDetectorSensitivity = $state(90);
  let pcDetectorStep = $state(5);
  let pcDetectorMargin = $state(5);

  function handleReset(e: Event) {
    e.preventDefault();
    onCancel();
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    const selectedOutputFormat = getSelectedOutputFormat();

    if (!Number.isFinite(limit) || limit < minHeightLimit) {
      alerts.display(
        AlertsLevel.Error,
        m.ConfigScreen_HeightLimit_MinError({ min: minHeightLimit }),
      );
      return;
    }

    if (!selectedOutputFormat) {
      outputFormat = DEFAULT_IMAGE_OUTPUT_FORMAT;
      return;
    }

    if (
      selectedOutputFormat.supportsQuality &&
      (!Number.isFinite(outputQuality) || outputQuality < 1 || outputQuality > 100)
    ) {
      alerts.display(AlertsLevel.Error, m.ConfigScreen_OutputQuality_RangeError());
      return;
    }

    if (denoiser !== ConfigDenoiser.Off && !online.state) {
      alerts.display(AlertsLevel.Error, m.ConfigScreen_Denoiser_Alert_Offline());
      return;
    }

    const config = {
      name,
      limit,
      output: ImageOutputFormatRegistry.normalizeOptions({
        format: outputFormat,
        quality: selectedOutputFormat.supportsQuality ? outputQuality : undefined,
      }),
      detector: detectorType,
      step: pcDetectorStep,
      sensitivity: pcDetectorSensitivity,
      margins: pcDetectorMargin,
      denoiser,
      unwatermark,
    } satisfies ConfigState;

    Analytics.trackConfig(config);
    onSubmit(config);
  }

  function getSelectedOutputFormat(): SupportedImageOutputFormat | undefined {
    return supportedOutputFormats.find((format) => format.format === outputFormat);
  }

  onMount(() => {
    Analytics.trackScreen('ConfigScreen');
    BrowserImageOutputFormatSupport.detect()
      .then((formats) => {
        supportedOutputFormats = formats;

        if (!formats.some((format) => format.format === outputFormat)) {
          outputFormat = DEFAULT_IMAGE_OUTPUT_FORMAT;
        }
      })
      .catch(() => {
        supportedOutputFormats = ImageOutputFormatRegistry.defaultSupported;
        outputFormat = DEFAULT_IMAGE_OUTPUT_FORMAT;
      });
  });
</script>

<svelte:head>
  <title>{m.ConfigScreen_Title()}</title>
</svelte:head>

<main>
  <form onreset={handleReset} onsubmit={handleSubmit}>
    <h1>{m.ConfigScreen_Header()}</h1>
    <LabeledInput bind:value={name} required autofocus
      >{m.ConfigScreen_ProjectName_Label()}</LabeledInput
    >
    <LabeledSelect bind:value={outputFormat}>
      {#snippet label()}
        {m.ConfigScreen_OutputFormat_Label()}
      {/snippet}

      {#each supportedOutputFormats as format (format.format)}
        <option value={format.format}>{format.label}</option>
      {/each}
    </LabeledSelect>
    {#if getSelectedOutputFormat()?.supportsQuality}
      <LabeledInput bind:value={outputQuality} required type="number" min={1} max={100} step={1}
        >{m.ConfigScreen_OutputQuality_Label()}</LabeledInput
      >
    {/if}
    <LabeledInput bind:value={limit} required type="number" min={minHeightLimit} max="65000">
      {#snippet bottom()}
        {m.ConfigScreen_TotalSize()}
        <span class="accent-info">{widths[0][0].toLocaleString(getLocale())}</span>
        x
        <span class="accent-info">{height.toLocaleString(getLocale())}</span> px
      {/snippet}
      {m.ConfigScreen_HeightLimit_Label()}
    </LabeledInput>

    <LabeledSelect bind:value={unwatermark}>
      {#snippet label()}
        {m.ConfigScreen_Unwatermark_Select_Label()}
      {/snippet}

      <option value={ConfigUnwatermark.Off}>{m.ConfigScreen_Unwatermark_Select_Option_Off()}</option
      >
      {#if [1200].includes(widths[0][0])}
        <option value={ConfigUnwatermark.ACQQ}>ac.qq.com</option>
      {/if}
    </LabeledSelect>

    <LabeledSelect bind:value={denoiser}>
      {#snippet label()}
        {m.ConfigScreen_Denoiser_Select_Label()}
      {/snippet}

      {#snippet bottom()}
        {#if denoiser.toLowerCase().endsWith('onnx')}
          {m.ConfigScreen_Denoiser_Select_Bottom_ONNX()}
        {/if}
      {/snippet}

      <option value={ConfigDenoiser.Off}>{m.ConfigScreen_Denoiser_Select_Option_Off()}</option>
      <option value={ConfigDenoiser.ManhwaNullONNX}
        >{m.ConfigScreen_Denoiser_Select_Option_ManhwaNullONNX()}</option
      >
    </LabeledSelect>

    <LabeledSelect bind:value={detectorType}>
      {#snippet label()}
        {m.ConfigScreen_DetectorType_Label()}
      {/snippet}

      {#each detectors as detector (detector)}
        <option value={detector}>{m[`ConfigScreen_Detector_Name_${detector}`]()}</option>
      {/each}
    </LabeledSelect>

    {#if detectorType === ConfigDetector.PixelComparison}
      <LabeledInput type="number" min={1} max={100} bind:value={pcDetectorSensitivity} required
        >{m.ConfigScreen_PCDetector_Sensitivity_Label()}</LabeledInput
      >
      <LabeledInput type="number" min={1} bind:value={pcDetectorStep} required
        >{m.ConfigScreen_PCDetector_Step_Label()}</LabeledInput
      >
      <LabeledInput
        type="number"
        min={0}
        max={Math.floor(widths[0][0] / 2)}
        required
        bind:value={pcDetectorMargin}>{m.ConfigScreen_PCDetector_Margins_Label()}</LabeledInput
      >
    {/if}

    {#if widths.length > 1}
      <div class="force-width-notice" role="alert">
        {m.ConfigScreen_ForceWithNotice_Description({
          length: widths[0][1].length,
          width: widths[0][0],
        })}: {widths
          .slice(1)
          .map(([width, files]) =>
            m.ConfigScreen_ForceWithNotice_Exception({ length: files.length, width }),
          )
          .join(', ')}.

        <LabeledCheckbox bind:checked={forceWidth}
          >{m.ConfigScreen_ForceWithNotice_Checkbox_Label({ width: widths[0][0] })}</LabeledCheckbox
        >
      </div>
    {/if}

    <div class="controls">
      <Button type="submit" disabled={!(widths.length === 1 || forceWidth) || progressBar.display}
        >{m.ConfigScreen_SubmitButton_Text()}</Button
      >
      <Button type="reset" disabled={progressBar.display}
        >{m.ConfigScreen_CancelButton_Text()}</Button
      >
    </div>
  </form>
</main>

<style lang="scss">
  main {
    padding: 0 1em;
    margin: 0 auto;
    max-width: 600px;
  }

  h1 {
    text-align: center;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .controls {
    display: flex;
    flex-direction: row-reverse;
    justify-content: space-between;
  }

  .force-width-notice {
    color: #b07777;
    background-color: rgba(255, 0, 0, 0.05);
    border: 1px solid rgba(255, 0, 0, 0.25);
    padding: 1em;
    border-radius: var(--input-border-radius);
  }

  .accent-info {
    color: var(--color-text-active);
  }
</style>
