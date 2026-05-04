#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.TRACE_OUT_DIR ?? path.join(scriptDir, 'traces');
const out = process.env.TRACE_OUT ?? path.join(outDir, `android-trace-${timestamp()}.json`);
const cdpUrl = process.env.TRACE_CDP_URL ?? 'http://127.0.0.1:9222';
const urlPart = process.env.TRACE_URL_PART ?? '';
const bufferKb = Number(process.env.TRACE_BUFFER_KB ?? 512000);

const categories = [
  '-*',
  'blink.console',
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.screenshot',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.invalidationTracking',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-v8.cpu_profiler',
  'disabled-by-default-v8.cpu_profiler.hires',
  'latencyInfo',
  'loading',
  'disabled-by-default-lighthouse',
  'v8.execute',
  'v8',
];

const target = await selectTarget();
const client = await connect(target.webSocketDebuggerUrl);

let traceStarted = false;
let tracingComplete;
const tracingDone = new Promise((resolve) => {
  tracingComplete = resolve;
});

client.onEvent('Tracing.tracingComplete', (params) => tracingComplete(params ?? {}));

try {
  await client.send('Tracing.start', {
    bufferUsageReportingInterval: 500,
    transferMode: 'ReturnAsStream',
    streamFormat: 'json',
    traceConfig: {
      recordMode: 'recordUntilFull',
      traceBufferSizeInKb: bufferKb,
      includedCategories: categories,
    },
  });
  traceStarted = true;

  console.log(`Recording ${target.url}`);
  console.log(`Buffer: ${bufferKb} KiB`);
  console.log('Press Ctrl+C to stop and save the trace.');

  await waitForStopSignal();
  console.log('\nStopping trace...');

  await client.send('Tracing.end');
  const complete = await tracingDone;

  if (!complete.stream) {
    throw new Error(`Tracing completed without a stream: ${JSON.stringify(complete)}`);
  }

  const bytes = await saveTraceStream(client, complete.stream, out);
  console.log(
    JSON.stringify(
      {
        out,
        size: bytes,
        dataLossOccurred: complete.dataLossOccurred ?? false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (traceStarted) {
    await client.send('Tracing.end').catch(() => undefined);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  client.close();
}

async function selectTarget() {
  const targets = await fetch(`${cdpUrl}/json/list`).then((response) => response.json());
  const page =
    targets.find((item) => item.type === 'page' && (!urlPart || item.url.includes(urlPart))) ??
    targets.find((item) => item.type === 'page');

  if (!page) {
    throw new Error(`No page target found at ${cdpUrl}: ${JSON.stringify(targets, null, 2)}`);
  }

  return page;
}

async function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id);
      clearTimeout(timeout);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result ?? {});
      return;
    }

    const handler = eventHandlers.get(message.method);
    if (handler) handler(message.params);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    setTimeout(() => reject(new Error(`WebSocket open timeout: ${webSocketDebuggerUrl}`)), 10000);
  });

  return {
    send(method, params = {}, timeoutMs = 30000) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timeout });
      });
    },
    onEvent(method, handler) {
      eventHandlers.set(method, handler);
    },
    close() {
      ws.close();
    },
  };
}

function waitForStopSignal() {
  return new Promise((resolve) => {
    let stopping = false;
    process.once('SIGINT', () => {
      stopping = true;
      resolve();
    });
    process.once('SIGTERM', () => {
      stopping = true;
      resolve();
    });
    setInterval(() => {
      if (!stopping) process.stdout.write('.');
    }, 5000).unref();
  });
}

async function saveTraceStream(client, handle, tracePath) {
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  const fd = fs.openSync(tracePath, 'w');
  let bytes = 0;

  try {
    for (;;) {
      const chunk = await client.send('IO.read', { handle }, 30000);
      const buffer = chunk.base64Encoded
        ? Buffer.from(chunk.data ?? '', 'base64')
        : Buffer.from(chunk.data ?? '');
      fs.writeSync(fd, buffer);
      bytes += buffer.length;
      if (chunk.eof) break;
    }
  } finally {
    fs.closeSync(fd);
    await client.send('IO.close', { handle }).catch(() => undefined);
  }

  return bytes;
}

function timestamp() {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z');
}
