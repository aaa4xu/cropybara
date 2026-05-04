export class WebShareTarget {
  public static readonly CacheName = 'web-share-target';
  public static readonly FilenameHeader = 'X-Cropybara-Filename';
  public static readonly TypeHeader = 'Content-Type';

  public static isLaunch(search = typeof location === 'undefined' ? '' : location.search): boolean {
    return new URLSearchParams(search).get('source') === 'share-target';
  }
}
