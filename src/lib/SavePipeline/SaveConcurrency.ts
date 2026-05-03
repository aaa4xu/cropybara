export class SaveConcurrency {
  public static detect(): number {
    if (typeof navigator === 'undefined') {
      return 1;
    }

    const cores = navigator.hardwareConcurrency || 4;

    return Math.min(Math.max(1, cores - 1), 6);
  }
}
