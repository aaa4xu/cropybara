const TRACE_PREFIX = 'cropybara';

export function markTrace(name: string): void {
  if (typeof performance === 'undefined') return;

  const fullName = traceName(name);
  performance.mark(fullName);
  console.timeStamp?.(fullName);
}

export function measureTrace(name: string, start: string, end: string): void {
  if (typeof performance === 'undefined') return;

  const measureName = traceName(name);
  const startName = traceName(start);
  const endName = traceName(end);

  try {
    performance.measure(measureName, startName, endName);
  } catch {
    // Missing marks should not affect application behavior.
  }
}

function traceName(name: string): string {
  return `${TRACE_PREFIX}:${name}`;
}
