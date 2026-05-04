<script lang="ts">
  import UploadImagesScreen from '$lib/Screens/UploadImagesScreen.svelte';
  import { ImageFile } from '$lib/ImageFile';
  import ConfigScreen from '$lib/Screens/ConfigScreen.svelte';
  import EditorScreen from '$lib/Screens/EditorScreen.svelte';
  import { AsyncImageResizer } from '$lib/ImageResizer/AsyncImageResizer';
  import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
  import { AlertsLevel, AlertsState } from '$lib/States/AlertsState.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { ZipEntriesSinkFactory } from '$lib/ImageSaver/ZipEntriesSink';
  import { ZipEntriesWithFSImageSaver } from '$lib/ImageSaver/ZipEntriesWithFSImageSaver';
  import { ZipEntriesWithStreamsaverImageSaver } from '$lib/ImageSaver/ZipEntriesWithStreamsaverImageSaver';
  import { ImageOutputFormatRegistry } from '$lib/ImageOutputFormat';
  import { Analytics } from '$lib/Analytics';
  import {
    ConfigDenoiser,
    ConfigDetector,
    type ConfigState,
    ConfigUnwatermark,
  } from '$lib/ConfigState';
  import { PixelComparisonDetector } from '$lib/Detectors/PixelComparisonDetector';
  import { UnjpegDenoiser } from '$lib/Denoiser/UnjpegDenoiser';
  import { browser } from '$app/environment';
  import type { Denoiser } from '$lib/Denoiser/Denoiser';
  import { Unwatermarker } from '$lib/Denoiser/Unwatermarker';
  import { isONNXRuntimeLoadError } from '$lib/Denoiser/errors';
  import { DOM_EXCEPTION_NAMES, hasDomExceptionName } from '$lib/utils/domException';
  import { loadAcqqWatermark } from '$lib/Watermarks/loadAcqqWatermark';
  import { onDestroy } from 'svelte';
  import { markTrace, measureTrace } from '$lib/utils/performanceTrace';
  import {
    SaveConcurrency,
    SaveResultExporter,
    SaveResultService,
    SlicePlanFactory,
    WorkerSliceEncoderPool,
  } from '$lib/SavePipeline';

  let images: ImageFile[] = $state([]);
  let config: ConfigState | null = $state(null);
  let cutsInit: number[] = $state([]);
  const progressBar = ProgressBarState.use();
  const alerts = AlertsState.use();
  let denoiserPromise: Promise<unknown> | null = $state(null);

  let widths = $derived(
    Object.entries(
      images.reduce(
        (acc, image) => {
          if (!(image.width in acc)) acc[image.width] = [];
          acc[image.width].push(image.name);
          return acc;
        },
        {} as Record<number, string[]>,
      ),
    )
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([k, v]) => [parseInt(k, 10), v] as [number, string[]]),
  );
  let height = $derived(images.reduce((acc, image) => acc + image.height, 0));

  function releaseImages(items: Iterable<ImageFile>) {
    for (const image of items) {
      image.releaseImage();
    }
  }

  function handleCancel() {
    releaseImages(images);
    images = [];
    cutsInit = [];
    config = null;
  }

  function displayDenoiserError(imageName: string, err: unknown) {
    if (!imageName || isONNXRuntimeLoadError(err)) {
      alerts.display(
        AlertsLevel.Error,
        m.ConfigScreen_DenoiserRuntimeError({
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return;
    }

    alerts.display(AlertsLevel.Error, m.ConfigScreen_DenoiserError({ name: imageName }));
  }

  async function handleConfig(cfg: ConfigState) {
    markTrace('process:start');
    try {
      await processConfig(cfg);
    } finally {
      markTrace('process:end');
      measureTrace('process', 'process:start', 'process:end');
    }
  }

  async function processConfig(cfg: ConfigState) {
    const outliers = images.filter((image) => image.width !== widths[0][0]);

    if (outliers.length > 0) {
      const resizer = new AsyncImageResizer();
      const controller = new AbortController();
      let resizeErrorDisplayed = false;

      const state = $state({ total: outliers.length, ready: 0 });
      const task = () => state;
      progressBar.add(task);

      try {
        await Promise.all(
          outliers.map(async (image) => {
            try {
              const index = images.indexOf(image);
              const resized = await resizer.resize(image, widths[0][0], controller.signal);
              images[index] = resized;
              image.releaseImage();
            } catch (err) {
              if (!resizeErrorDisplayed) {
                console.error(`Failed to resize image ${image.name}`, err);
                alerts.display(
                  AlertsLevel.Error,
                  m.ConfigScreen_ResizeError({
                    name: image.name,
                    error: err instanceof Error ? err.message : String(err),
                  }),
                );
                resizeErrorDisplayed = true;
              }
              throw err;
            } finally {
              state.ready++;
            }
          }),
        );
      } catch {
        controller.abort();
        return;
      } finally {
        progressBar.remove(task);
      }
    }

    if (cfg.unwatermark === ConfigUnwatermark.ACQQ) {
      let watermarkImage: ImageFile;
      try {
        watermarkImage = await loadAcqqWatermark(widths[0][0]);
      } catch (err) {
        console.error('Failed to load watermark', err);
        alerts.display(
          AlertsLevel.Error,
          m.ConfigScreen_UnwatermarkError({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        return;
      }

      const unwatermark = new Unwatermarker({
        watermark: watermarkImage,
        left: -220,
        top: -80,
      });

      const state = $state({ total: images.length, ready: 0 });
      const task = () => state;
      progressBar.add(task);

      // Watermarks should be removed before processing by cut's detector
      await Promise.all(
        images.map(async (image, index) => {
          try {
            const processed = await unwatermark.process(image);
            images[index] = processed;
            image.releaseImage();
          } catch (err) {
            console.error(`Failed to process image ${image.name}`, err);
            alerts.display(AlertsLevel.Error, m.ConfigScreen_DenoiserError({ name: image.name }));
          } finally {
            state.ready++;
          }
        }),
      ).finally(() => {
        progressBar.remove(task);
        watermarkImage.releaseImage();
      });
    }

    let denoiser: Denoiser | null = null;

    if (cfg.denoiser === ConfigDenoiser.Unjpeg) {
      denoiser = new UnjpegDenoiser(
        (browser && localStorage.unjpegEndpoint) || 'https://denoiser.cropybara.app/',
      );
    }

    if (cfg.denoiser === ConfigDenoiser.ManhwaNullONNX) {
      try {
        const { ONNXDenoiser } = await import('$lib/Denoiser/ONNXDenoiser');
        denoiser = new ONNXDenoiser('/models/1x_manhwa_null/1x_manhwa_null.with_runtime_opt.ort');
      } catch (err) {
        console.error('Failed to initialize ONNX denoiser', err);
        displayDenoiserError('', err);
      }
    }

    if (denoiser) {
      const state = $state({ total: images.length, ready: 0 });
      const task = () => state;
      progressBar.add(task);
      let runtimeErrorDisplayed = false;
      denoiserPromise = Promise.all(
        images.map(async (image, index) => {
          try {
            const processed = await denoiser.process(image);
            images[index] = processed;
            image.releaseImage();
          } catch (err) {
            console.error(`Failed to process image ${image.name}`, err);
            if (!runtimeErrorDisplayed || !isONNXRuntimeLoadError(err)) {
              displayDenoiserError(image.name, err);
            }
            runtimeErrorDisplayed ||= isONNXRuntimeLoadError(err);
          } finally {
            state.ready++;
          }
        }),
      )
        .catch((err) => {
          console.error('Denoiser failed', err);
          displayDenoiserError('', err);
        })
        .finally(() => {
          progressBar.remove(task);
          denoiserPromise = null;
        });
    }

    if (cfg.detector === ConfigDetector.PixelComparison) {
      const state = $state({ total: 1, ready: 0 });
      const task = () => state;
      progressBar.add(task);
      const start = Date.now();

      try {
        cutsInit = await PixelComparisonDetector.process(images, {
          margins: cfg.margins,
          maxDistance: cfg.limit,
          step: cfg.step,
          sensitivity: cfg.sensitivity / 100,
          maxSearchDeviationFactor: 0.5,
        });
      } catch (err) {
        console.error(`Failed to process images`, err);
      } finally {
        progressBar.remove(task);
      }
      console.log('Done!', 'Duration=', Date.now() - start, cutsInit);
    }

    config = cfg;
  }

  async function handleCuts(cuts: ReadonlyArray<number>) {
    if (!config) return;

    if (denoiserPromise) {
      alerts.display(AlertsLevel.Info, m.ConfigScreen_DenoiserInProgress());
      return;
    }

    markTrace('save:start');
    const controller = new AbortController();

    /* (cuts + 1) + 1 for the zip file */
    let task = $state({ total: cuts.length + 1 + 1, ready: 0 });
    const getter = () => task;
    progressBar.add(getter);

    const onProgress = () => {
      task.ready += 1;
      console.log('Progress:', task.ready, '/', task.total);
    };

    const encoder = { current: null as WorkerSliceEncoderPool | null };
    try {
      if (!WorkerSliceEncoderPool.isSupported) {
        throw new Error('Worker slice encoding is not supported by this browser.');
      }

      const sinkFactory: ZipEntriesSinkFactory = ZipEntriesWithFSImageSaver.isSupported
        ? new ZipEntriesWithFSImageSaver()
        : new ZipEntriesWithStreamsaverImageSaver();

      const planner = new SlicePlanFactory();
      const output = ImageOutputFormatRegistry.normalizeOptions(config.output);
      const exporter = new SaveResultExporter(sinkFactory, async () => {
        markTrace('save:write:start');
        performance.mark('slicingStart');

        const concurrency = SaveConcurrency.detect();
        const sources = planner.createSources(images);
        encoder.current = await WorkerSliceEncoderPool.create({
          sources,
          workers: concurrency,
          output,
        });

        return new SaveResultService(planner, encoder.current, concurrency, output);
      });

      await exporter.save({
        name: config.name,
        images,
        cuts,
        signal: controller.signal,
        onProgress,
      });

      performance.mark('slicingFinish');
      const slicingMeasure = performance.measure(
        'slicingDuration',
        'slicingStart',
        'slicingFinish',
      );
      markTrace('save:write:end');
      measureTrace('save:write', 'save:write:start', 'save:write:end');
      console.debug(slicingMeasure.duration);
      alerts.display(AlertsLevel.Success, m.Done());
      Analytics.trackScreen('ResultScreen');
    } catch (err) {
      console.error(err);
      if (hasDomExceptionName(err, DOM_EXCEPTION_NAMES.NoModificationAllowed)) {
        alerts.display(AlertsLevel.Error, m.EditorScreen_SaverLocationNotWritable());
      } else {
        alerts.display(AlertsLevel.Error, m.EditorScreen_SaverError());
      }
    } finally {
      encoder.current?.terminate();
      markTrace('save:end');
      measureTrace('save', 'save:start', 'save:end');
      progressBar.remove(getter);
    }
  }

  onDestroy(() => {
    releaseImages(images);
  });
</script>

{#if images.length === 0}
  <UploadImagesScreen onImages={(i) => (images = i)} />
{:else if !config}
  <ConfigScreen {widths} {height} onCancel={handleCancel} onSubmit={handleConfig} />
{:else}
  <EditorScreen
    {images}
    {cutsInit}
    limit={config.limit}
    onCancel={handleCancel}
    onSubmit={handleCuts}
  />
{/if}
