# Repository Guidelines

## Project Structure & Module Organization
- `src/`: SvelteKit app code.
  - `routes/`: Pages and layouts.
  - `lib/`: Core modules (Components, Image processing, States, Workers, Zip readers, etc.).
  - `service-worker/`: PWA service worker.
  - `style/`: SCSS styles.
  - Tests co‑located as `*.spec.ts` (e.g., `src/lib/Queue.spec.ts`).
- `e2e/`: Playwright end‑to‑end tests.
- `static/`: Public assets and ONNX models (`static/models/...`).
- `messages/`: i18n strings.
- Key config: `svelte.config.js`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`.

## Build, Test, and Development Commands
- `bun install`: Install dependencies.
- `bun dev` (or `bun run dev`): Start local dev server.
- `bun run build`: Production build.
- `bun run preview`: Preview production build.
- `bun run check`: Type + Svelte checks.
- `bun run lint`: Prettier check + ESLint.
- `bun run format`: Apply Prettier.
- `bun run test:unit`: Run Vitest unit tests in continuous mode.
- `bun run test:e2e`: Run Playwright e2e tests.
- `bun run test`: Run full test suite.

## Coding Style & Naming Conventions
- Use TypeScript and Svelte. Prettier enforces formatting; ESLint (with Svelte plugin) enforces lint rules.
- Indentation: 2 spaces; single quotes; semicolons per Prettier defaults.
- Components: `PascalCase.svelte` (e.g., `LabeledSelect.svelte`).
- Utilities/modules: `camelCase.ts` (e.g., `imageResizer.ts`).
- Svelte state helpers: `*.svelte.ts`.
- Tests: `*.spec.ts` adjacent to source.

## Testing Guidelines
- Unit tests: Vitest. Co‑locate with code (`*.spec.ts`).
- E2E: Playwright tests in `e2e/` (e.g., `e2e/cropybara.spec.ts`).
- Write tests for new features and bug fixes; keep them deterministic and fast.
- Quick run examples: `bun run test:unit -- -t "CarvingKnife"`.

## Commit & Pull Request Guidelines
- Commits: Use gitmoji; imperative mood and concise scope.
- Requirements: Passing `lint`, `check`, and all tests. Include steps to validate locally. Includes both English and Russian translations.

## Security & Configuration
- Env vars (.env): `PUBLIC_GA_MEASUREMENT_ID`, `PUBLIC_YANDEX_OAUTH_CLIENT_ID`, `PUBLIC_YANDEX_OAUTH_REDIRECT_URI`.
- Do not commit secrets; only `PUBLIC_` vars are exposed client‑side.

