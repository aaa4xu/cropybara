import { ImageFile } from '$lib/ImageFile';

export async function loadAcqqWatermark(width: number): Promise<ImageFile> {
  const filename = `acqq-${width}.png`;
  const response = await fetch(`/watermarks/${filename}`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch watermark ${filename}: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  const file = new File([blob], filename, { type: 'image/png' });
  return ImageFile.fromFile(file);
}
