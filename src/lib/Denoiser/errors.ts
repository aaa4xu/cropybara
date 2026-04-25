export function isONNXRuntimeLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /both async and sync fetching of the wasm failed|webassembly backend initializing failed|failed to fetch .*\.wasm|wasm failed/i.test(
    message,
  );
}
