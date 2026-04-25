export const MIN_CUT_DISTANCE = 50;

export class CutsState {
  public readonly minDistance: number;
  public readonly maxDistance: number;

  #cuts: number[] = $state([]);

  /**
   *
   * @param minDistance Minimum distance between cuts
   * @param maxDistance Maximum distance between cuts
   * @param height Image height
   * @param divisor Multiplier for rounding cut coordinates
   */
  public constructor(
    minDistance: number,
    maxDistance: number,
    public readonly height: number,
    public readonly divisor: number,
    init: number[] = [],
  ) {
    if (height <= 0 || isNaN(height)) {
      throw new Error('height must be a positive number.');
    }

    if (divisor <= 0 || isNaN(divisor)) {
      throw new Error('divisor must be a positive number.');
    }

    if (minDistance <= 0 || isNaN(minDistance)) {
      throw new Error('minDistance must be a positive number.');
    }

    if (maxDistance <= 0 || isNaN(maxDistance)) {
      throw new Error('maxDistance must be a positive number.');
    }

    if (minDistance >= maxDistance) {
      throw new Error('minDistance must be less than maxDistance.');
    }

    // Just in case
    this.maxDistance = this.alignToDivisor(maxDistance);
    this.minDistance = this.alignToDivisor(minDistance);

    this.#cuts = init;
    this.fillCutsToBottom();
  }

  public get cuts(): ReadonlyArray<number> {
    return this.#cuts;
  }

  /**
   * Moves the cut at the given index to a new position and applies constraints.
   * @param index Index of the cut to move
   * @param position New position of the cut
   */
  public move(index: number, position: number) {
    this.#cuts[index] = this.alignToDivisor(position);
    this.enforceLimits(index);
  }

  /** Removes unnecessary cuts throughout the image if needed */
  public cleanup(): boolean {
    let changed = false;
    // Iterate backwards so that deletion does not affect array iteration
    for (let i = this.#cuts.length - 1; i >= 0; i--) {
      const prevCut = this.#cuts[i - 1] ?? 0; // Position of the previous cut or 0
      const nextCut = this.#cuts[i + 1] ?? this.height; // Next cut or image boundary
      // Distance between the previous and next (or boundary)
      const distance = nextCut - prevCut;

      // If the distance without the current cut does not exceed the maximum, then the current cut is redundant.
      if (distance <= this.maxDistance) {
        this.#cuts.splice(i, 1);
        changed = true;
      }
    }

    return changed;
  }

  protected enforceLimits(from: number) {
    for (let i = from; i < this.#cuts.length; i++) {
      const prev = this.#cuts[i - 1] ?? 0;
      const min = this.alignToDivisor(prev + this.minDistance);
      const max = this.alignToDivisor(prev + this.maxDistance);

      this.#cuts[i] = Math.min(max, Math.max(min, this.#cuts[i]));
    }

    this.fillCutsToBottom();
    this.removeExcessBottomCuts();
  }

  /**
   * Aligns the position to the specified divisor (rounds down).
   * @param position Position to align
   * @returns Aligned position
   */
  protected alignToDivisor(position: number): number {
    return Math.floor(position / this.divisor) * this.divisor;
  }

  /**
   * Adds new cuts at the bottom of the image if the last cut
   * is too far from the bottom edge (further than maxDistance).
   */
  protected fillCutsToBottom() {
    while ((this.#cuts[this.#cuts.length - 1] ?? 0) + this.maxDistance < this.height) {
      const pos = this.alignToDivisor((this.#cuts[this.#cuts.length - 1] ?? 0) + this.maxDistance);
      this.#cuts.push(pos);
    }
  }

  /** Removes unnecessary cuts at the bottom of the image if needed */
  protected removeExcessBottomCuts() {
    while (
      this.#cuts.length >= 2 &&
      this.#cuts[this.#cuts.length - 2] + this.maxDistance >= this.height
    ) {
      this.#cuts.pop();
    }
  }
}
