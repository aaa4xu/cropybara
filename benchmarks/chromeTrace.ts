import type { BrowserContext } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

type CdpSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>;
type Range = { start: number; end: number };
type Thread = { pid: number; tid: number };
type TraceEvent = {
  name?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: {
    name?: unknown;
    message?: unknown;
    data?: Record<string, unknown>;
  };
};

export const phases = ['upload', 'process', 'save', 'total'] as const;
export type Phase = (typeof phases)[number];

const markerPrefix = 'cropybara:';
const traceCategories = [
  '-*',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'toplevel',
  'v8',
  'disabled-by-default-v8.cpu_profiler',
  'disabled-by-default-v8.cpu_profiler.hires',
  'disabled-by-default-memory-infra',
];

export async function startTrace(client: CdpSession, tracePath: string | null) {
  const completed = new Promise<{
    events: TraceEvent[];
    tracePath: string | null;
    traceBytes: number;
  }>((resolve, reject) => {
    client.once('Tracing.tracingComplete', (event: { stream?: string }) => {
      void (async () => {
        try {
          const chunks: string[] = [];
          if (event.stream) {
            for (;;) {
              const chunk = await client.send('IO.read', { handle: event.stream });
              chunks.push(chunk.data ?? '');
              if (chunk.eof) break;
            }
            await client.send('IO.close', { handle: event.stream }).catch(() => undefined);
          }

          const text = chunks.join('');
          if (tracePath) {
            await fs.mkdir(path.dirname(tracePath), { recursive: true });
            await fs.writeFile(tracePath, text);
          }

          resolve({
            events: text
              ? ((JSON.parse(text) as { traceEvents?: TraceEvent[] }).traceEvents ?? [])
              : [],
            tracePath,
            traceBytes: Buffer.byteLength(text),
          });
        } catch (error) {
          reject(error);
        }
      })();
    });
  });

  await client.send('Tracing.start', {
    categories: traceCategories.join(','),
    options: 'sampling-frequency=10000',
    transferMode: 'ReturnAsStream',
  });

  let stopped = false;
  return {
    async stop() {
      if (!stopped) {
        stopped = true;
        await client.send('Tracing.end');
      }
      return completed;
    },
  };
}

export function analyzeTrace(record: {
  events: TraceEvent[];
  tracePath: string | null;
  traceBytes: number;
}) {
  const markers = new Map<string, number>();
  const threadNames = new Map<string, string>();
  const processNames = new Map<number, string>();

  for (const event of record.events) {
    const marker = markerName(event);
    if (marker && typeof event.ts === 'number') markers.set(marker, event.ts);
    if (event.ph === 'M' && event.name === 'thread_name' && isThread(event)) {
      const name = event.args?.name;
      if (typeof name === 'string') threadNames.set(threadKey(event), name);
    }
    if (event.ph === 'M' && event.name === 'process_name' && typeof event.pid === 'number') {
      const name = event.args?.name;
      if (typeof name === 'string') processNames.set(event.pid, name);
    }
  }

  const mainThread = chooseMainThread(
    record.events,
    threadNames,
    processNames,
    phaseRange(markers, 'total'),
  );

  return {
    tracePath: record.tracePath,
    traceBytes: record.traceBytes,
    eventCount: record.events.length,
    markersFound: [...markers.keys()].sort(),
    missingMarkers: ['upload', 'process', 'save']
      .flatMap((phase) => [`${markerPrefix}${phase}:start`, `${markerPrefix}${phase}:end`])
      .filter((marker) => !markers.has(marker)),
    mainThread,
    phases: Object.fromEntries(
      phases.map((phase) => [
        phase,
        phaseRange(markers, phase)
          ? analyzePhase(
              record.events,
              phaseRange(markers, phase)!,
              mainThread,
              threadNames,
              processNames,
            )
          : emptyPhase(),
      ]),
    ) as Record<Phase, ReturnType<typeof emptyPhase>>,
  };
}

function analyzePhase(
  events: TraceEvent[],
  range: Range,
  mainThread: Thread | null,
  threadNames: Map<string, string>,
  processNames: Map<number, string>,
) {
  const complete = events.filter((event) => isComplete(event) && overlaps(event, range));
  const main = mainThread
    ? complete.filter((event) => event.pid === mainThread.pid && event.tid === mainThread.tid)
    : [];
  const renderer = complete.filter((event) =>
    /Renderer|CrRenderer|Compositor|Worker/i.test(
      `${processNames.get(event.pid) ?? ''} ${threadNames.get(threadKey(event)) ?? ''}`,
    ),
  );
  const heap = events
    .filter(
      (event) => typeof event.ts === 'number' && event.ts >= range.start && event.ts <= range.end,
    )
    .map((event) => event.args?.data?.jsHeapSizeUsed)
    .filter((value): value is number => typeof value === 'number');
  const wallMs = (range.end - range.start) / 1000;
  const mainThreadBusyMs = unionMs(main, range);

  return {
    wallMs: round(wallMs),
    mainThreadBusyMs: round(mainThreadBusyMs),
    mainThreadBusyPercent: round((mainThreadBusyMs / wallMs) * 100),
    rendererThreadMs: round(sumByThread(renderer, range)),
    jsHeapMaxMiB: heap.length ? round(Math.max(...heap) / 1024 / 1024) : null,
    jsHeapDeltaMiB: heap.length
      ? round((Math.max(...heap) - Math.min(...heap)) / 1024 / 1024)
      : null,
    topMainThreadEvents: topEvents(main, range),
  };
}

