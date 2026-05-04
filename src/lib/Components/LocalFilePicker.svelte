<script lang="ts">
  import DirectoryPickerButton from '$lib/Components/FilePicker/DirectoryPickerButton.svelte';
  import DragAndDropHandler from '$lib/Components/FilePicker/DragAndDropHandler.svelte';
  import ClipboardPasteButton from '$lib/Components/FilePicker/ClipboardPasteButton.svelte';
  import ZipArchivePickerButton from '$lib/Components/FilePicker/ZipArchivePickerButton.svelte';
  import ImagesPickerButton from '$lib/Components/FilePicker/ImagesPickerButton.svelte';
  import ClipboardPasteHandler from '$lib/Components/FilePicker/ClipboardPasteHandler.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { AlertsLevel, AlertsState } from '$lib/States/AlertsState.svelte';
  import { ProgressBarState } from '$lib/States/ProgressBarState.svelte';
  import { FileTypes } from '$lib/FileTypes';
  import { WorkerZipArchiveReader } from '$lib/ZipArchiveReader/WorkerZipArchiveReader';
  import type {
    ZipArchiveReaderErrorEvent,
    ZipArchiveReaderEvent,
    ZipArchiveReaderFileEvent,
  } from '$lib/ZipArchiveReader/ZipArchiveReaderEvent';
  import { AsyncZipArchiveReader } from '$lib/ZipArchiveReader/AsyncZipArchiveReader';
  import pLimit from 'p-limit';
  import { ImageFile } from '$lib/ImageFile';
  import WebShareTargetHandler from '$lib/Components/FilePicker/WebShareTargetHandler.svelte';
  import { browser } from '$app/environment';
  import { Analytics } from '$lib/Analytics';
  import { markTrace, measureTrace } from '$lib/utils/performanceTrace';

  interface Props {
    onImages: (images: ImageFile[]) => void;
    disabled?: boolean;
    onSourceSelected?: () => void;
  }

  const alerts = AlertsState.use();
  const progressBar = ProgressBarState.use();
  const { onImages, disabled = false, onSourceSelected = () => undefined }: Props = $props();
  const queue = pLimit(browser ? (navigator?.hardwareConcurrency ?? 4) : 1);
  let sourceSelected = false;

  function notifySourceSelected() {
    if (disabled || sourceSelected) {
      return;
    }

    sourceSelected = true;
    onSourceSelected();
  }

  async function handleFiles(files: File[]) {
    if (disabled) {
      return;
    }

    notifySourceSelected();

    if (files.length === 0) {
      alerts.display(AlertsLevel.Warning, m.Picker_LocalFilePicker_NoFilesSelected());
      return;
    }

    const state = $state({ total: 1, ready: 0 });
    const task = () => state;
    progressBar.add(task);
    markTrace('upload:start');

    try {
      const filesPromises = files.map(async (file) => {
        if (FileTypes.isZipArchive(file)) {
          return queue(() => extractZipArchive(file));
        } else {
          return file;
        }
      });

      await Promise.all(filesPromises)
        .then(async (results) => {
          const images = results.flat().filter((file) => {
            if (file.name.startsWith('.') || file.name.includes('/.')) {
              // Ignore hidden files and files in hidden directories
              return false;
            }

            if (!file.type.startsWith('image/')) {
              // Ignore non-image files
              alerts.display(
                AlertsLevel.Error,
                m.Picker_LocalFilePicker_ErrorInvalidFileType({
                  name: file.name,
                  type: file.type,
                }),
              );
              return false;
            }

            return true;
          });

          state.total = images.length;

          const imageFiles = await Promise.all(
            images.map(async (file) => {
              try {
                const image = await ImageFile.fromFile(file);
                return image;
              } catch (err) {
                alerts.display(
                  AlertsLevel.Error,
                  m.Picker_LocalFilePicker_ErrorImageLoadingFailed({
                    name: file.name,
                    error: err instanceof Error ? err.message : String(err),
                  }),
                );
                return null;
              } finally {
                state.ready++;
              }
            }),
          );

          onImages(imageFiles.filter((i) => !!i));
        })
        .catch((error) => {
          alerts.display(
            AlertsLevel.Error,
            m.Picker_LocalFilePicker_ErrorProcessingFiles({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
    } finally {
      markTrace('upload:end');
      measureTrace('upload', 'upload:start', 'upload:end');
      progressBar.remove(task);
    }
  }

  function isResultEvent(result: ZipArchiveReaderEvent): result is ZipArchiveReaderFileEvent {
    return 'file' in result;
  }

  function isErrorEvent(result: ZipArchiveReaderEvent): result is ZipArchiveReaderErrorEvent {
    return 'error' in result;
  }

  async function extractZipArchive(file: File): Promise<File[]> {
    const state = $state({ total: 1, ready: 0 });
    const task = () => state;
    progressBar.add(task);

    const reader =
      typeof Worker === 'undefined' ? new AsyncZipArchiveReader() : new WorkerZipArchiveReader();

    try {
      const unzipped: File[] = [];
      for await (const event of reader.read(file)) {
        state.total = event.total + 1; // number of files in archive + 1 for the archive itself
        state.ready = event.ready;

        if (isResultEvent(event)) {
          unzipped.push(event.file);
        } else if (isErrorEvent(event)) {
          alerts.display(
            AlertsLevel.Error,
            m.Picker_LocalFilePicker_ErrorUnzippingFile({
              error: event.error,
              name: event.filename,
            }),
          );
        }
      }
      state.ready++;
      return unzipped;
    } finally {
      progressBar.remove(task);
    }
  }
</script>

<section>
  <h1>{m.Picker_LocalFilePicker_Header()}</h1>

  <div onclickcapture={notifySourceSelected}>
    <ImagesPickerButton
      {disabled}
      onFiles={Analytics.trackUpload('ImagesPickerButton', handleFiles)}
    />
    <DirectoryPickerButton
      {disabled}
      onFiles={Analytics.trackUpload('DirectoryPickerButton', handleFiles)}
    />
    <ZipArchivePickerButton
      {disabled}
      onFiles={Analytics.trackUpload('ZipArchivePickerButton', handleFiles)}
    />
    <ClipboardPasteButton
      {disabled}
      onFiles={Analytics.trackUpload('ClipboardPasteButton', handleFiles)}
    />
    <ClipboardPasteHandler
      {disabled}
      onSourceSelected={notifySourceSelected}
      onFiles={Analytics.trackUpload('ClipboardPasteHandler', handleFiles)}
    />
    <DragAndDropHandler
      {disabled}
      onSourceSelected={notifySourceSelected}
      onFiles={Analytics.trackUpload('DragAndDropHandler', handleFiles)}
    />
    <WebShareTargetHandler
      {disabled}
      onSourceSelected={notifySourceSelected}
      onFiles={Analytics.trackUpload('WebShareTargetHandler', handleFiles)}
    />
  </div>
</section>

<style lang="scss">
  h1 {
    text-align: center;
    margin-top: 0;
  }

  div {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5em;
    justify-content: center;
  }
</style>
