import type { Denoiser } from './Denoiser';
import type { ImageFile } from '$lib/ImageFile';
import { InferenceSession, Tensor, type TypedTensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';
import { Patchify } from '$lib/Patchify';
import pLimit from 'p-limit';

export class ONNXDenoiser implements Denoiser {
  protected readonly canvas = new OffscreenCanvas(256, 256);
  protected readonly dims = [1, 3, 256, 256];
  protected readonly overlap = 32;
  protected readonly queue = pLimit(1);

  public constructor(public readonly model: string) {}

  public process(file: ImageFile, signal?: AbortSignal) {
    return this.queue(async () => {
      const patchify = new Patchify(file, 256, 16);
      return this.useModel(async (session) => {
        return patchify.process(async (patch) => {
          const tensor = this.convertToTensor(patch, signal);
          return this.predict(session, tensor, signal);
        });
      });
    });
  }

  protected convertToTensor(imageData: ImageData, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const imageBufferData = imageData.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]

    const redArray: number[] = [];
    const greenArray: number[] = [];
    const blueArray: number[] = [];

    // 2. Loop through the image buffer to extract R, G, B channels
    for (let i = 0; i < imageBufferData.length; i += 4) {
      redArray.push(imageBufferData[i]);
      greenArray.push(imageBufferData[i + 1]);
      blueArray.push(imageBufferData[i + 2]);
    }

    // 3. Concatenate RGB for transposing [height, width, 3] -> [3, height, width]
    // (in this case [targetHeight, targetWidth, 3] -> [3, targetHeight, targetWidth])
    const transposedData = [...redArray, ...greenArray, ...blueArray];

    // 4. Convert to float32 and normalize
    const l = transposedData.length;
    // Float32Array size: channels * height * width
    const float32Data = new Float32Array(this.dims[1] * this.dims[2] * this.dims[3]);
    for (let i = 0; i < l; i++) {
      float32Data[i] = transposedData[i] / 255.0; // normalize to [0, 1]
    }

    // 5. Create a tensor object from onnxruntime-web.
    // dims are passed here as [batch_size, channels, height, width]
    return new Tensor('float32', float32Data, this.dims);
  }

  protected async predict(
    session: InferenceSession,
    tensor: TypedTensor<'float32'>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();

    performance.mark('denoiser-predict-start');
    const feeds: Record<string, ort.Tensor> = {};
    feeds[session.inputNames[0]] = tensor;
    // Run the session inference.
    const outputData = await session.run(feeds);
    performance.mark('denoiser-predict-end');
    const denoiserMeasure = performance.measure(
      'denoiser-predict',
      'denoiser-predict-start',
      'denoiser-predict-end',
    );
    console.log('Predict duration:', denoiserMeasure.duration);

    const outputTensorName = session.outputNames[0];
    const resultTensor = outputData[outputTensorName];

    if (!resultTensor) {
      throw new Error(`Output tensor '${outputTensorName}' not found in model results.`);
    }

    if (!(resultTensor instanceof Tensor)) {
      throw new Error('Unexpected output structure from model.run()');
    }

    if (resultTensor.type !== 'float32') {
      throw new Error('Unexpected output type');
    }

    return this.convertTensorToImageData(resultTensor as TypedTensor<'float32'>);
  }

  protected async useModel<T>(fn: (session: InferenceSession) => Promise<T>) {
    const session = await InferenceSession.create(this.model, {
      executionProviders: ['webnn', 'webgpu', 'webgl', 'wasm'],
      graphOptimizationLevel: 'all',
    });
    console.log('Inference session created');

    try {
      return await fn(session);
    } finally {
      session.release();
      console.log('Inference session released');
    }
  }

  protected convertTensorToImageData(tensor: TypedTensor<'float32'>): ImageData {
    // Tensor data type should be float32, as indicated in the log
    const tensorData = tensor.data;
    const dims = tensor.dims; // Expecting [1, 3, height, width]

    if (dims.length !== 4 || dims[0] !== 1 || dims[1] !== 3) {
      throw new Error(
        `Unsupported tensor dimensions for image conversion: ${dims}. Expected [1, 3, H, W].`,
      );
    }

    const height = dims[2];
    const width = dims[3];

    const numPixels = width * height;
    // Create an array for pixels in RGBA format
    const pixelArray = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < numPixels; i++) {
      // Extract R, G, B channel values for the current pixel
      // Data in the tensor is stored planar: all R first, then all G, then all B
      const r_norm = tensorData[i]; // R channel for the i-th pixel
      const g_norm = tensorData[i + numPixels]; // G channel for the i-th pixel
      const b_norm = tensorData[i + 2 * numPixels]; // B channel for the i-th pixel

      // Denormalization: convert from [0,1] (or other model range) to [0,255]
      // Multiply by 255 and clamp values to ensure they are within the [0, 255] range
      pixelArray[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(r_norm * 255.0))); // R
      pixelArray[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g_norm * 255.0))); // G
      pixelArray[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b_norm * 255.0))); // B
      pixelArray[i * 4 + 3] = 255; // Alpha (full opacity)
    }

    return new ImageData(pixelArray, width, height);
  }
}
