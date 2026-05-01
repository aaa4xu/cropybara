import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// required for svelte5 + jsdom as jsdom does not support matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  enumerable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const localStorageMock: Storage = {
  get length() {
    return 0;
  },
  clear: vi.fn(),
  getItem: vi.fn(() => null),
  key: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
