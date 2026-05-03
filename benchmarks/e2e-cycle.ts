import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFile as execFileCallback, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { installZipSink } from './browserZipSink';
import { analyzeTrace, phases, startTrace } from './chromeTrace';

const execFile = promisify(execFileCallback);

type InputFile = { name: string; mimeType: string; buffer: Buffer };

type Options = {
  filesDir: string;
  fileLimit: number | null;
  iterations: number;
  warmup: number;
  out: string;
  traceDir: string;
  saveTrace: boolean;
  url: string | null;
  port: number | null;
  dev: boolean;
  skipBuild: boolean;
  headed: boolean;
  timeoutMs: number;
};

const optionsDefaults: Options = {
  filesDir: 'test-results/3141217',
  fileLimit: null,
  iterations: 3,
  warmup: 0,
  out: '.codex/perf-results/e2e-cycle.jsonl',
  traceDir: '.codex/perf-results/e2e-cycle-traces',
  saveTrace: true,
  url: null,
  port: null,
  dev: false,
  skipBuild: false,
  headed: false,
  timeoutMs: 120_000,
};

const appScenario = {
  projectName: 'cropybara-e2e-benchmark',
  heightLimit: 20_000,
  detector: 'PixelComparison',
  sensitivity: 90,
  step: 5,
  margins: 5,
} as const;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = await readInput(options);
  const port = options.port ?? (await freePort());
  const baseUrl = options.url ?? `http://127.0.0.1:${port}`;
  const server = options.url ? null : await startServer(port, options);
  const browser = await chromium.launch({
    headless: !options.headed,
    args: [
      '--enable-precise-memory-info',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--no-first-run',
    ],
  });

  try {
    await waitForServer(baseUrl);
    console.log(`[benchmark] app: ${baseUrl}`);

    const runs = [];
    for (let index = 0; index < options.warmup + options.iterations; index++) {
      const warmup = index < options.warmup;
      const iteration = warmup ? index + 1 : index + 1 - options.warmup;
      const run = await runOnce(browser, baseUrl, input, options, iteration, warmup);
      printRun(run);
      if (!warmup) runs.push(run);
    }

    const result = {
      name: 'cropybara-e2e-cycle',
      gitCommit: await gitCommit(),
      timestamp: new Date().toISOString(),
      scenario: appScenario,
      options,
      summary: summarize(runs),
      runs,
    };

    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.appendFile(options.out, `${JSON.stringify(result)}\n`);
    console.log('\nsummary:');
    console.log(JSON.stringify(result.summary, null, 2));
    console.log(`\njsonl: ${path.resolve(options.out)}`);
  } finally {
    await browser.close().catch(() => undefined);
    if (server) await stopServer(server);
  }
}

