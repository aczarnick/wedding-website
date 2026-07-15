# Vitest Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vitest + React Testing Library test suite covering `DaysUntilWedding`, `Header`'s nav-link resolution, and a landing-page smoke test, wired into CI.

**Architecture:** Vitest with a jsdom environment runs colocated `*.test.ts(x)` files. A Vite `resolve.alias` regex intercepts `.jpg`/`.png` imports and swaps them for a small `{ src, width, height }` stub so real (unmocked) `next/image`/`next/link` components render correctly in tests without decoding actual image binaries. No production source files change.

**Tech Stack:** vitest 4, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom, @vitest/coverage-v8 (v8 provider).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-vitest-test-suite-design.md`
- No changes to production source (`src/components/Header.tsx`, `src/utils/dateUtils.ts`, etc.) — tests exercise existing behavior as-is.
- `npm test` must be single-run (non-watch) and CI-safe.
- No coverage threshold enforced; coverage is a local-only script, not a CI gate.
- Every task must leave `npm run lint`, `npm test`, and `npm run build` all green.

---

**Note on tasks below:** the code in every step here has already been spiked and verified working end-to-end in the actual repo (all lint/test/build gates pass). Task boundaries below exist to give the plan proper checkpoints and commit granularity — implementers should type/apply the exact code shown, not improvise, since the regex alias and duplicate-element handling encode real gotchas discovered during the spike (documented inline).

### Task 1: Vitest tooling setup + DaysUntilWedding tests

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `test/mocks/imageMock.ts`
- Modify: `package.json` (devDependencies + scripts)
- Test: `src/utils/dateUtils.test.ts`

**Interfaces:**
- Consumes: `DaysUntilWedding` from `src/utils/dateUtils.ts` (existing, unchanged) — signature `(): string`.
- Produces: the vitest config/setup/alias infrastructure every later task's tests run under. Later tasks assume `@/*` resolves to `src/*`, `.jpg`/`.png` imports resolve to `test/mocks/imageMock.ts`'s default export (`{ src: string, width: number, height: number }`), and jest-dom matchers (`toBeInTheDocument`, `toHaveAttribute`) are globally available after `vitest.setup.ts` runs.

- [ ] **Step 1: Install dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @vitest/coverage-v8
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^.+\.(jpg|jpeg|png)$/, replacement: path.resolve(__dirname, './test/mocks/imageMock.ts') },
    ],
  },
});
```

**Gotcha:** the image-alias regex MUST be anchored with `^.+` before the extension group. Vite's alias resolution does a plain string `.replace()` of whatever the `find` pattern matches against the import specifier. An unanchored pattern like `/\.(jpg|jpeg|png)$/` only matches the trailing `.jpg`, so `.replace()` mangles just that suffix (e.g. `../../public/images/lift-bar.jpg` becomes `../../public/images/lift-bar` + the absolute replacement path glued on) instead of swapping the whole specifier — this was confirmed by hitting exactly that failure during the design spike.

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Create `test/mocks/imageMock.ts`**

```ts
const mockImage = {
  src: '/mock-image.jpg',
  width: 100,
  height: 100,
};

export default mockImage;
```

Note: exporting a named `const` first (rather than `export default { ... }` inline) avoids ESLint's `import/no-anonymous-default-export` warning under this repo's `eslint-config-next` config.

- [ ] **Step 5: Add `test`/`test:coverage` scripts to `package.json`**

In the `"scripts"` block, add after `"lint": "eslint"`:

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 6: Write `src/utils/dateUtils.test.ts`**

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DaysUntilWedding } from './dateUtils';

describe('DaysUntilWedding', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the day-of message when today is the wedding day', () => {
    vi.setSystemTime(new Date('2026-10-10T00:00:00'));
    expect(DaysUntilWedding()).toBe('Today is the day!');
  });

  it('returns the singular message when the wedding is 1 day away', () => {
    vi.setSystemTime(new Date('2026-10-09T00:00:00'));
    expect(DaysUntilWedding()).toBe('1 Day to go!');
  });

  it('returns the plural message when the wedding is N days away', () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00'));
    expect(DaysUntilWedding()).toBe('9 Days to go!');
  });

  it('returns an empty string after the wedding date has passed', () => {
    vi.setSystemTime(new Date('2026-10-11T00:00:00'));
    expect(DaysUntilWedding()).toBe('');
  });
});
```

`DaysUntilWedding` already implements this behavior correctly (it's existing, working code) — these are characterization tests, not red/green TDD, so there's no "write failing test, then implement" cycle here. Run and expect all four to pass immediately.

- [ ] **Step 7: Run the suite and verify it's wired up**

Run: `npx vitest run src/utils/dateUtils.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`

- [ ] **Step 8: Run lint and build to confirm no regressions**

Run: `npm run lint && npm run build`
Expected: both exit 0. (`next build`'s TypeScript pass also typechecks `*.test.ts` files since they're covered by `tsconfig.json`'s `**/*.ts` include — this was verified during the spike to work with no `tsconfig` changes needed.)

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts vitest.setup.ts test/mocks/imageMock.ts package.json package-lock.json src/utils/dateUtils.test.ts
git commit -m "test: add vitest tooling and DaysUntilWedding tests"
```

---

### Task 2: Header link-resolution tests

**Files:**
- Test: `src/components/Header.test.tsx`

