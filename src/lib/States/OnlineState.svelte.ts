import { browser } from '$app/environment';

export class OnlineState {
  private static instance: OnlineState;
  public static use() {
    if (!this.instance) {
      this.instance = new OnlineState();
    }

    return this.instance;
  }

  #state: boolean = $state(browser ? (navigator.onLine ?? true) : true);

  public get state(): boolean {
    return this.#state;
  }

  public constructor() {
    if (!browser) return;

    window.addEventListener('offline', () => {
      this.#state = false;
    });

    window.addEventListener('online', () => {
      this.#state = true;
    });
  }
}