async function runOnce(
  browser: Browser,
  baseUrl: string,
  input: Awaited<ReturnType<typeof readInput>>,
  options: Options,
  iteration: number,
  warmup: boolean,
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    acceptDownloads: false,
  });
  const page = await context.newPage();
  let trace: Awaited<ReturnType<typeof startTrace>> | null = null;

  try {
    page.setDefaultTimeout(options.timeoutMs);
    page.setDefaultNavigationTimeout(options.timeoutMs);
    await installZipSink(page);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Images').waitFor();
    await page.waitForFunction(
      () => performance.getEntriesByName('cropybara:upload-screen:ready', 'mark').length > 0,
    );
    await collectGarbage(context, page);

    const cdp = await context.newCDPSession(page);
    trace = await startTrace(cdp, tracePath(options, iteration, warmup));
    await runAppFlow(page, input.payloads, options);

    const cutCount = await page.locator('.cut').count();
    const zip = await page.evaluate(() => {
      return (
        window as unknown as {
          __cropybaraE2EZip: {
            suggestedName: string | null;
            bytesWritten: number;
            chunksWritten: number;
            localFileHeaders: number;
            closed: boolean;
            aborted: boolean;
          };
        }
      ).__cropybaraE2EZip;
    });
    const traceMetrics = analyzeTrace(await trace.stop());
    trace = null;
    await cdp.detach().catch(() => undefined);

    const expectedZipEntries = cutCount + 1;
    if (!zip.closed || zip.aborted) throw new Error('ZIP export did not finish.');
    if (zip.localFileHeaders !== expectedZipEntries) {
      throw new Error(
        `ZIP entry count mismatch: expected ${expectedZipEntries}, got ${zip.localFileHeaders}.`,
      );
    }
    if (traceMetrics.missingMarkers.length) {
      throw new Error(
        `Chrome trace is missing app markers: ${traceMetrics.missingMarkers.join(', ')}`,
      );
    }

    return {
      iteration,
      warmup,
      timestamp: new Date().toISOString(),
      files: { count: input.files.length, bytes: input.totalBytes, dir: input.filesDir },
      output: {
        cutCount,
        expectedZipEntries,
        suggestedName: zip.suggestedName,
        bytesWritten: zip.bytesWritten,
        chunksWritten: zip.chunksWritten,
      },
      trace: traceMetrics,
    };
  } finally {
    if (trace) await trace.stop().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function runAppFlow(page: Page, files: InputFile[], options: Options) {
  await page.getByLabel('Images').setInputFiles(files);
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByLabel('Project name').fill(appScenario.projectName);
  await page.getByLabel('Height limit, px').fill(String(appScenario.heightLimit));
  await page.getByLabel('Compression artifact removal').selectOption('Off');
  await page.getByLabel('Unwatermark').selectOption('Off');
  await page.getByLabel('Detector type').selectOption(appScenario.detector);
  await page.getByLabel('Object detection sensitivity, %').fill(String(appScenario.sensitivity));
  await page.getByLabel('Scan line step, px').fill(String(appScenario.step));
  await page.getByLabel('Ignorable horizontal margins, px').fill(String(appScenario.margins));

  await page.getByRole('button', { name: 'Process' }).click();
  await page.getByRole('button', { name: 'Save' }).waitFor();
  const zipClosed = page.waitForFunction(
    () => {
      const state = (
        window as unknown as { __cropybaraE2EZip?: { closed?: boolean; aborted?: boolean } }
      ).__cropybaraE2EZip;
      return Boolean(state?.closed || state?.aborted);
    },
    null,
    { timeout: options.timeoutMs },
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await zipClosed;
}

async function readInput(options: Options) {
  const filesDir = path.resolve(options.filesDir);
  const entries = await fs.readdir(filesDir, { withFileTypes: true });
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(avif|gif|jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => path.join(filesDir, entry.name))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)))
    .slice(0, options.fileLimit ?? undefined);
  if (!files.length) throw new Error(`No image files found in ${filesDir}`);

  const payloads = await Promise.all(
    files.map(async (filename) => {
      const buffer = await fs.readFile(filename);
      return { name: path.basename(filename), mimeType: imageMime(filename, buffer), buffer };
    }),
  );
  const sizes = await Promise.all(files.map((filename) => fs.stat(filename)));
  return {
    filesDir,
    files,
    payloads,
    totalBytes: sizes.reduce((total, stat) => total + stat.size, 0),
  };
}

function imageMime(filename: string, buffer: Buffer) {
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return path.extname(filename).toLowerCase() === '.avif' ? 'image/avif' : 'image/jpeg';
}

async function collectGarbage(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  await cdp.detach().catch(() => undefined);
}

