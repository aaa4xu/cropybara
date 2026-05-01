export class DosDateTime {
  public static fromTimestamp(timestamp: number): DosDateTime {
    const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
    const year = Math.min(2107, Math.max(1980, date.getFullYear()));

    return new DosDateTime(
      ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    );
  }

  private constructor(
    public readonly date: number,
    public readonly time: number,
  ) {}
}