function chooseMainThread(
  events: TraceEvent[],
  threadNames: Map<string, string>,
  processNames: Map<number, string>,
  range: Range | null,
) {
  const score = new Map<string, Thread & { score: number }>();
  for (const event of events) {
    if (!isComplete(event) || (range && !overlaps(event, range))) continue;
    const key = threadKey(event);
    const names = `${processNames.get(event.pid) ?? ''} ${threadNames.get(key) ?? ''}`;
    if (!/Renderer.*Main|CrRendererMain|MainThread/i.test(names)) continue;
    score.set(key, {
      pid: event.pid,
      tid: event.tid,
      score: (score.get(key)?.score ?? 0) + clipped(event, range),
    });
  }
  const best = [...score.values()].sort((a, b) => b.score - a.score)[0];
  return best
    ? { pid: best.pid, tid: best.tid, name: threadNames.get(`${best.pid}:${best.tid}`) ?? null }
    : null;
}

function topEvents(events: Array<TraceEvent & { ts: number; dur: number }>, range: Range) {
  const byName = new Map<string, { total: number; count: number }>();
  for (const event of events) {
    const name = event.name ?? '(anonymous)';
    const current = byName.get(name) ?? { total: 0, count: 0 };
    byName.set(name, { total: current.total + clipped(event, range), count: current.count + 1 });
  }
  return [...byName.entries()]
    .map(([name, value]) => ({ name, totalMs: round(value.total / 1000), count: value.count }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 8);
}

function unionMs(events: Array<TraceEvent & { ts: number; dur: number }>, range: Range) {
  const intervals = events
    .map((event) => ({
      start: Math.max(event.ts, range.start),
      end: Math.min(event.ts + event.dur, range.end),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let current: Range | null = null;
  for (const interval of intervals) {
    if (!current) current = interval;
    else if (interval.start <= current.end) current.end = Math.max(current.end, interval.end);
    else {
      total += current.end - current.start;
      current = interval;
    }
  }
  return (current ? total + current.end - current.start : total) / 1000;
}

function sumByThread(
  events: Array<TraceEvent & { ts: number; dur: number; pid: number; tid: number }>,
  range: Range,
) {
  const groups = new Map<string, Array<TraceEvent & { ts: number; dur: number }>>();
  for (const event of events)
    groups.set(threadKey(event), [...(groups.get(threadKey(event)) ?? []), event]);
  return [...groups.values()].reduce((total, group) => total + unionMs(group, range), 0);
}

function markerName(event: TraceEvent) {
  return [event.name, event.args?.data?.name, event.args?.data?.message, event.args?.message].find(
    (value): value is string => typeof value === 'string' && value.startsWith(markerPrefix),
  );
}

function phaseRange(markers: Map<string, number>, phase: Phase): Range | null {
  const start = markers.get(
    phase === 'total' ? 'cropybara:upload:start' : `${markerPrefix}${phase}:start`,
  );
  const end = markers.get(phase === 'total' ? 'cropybara:save:end' : `${markerPrefix}${phase}:end`);
  return typeof start === 'number' && typeof end === 'number' && end > start
    ? { start, end }
    : null;
}

function emptyPhase() {
  return {
    wallMs: null,
    mainThreadBusyMs: null,
    mainThreadBusyPercent: null,
    rendererThreadMs: null,
    jsHeapMaxMiB: null,
    jsHeapDeltaMiB: null,
    topMainThreadEvents: [],
  };
}

function isThread(event: TraceEvent): event is TraceEvent & Thread {
  return typeof event.pid === 'number' && typeof event.tid === 'number';
}

function isComplete(
  event: TraceEvent,
): event is TraceEvent & { ts: number; dur: number; pid: number; tid: number } {
  return (
    event.ph === 'X' &&
    typeof event.ts === 'number' &&
    typeof event.dur === 'number' &&
    isThread(event)
  );
}

function overlaps(event: TraceEvent & { ts: number; dur: number }, range: Range) {
  return event.ts < range.end && event.ts + event.dur > range.start;
}

function clipped(event: TraceEvent & { ts: number; dur: number }, range: Range | null) {
  return range
    ? Math.max(0, Math.min(event.ts + event.dur, range.end) - Math.max(event.ts, range.start))
    : event.dur;
}

function threadKey(thread: Thread) {
  return `${thread.pid}:${thread.tid}`;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