**Interfaces:**
- Consumes: `Header` component from `src/components/Header.tsx` (unchanged), `NAV_LINKS` from `src/constants/events.ts` (existing: `["Details", "Travel", "FAQs", "Registry", "Gallery"] as const`). Consumes the vitest/jsdom/RTL infrastructure from Task 1.
- Produces: nothing consumed by later tasks.

**Context:** `Header.tsx` renders `NAV_LINKS` twice — once in the desktop nav (`div.hidden.md:contents`) and once in the mobile drawer. Tailwind's responsive classes (`md:hidden`, `hidden md:contents`) have no effect in jsdom since no CSS is loaded, so both renders are present in the test DOM simultaneously. Both instances resolve `href` via the same `getHref`/`isRouteLink` logic, so they always agree — the test asserts every match has the correct `href` rather than assuming a single match.

- [ ] **Step 1: Write `src/components/Header.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { NAV_LINKS } from '@/constants/events';

const EXPECTED_HREFS: Record<(typeof NAV_LINKS)[number], string> = {
  Details: '/#Details',
  Travel: '/#Travel',
  FAQs: '/#FAQs',
  Registry: '/registry',
  Gallery: '/gallery',
};

describe('Header', () => {
  it.each(NAV_LINKS)('renders every "%s" link with the correct href', (link) => {
    render(<Header />);

    const matches = screen.getAllByRole('link', { name: link });

    expect(matches.length).toBeGreaterThan(0);
    matches.forEach((el) => {
      expect(el).toHaveAttribute('href', EXPECTED_HREFS[link]);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`

- [ ] **Step 3: Run lint and build to confirm no regressions**

Run: `npm run lint && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.test.tsx
git commit -m "test: add Header nav-link resolution tests"
```

---

### Task 3: Landing-page smoke test

**Files:**
- Test: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `Home` default export from `src/app/page.tsx` (unchanged). Consumes the vitest/jsdom/RTL infrastructure and image alias from Task 1.
- Produces: nothing consumed by later tasks.

**Context:** This was the highest-risk task in the design — rendering the full landing page pulls in `HeroSection` (imports the 21MB `trees-handhold.jpg` via `next/image` with `fill`) and `EventSection` (imports `ring-shot.jpg`/`lift-bar.jpg` via `next/image` *without* `fill`, relying on the import resolving to a `StaticImageData`-shaped object). Confirmed during the spike: with Task 1's image alias in place, the real `next/image` and `next/link` components render correctly with no additional mocking needed — the alias is sufficient.

Also confirmed during the spike: `EventSection` renders "Ceremony"/"Reception" twice (mobile + desktop layout, same jsdom-doesn't-apply-CSS reason as Task 2), and "FAQs" renders three times total (Header desktop nav + Header mobile drawer + the `FAQSection` heading). The test uses `getAllByText` for those and plain `getByText` only for strings confirmed unique (`"Alex & Claire"`, `"Travel Recommendations"`).

- [ ] **Step 1: Write `src/app/page.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the landing page without throwing', () => {
    render(<Home />);

    expect(screen.getByText('Alex & Claire')).toBeInTheDocument();
    expect(screen.getAllByText('Ceremony').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reception').length).toBeGreaterThan(0);
    expect(screen.getByText('Travel Recommendations')).toBeInTheDocument();
    expect(screen.getAllByText('FAQs').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/app/page.test.tsx`
Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`

- [ ] **Step 3: Run the full suite together**

Run: `npm test`
Expected: `Test Files 3 passed (3)`, `Tests 10 passed (10)`

- [ ] **Step 4: Run lint and build to confirm no regressions**

Run: `npm run lint && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.test.tsx
git commit -m "test: add landing page smoke test"
```

---

### Task 4: Wire `npm test` into CI, fix incidental lint config gap

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `npm test` script from Task 1.
- Produces: nothing consumed by later tasks (final task).

**Context:** Running `npm run test:coverage` locally generates a `coverage/` directory. It's already covered by `.gitignore`, but `eslint.config.mjs`'s `globalIgnores` list didn't include it — confirmed during the spike that this makes `npm run lint` emit a spurious warning (`Unused eslint-disable directive`) against vitest's generated `coverage/block-navigation.js` if that directory happens to exist. Adding it to the ignore list is a one-line fix bundled into this task since it's directly caused by adding the coverage script in Task 1.

- [ ] **Step 1: Add `coverage/**` to `eslint.config.mjs`'s ignore list**

In `eslint.config.mjs`, change:

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
```

to:

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
```

- [ ] **Step 2: Verify the fix**

Run: `npm run test:coverage && npm run lint`
Expected: `test:coverage` passes, `lint` reports no problems (previously it would warn on `coverage/block-navigation.js`).

Then clean up the local artifact so it doesn't linger:

Run: `rm -rf coverage`

- [ ] **Step 3: Add the `npm test` step to `.github/workflows/ci.yml`**

In the `app` job, change:

```yaml
  app:
    name: App — lint, build, docker
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

to:

```yaml
  app:
    name: App — lint, test, build, docker
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 4: Run the full local verification gate one more time**

Run: `npm run lint && npm test && npm run build`
Expected: all three exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml eslint.config.mjs
git commit -m "ci: run test suite in CI; ignore coverage/ in eslint"
```

---

## After all tasks: multi-agent review

Per the requesting-code-review flow, dispatch review across the full diff (all 4 tasks' commits together) before considering issue #36 done. Fix any findings, then re-verify `npm run lint && npm test && npm run build` all green.
