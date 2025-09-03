import '@testing-library/jest-dom/vitest';
import { Canvas, Image } from 'canvas';

if (typeof global.OffscreenCanvas === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.OffscreenCanvas = Canvas as any;

  /**
   * The OffscreenCanvas.convertToBlob() method creates a Blob object representing
   * the image contained in the canvas.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob
   * @since NodeJS v18.0.0
   */
  global.OffscreenCanvas.prototype.convertToBlob = async function (options = {}) {
    // If the user agent does not support the requested type, then it must create the file using the PNG format.
    // ref: https://html.spec.whatwg.org/multipage/canvas.html#a-serialisation-of-the-bitmap-as-a-file
    const type =
      options.type && ['image/png', 'image/jpeg'].includes(options.type)
        ? options.type
        : 'image/png';

    const quality = options.quality != null ? { quality: options.quality } : undefined;

    return new Promise((resolve, reject) => {
      // @ts-expect-error https://github.com/jimmywarting/node-canvas/blob/feature/convertToBlob/lib/canvas.js#L54
      this.toBuffer(
        (err: Error, buf: Buffer) => (err ? reject(err) : resolve(new Blob([buf], { type }))),
        type,
        quality,
      );
    });
  };
}

if (typeof global.Image === 'undefined') {
  console.log('Image');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Image = Image as any;
}
