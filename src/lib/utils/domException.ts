const DOM_EXCEPTION_NAMES = {
  NotFound: 'NotFoundError',
  NoModificationAllowed: 'NoModificationAllowedError',
} as const;

export { DOM_EXCEPTION_NAMES };

export function hasDomExceptionName(err: unknown, expectedName: string): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = (err as { name?: unknown }).name;
    return typeof name === 'string' && name === expectedName;
  }

  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === expectedName;
  }

  return false;
}
