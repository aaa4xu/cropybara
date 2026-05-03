export interface SliceCutSource {
  readonly height: number;
}

export class SliceCutsValidator {
  public validate(sources: readonly SliceCutSource[], cuts: readonly number[]): void {
    if (sources.length === 0) {
      throw new Error('At least one source image is required.');
    }

    const totalHeight = sources.reduce((sum, source) => sum + source.height, 0);

    if (!Number.isInteger(totalHeight) || totalHeight <= 0) {
      throw new Error(`Total source height must be positive, got ${totalHeight}.`);
    }

    let previous = 0;

    for (const cut of cuts) {
      if (!Number.isInteger(cut)) {
        throw new Error(`Cut must be an integer pixel position, got ${cut}.`);
      }

      if (cut <= 0 || cut >= totalHeight) {
        throw new Error(`Cut ${cut} is outside valid range: 1..${totalHeight - 1}.`);
      }

      if (cut <= previous) {
        throw new Error(`Cuts must be strictly increasing. Got ${cut} after ${previous}.`);
      }

      previous = cut;
    }
  }
}
