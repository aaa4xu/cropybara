# Repository Guidelines

## Project Structure & Module Organization

- `src/`: SvelteKit app code.
  - `routes/`: Pages and layouts.
  - `lib/`: Core modules (Components, image processing, States, Workers, Zip readers, etc.).
  - `service-worker/`: PWA service worker.
  - `style/`: SCSS styles.
  - Tests co-located as `*.spec.ts` (e.g., `src/lib/Queue.spec.ts`).
- `e2e/`: Playwright end-to-end tests and fixtures.
- `static/`: Public assets and ONNX models (`static/models/...`).
- `messages/`: i18n strings (`en`, `ru`, `vi`). Update all locale files when changing
  user-facing copy.
- Key config: `svelte.config.js`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`.

## Build, Test, and Development Commands

- `bun install`: Install dependencies from `bun.lock`.
- `bun dev` (or `bun run dev`): Start local dev server.
- `bun run build`: Production build.
- `bun run preview`: Preview production build.
- `bun run check`: Type + Svelte checks.
- `bun run lint`: Prettier check + ESLint.
- `bun run format`: Apply Prettier.
- `bun run test:unit`: Run Vitest unit tests in continuous mode.
- `bun run test:unit -- --run`: Run Vitest unit tests once.
- `bun run test:e2e`: Run Playwright e2e tests.
- `bun run test`: Run full test suite, including e2e; the e2e approval rule still applies.

## Coding Style & Naming Conventions

- Use TypeScript and Svelte. Prettier enforces formatting; ESLint (with Svelte plugin) enforces lint rules.
- Indentation: 2 spaces; single quotes; semicolons per Prettier defaults.
- Components: `PascalCase.svelte` (e.g., `LabeledSelect.svelte`).
- Utilities/modules: `camelCase.ts` (e.g., `imageResizer.ts`).
- Svelte state helpers: `*.svelte.ts`.
- Tests: `*.spec.ts` adjacent to source.
- Prefer existing module boundaries and helper APIs over new abstractions.

## Testing Guidelines

- Unit tests: Vitest. Co-locate with code (`*.spec.ts`).
- E2E: Playwright tests in `e2e/` (e.g., `e2e/cropybara.spec.ts`).
- Agents must obtain approval via an escalated command request (no separate text prompt) before running `bun run test:e2e`.
- Write tests for new features and bug fixes; keep them deterministic and fast.
- For image-processing changes, prefer deterministic fixture-based tests under the touched
  module, using existing fixtures where possible.
- Quick run examples: `bun run test:unit -- --run -t "CarvingKnife"`.
- Before merging accepted changes, run `bun run lint`, `bun run check`,
  `bun run test:unit -- --run`, and `bun run build`.

## Commit & Pull Request Guidelines

- Commits: Use gitmoji; imperative mood and concise scope.
- Requirements: passing `lint`, `check`, relevant tests, and `build`. Include steps to
  validate locally.
- User-facing copy changes must update all locale files in `messages/`.

## Security & Configuration

- Env vars (`.env`): `PUBLIC_GA_MEASUREMENT_ID`, `PUBLIC_POSTHOG_KEY`,
  `PUBLIC_YANDEX_OAUTH_CLIENT_ID`, `PUBLIC_YANDEX_OAUTH_REDIRECT_URI`.
- Do not commit secrets; only `PUBLIC_` vars are exposed client-side.