async function startServer(port: number, options: Options) {
  if (!options.dev && !options.skipBuild)
    await execFile('bun', ['run', 'build'], { cwd: process.cwd(), maxBuffer: 20_000_000 });
  const server = spawn(
    path.join(process.cwd(), 'node_modules', '.bin', 'vite'),
    [
      options.dev ? 'dev' : 'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: process.cwd(), env: { ...process.env, BROWSER: 'none' }, stdio: 'pipe' },
  );
  server.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  return server;
}

async function stopServer(server: ChildProcess) {
  if (server.killed) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

async function waitForServer(baseUrl: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function summarize(runs: Array<Awaited<ReturnType<typeof runOnce>>>) {
  return {
    runCount: runs.length,
    phases: Object.fromEntries(
      phases.map((phase) => [
        phase,
        {
          wallMs: stats(runs.map((run) => run.trace.phases[phase].wallMs)),
          mainThreadBusyMs: stats(runs.map((run) => run.trace.phases[phase].mainThreadBusyMs)),
          rendererThreadMs: stats(runs.map((run) => run.trace.phases[phase].rendererThreadMs)),
          jsHeapMaxMiB: stats(runs.map((run) => run.trace.phases[phase].jsHeapMaxMiB)),
          jsHeapDeltaMiB: stats(runs.map((run) => run.trace.phases[phase].jsHeapDeltaMiB)),
        },
      ]),
    ),
    output: {
      expectedZipEntries: stats(runs.map((run) => run.output.expectedZipEntries)),
      bytesWrittenMiB: stats(runs.map((run) => run.output.bytesWritten / 1024 / 1024)),
      chunksWritten: stats(runs.map((run) => run.output.chunksWritten)),
    },
  };
}

function stats(values: Array<number | null>) {
  const sorted = values
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    min: round(sorted[0]),
    median: round(median),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    max: round(sorted[sorted.length - 1]),
  };
}

function printRun(run: Awaited<ReturnType<typeof runOnce>>) {
  const metrics = run.trace.phases;
  const label = run.warmup ? `warmup ${run.iteration}` : `run ${run.iteration}`;
  console.log(
    [
      `${label}: files=${run.files.count}, cuts=${run.output.cutCount}, zip=${round(run.output.bytesWritten / 1024 / 1024)} MiB`,
      `  wall ms: upload=${fmt(metrics.upload.wallMs)}, process=${fmt(metrics.process.wallMs)}, save=${fmt(metrics.save.wallMs)}, total=${fmt(metrics.total.wallMs)}`,
      `  main thread ms: upload=${fmt(metrics.upload.mainThreadBusyMs)}, process=${fmt(metrics.process.mainThreadBusyMs)}, save=${fmt(metrics.save.mainThreadBusyMs)}, total=${fmt(metrics.total.mainThreadBusyMs)}`,
      `  JS heap MiB max: upload=${fmt(metrics.upload.jsHeapMaxMiB)}, process=${fmt(metrics.process.jsHeapMaxMiB)}, save=${fmt(metrics.save.jsHeapMaxMiB)}, total=${fmt(metrics.total.jsHeapMaxMiB)}`,
      `  trace: events=${run.trace.eventCount}, size=${round(run.trace.traceBytes / 1024 / 1024)} MiB, file=${run.trace.tracePath ?? 'not saved'}`,
    ].join('\n'),
  );
}

function parseArgs(args: string[]) {
  const options = { ...optionsDefaults };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const value = () => {
      const next = args[++index];
      if (!next) throw new Error(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--files-dir') options.filesDir = value();
    else if (arg === '--file-limit') options.fileLimit = positiveInt(value(), arg);
    else if (arg === '--iterations') options.iterations = positiveInt(value(), arg);
    else if (arg === '--warmup') options.warmup = nonNegativeInt(value(), arg);
    else if (arg === '--out') options.out = value();
    else if (arg === '--trace-dir') options.traceDir = value();
    else if (arg === '--no-save-trace') options.saveTrace = false;
    else if (arg === '--url') options.url = value().replace(/\/$/, '');
    else if (arg === '--port') options.port = positiveInt(value(), arg);
    else if (arg === '--dev') options.dev = true;
    else if (arg === '--skip-build') options.skipBuild = true;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--timeout-ms') options.timeoutMs = positiveInt(value(), arg);
    else if (arg === '--help') help();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function positiveInt(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function nonNegativeInt(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${label} must be a non-negative integer`);
  return parsed;
}

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') reject(new Error('Failed to allocate port'));
      else server.close(() => resolve(address.port));
    });
  });
}

async function gitCommit() {
  try {
    return (await execFile('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim();
  } catch {
    return null;
  }
}

function tracePath(options: Options, iteration: number, warmup: boolean) {
  return options.saveTrace
    ? path.join(options.traceDir, `${warmup ? 'warmup' : 'run'}-${iteration}-${Date.now()}.json`)
    : null;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function fmt(value: number | null) {
  return value === null ? 'n/a' : value.toFixed(2);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function help(): never {
  console.log(
    `Usage: bun run benchmark:e2e-cycle [--iterations n] [--warmup n] [--dev] [--no-save-trace]`,
  );
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
