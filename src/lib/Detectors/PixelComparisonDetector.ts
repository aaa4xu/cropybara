import type { ImageFile } from '$lib/ImageFile';
import { RowPixelProvider } from './RowPixelProvider';

export class PixelComparisonDetector {
  /**
   * Aligns the position to the nearest smaller or equal value that is a multiple of the divisor.
   * @param position The original position.
   * @param divisor The divisor for alignment.
   * @returns The aligned position.
   */
  private static alignToDivisor(position: number, divisor: number): number {
    // If the divisor is incorrect, return the original position to avoid errors
    if (divisor <= 0) {
      return position;
    }

    return Math.floor(position / divisor) * divisor;
  }

  public static async process(
    images: ImageFile[],
    params: PixelComparisonDetectorParams,
  ): Promise<number[]> {
    if (images.length === 0) {
      return [];
    }
    if (params.step <= 0) {
      throw new Error(`step should be a positive number. Got: ${params.step}`);
    }
    if (params.maxDistance <= 0) {
      throw new Error(`maxDistance should be a positive number. Got: ${params.maxDistance}`);
    }
    if (params.margins < 0) {
      throw new Error(`margins should be a non-negative number. Got: ${params.margins}`);
    }
    if (params.sensitivity < 0 || params.sensitivity > 1) {
      throw new Error(`sensitivity should be a number in range [0, 1]. Got: ${params.sensitivity}`);
    }
    if (params.maxSearchDeviationFactor < 0 || params.maxSearchDeviationFactor > 1.0) {
      throw new Error(
        `maxSearchDeviationFactor should be a number in range [0, 1]. Got: ${params.maxSearchDeviationFactor}`,
      );
    }

    const rowPixelProvider = new RowPixelProvider(images);
    const totalHeight = rowPixelProvider.totalHeight;

    if (totalHeight === 0) {
      return [];
    }

    const cuts: number[] = [];
    let lastCutPosition = 0;

    // Threshold: the higher the sensitivity, the lower the brightness difference threshold should be.
    // sensitivity = 100 (max) => threshold = 0 (any change is an edge)
    // sensitivity = 0 (min) => threshold = 255 (almost nothing will be an edge)
    const threshold = Math.floor(255 * (1 - params.sensitivity));

    const maxSearchPixelsUpwards = Math.floor(params.maxDistance * params.maxSearchDeviationFactor);

    // Main loop for finding cut points
    while (lastCutPosition + params.maxDistance < totalHeight) {
      const idealNextCutTargetY = lastCutPosition + params.maxDistance;
      let foundCutInSearch = false;

      // Define the search window:
      // searchStartY - the "lowest" row (highest Y value) to start searching from.
      // This is the ideal target point, aligned.
      const searchStartY = this.alignToDivisor(idealNextCutTargetY, params.step);

      const searchEndY = this.alignToDivisor(
        idealNextCutTargetY - maxSearchPixelsUpwards,
        params.step,
      );

      // Search for a suitable row, moving "up" the image (decreasing Y)
      // from searchStartY to searchEndY (inclusive)
      // The loop will only run if searchStartY >= searchEndY.
      // Also, currentRowY must be > lastCutPosition.
      for (let currentRowY = searchStartY; currentRowY >= searchEndY; currentRowY -= params.step) {
        // Skip if out of image bounds or not making progress
        if (currentRowY <= lastCutPosition || currentRowY >= totalHeight) {
          continue;
        }

        const canSliceThisRow = await rowPixelProvider.canSliceRow(
          currentRowY,
          params.margins,
          threshold,
        );

        if (canSliceThisRow) {
          cuts.push(currentRowY);
          lastCutPosition = currentRowY;
          foundCutInSearch = true;
          break; // Exit the search loop, move to the next cut point
        }
      } // End of search loop for one cut point

      if (!foundCutInSearch) {
        // Fallback: if a suitable point is not found in the search window
        const fallbackCutY = this.alignToDivisor(idealNextCutTargetY, params.step);

        if (fallbackCutY > lastCutPosition && fallbackCutY < totalHeight) {
          cuts.push(fallbackCutY);
          lastCutPosition = fallbackCutY;
        } else {
          // If the fallback cut is invalid.
          // Check if we are stuck due to incorrect parameters.
          if (
            fallbackCutY <= lastCutPosition &&
            lastCutPosition + params.maxDistance < totalHeight
          ) {
            console.warn(
              `PixelComparisonDetector: Fallback cut (${fallbackCutY}) does not advance from lastCutPosition (${lastCutPosition}). ` +
                `This might be caused by a 'maxDistance' (${params.maxDistance}) that is too small compared to 'step' (${params.step}). Stopping.`,
            );
            break; // Break the main while loop to avoid an infinite loop
          }
          // If fallbackCutY >= totalHeight, the outer while-loop will correctly terminate on the next iteration.
        }
      }
    } // End of the main while loop

    return cuts;
  }
}

export interface PixelComparisonDetectorParams {
  /** Analogous to split_height, the maximum distance between cuts. Must be > 0. */
  maxDistance: number;
  /** (0.0 - 1.0), edge detection sensitivity. Higher = more sensitive (smaller differences are considered edges) */
  sensitivity: number;
  /** Pixels at the edges of the row that are ignored during comparison */
  margins: number;
  /** Scanning step in pixels when searching for a suitable row and for alignment. Must be > 0. */
  step: number;
  /** (0.0 - 1.0) Factor of maxDistance, determining how far "up" (towards smaller Y) from the "ideal" point to search before fallback */
  maxSearchDeviationFactor: number;
}
