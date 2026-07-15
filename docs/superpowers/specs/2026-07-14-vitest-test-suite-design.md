# Design: vitest + RTL test suite (GitHub issue #36)

## Problem

The repo has no test suite. There's real, cheaply-testable logic with no coverage:

- `src/utils/dateUtils.ts` — `DaysUntilWedding()` date-boundary behavior
- `src/components/Header.tsx` — route-vs-hash link resolution (`getHref`/`isRouteLink`)
- No smoke test proving the landing page renders without throwing

## Goals

- Add vitest + React Testing Library, wired to run via `npm test`
- Unit tests for `DaysUntilWedding` covering the day-boundary cases
- Tests proving `Header`'s nav links resolve to the correct `href` per link
- A smoke test that renders the landing page (`src/app/page.tsx`) without mocking `next/image`
- `npm test` runs as a step in the existing CI `app` job
- Basic coverage reporting (`npm run test:coverage`), no enforced threshold

## Non-goals

- Exporting Header's internal helpers for direct unit testing (tests render `<Header/>` instead — see Decisions)
- Mobile drawer accessibility/focus-trap behavior (issue #37)
- Enforcing a coverage threshold or gating CI on it
- Resizing `trees-handhold.jpg` (issue #32) or any other production source change

## Decisions

### 1. Test Header's link logic by rendering, not by exporting internals

`getHref`/`isRouteLink` in `Header.tsx` are local, unexported functions. Rather than exporting them purely to make them unit-testable, tests render the real `<Header/>` and assert on the rendered `href` attributes. This exercises actual behavior a browser would produce and requires no production-code changes.

Consequence: each `NAV_LINKS` entry renders twice in the DOM (desktop nav `div.hidden.md:contents` and the mobile drawer both map over `NAV_LINKS` using the same `getHref`/`isRouteLink` calls — Tailwind's `md:hidden`/`hidden md:contents` responsive classes have no effect in jsdom, since no CSS is loaded). Tests use `getAllByRole('link', { name })` and assert every match has the expected `href`, rather than assuming a single match per link.

### 2. Real `next/image` rendering, with an asset-import shim (not a component mock)

The landing page smoke test renders `HeroSection` (imports the 21MB `trees-handhold.jpg` via `next/image` with `fill`) and `EventSection` (imports `ring-shot.jpg`/`lift-bar.jpg` via `next/image` *without* `fill` or explicit `width`/`height`, relying on the imported module being a `StaticImageData` object).

Vite's default static-asset handling resolves `.jpg` imports to a plain URL string, not a `{ src, width, height }` object. Passed as-is to the real `next/image` component, `EventSection`'s non-`fill` usage would throw at render time (`next/image` requires width/height when not using `fill`).

Fix: a Vite `resolve.alias` in `vitest.config.ts` redirects `*.jpg`/`*.png` imports to a stub module exporting `{ src: '/mock-image.jpg', width: 100, height: 100 }` — the same technique as Jest's `moduleNameMapper` image mocks. This keeps `next/image`'s real component logic, `Header`, `EventSection`, and `HeroSection` all executing their real code paths; only the underlying binary asset content is swapped out, avoiding a 21MB decode on every test run. `next/image` itself is not mocked.

### 3. Test file placement: colocated `*.test.ts(x)`

No prior test convention exists in this repo. Colocated test files (`dateUtils.test.ts` next to `dateUtils.ts`, etc.) are the modern default and keep tests discoverable next to what they cover, consistent with the codebase's existing "one file, one responsibility" organization.

### 4. `npm test` is single-run (CI-safe); coverage is a separate opt-in script

- `"test": "vitest run"` — single pass, used both locally and in CI
- `"test:coverage": "vitest run --coverage"` — local/manual use; not added to CI since there's no threshold to gate on

### 5. CI: test step in the existing `app` job, after lint, before build

`.github/workflows/ci.yml`'s `app` job gets a `- run: npm test` step between `npm run lint` and `npm run build` — cheapest/fastest checks fail first. No new job; tests reuse the same `npm ci` install already run for lint/build.

## Test plan

| File | Cases |
|---|---|
| `src/utils/dateUtils.test.ts` | `vi.setSystemTime()` fake-timer boundaries: exactly on wedding day → `"Today is the day!"`; 1 day before → `"1 Day to go!"`; N days before (N > 1) → `"N Days to go!"`; after the wedding date → `""` |
| `src/components/Header.test.tsx` | Render `<Header/>`; for each `NAV_LINKS` entry assert every rendered link (desktop + mobile) has the correct `href`: `/#Details`, `/#Travel`, `/#FAQs` (hash links), `/registry`, `/gallery` (route links) |
| `src/app/page.test.tsx` | Render `<Home/>` (default export of `page.tsx`); assert no throw and key content present: `"Alex & Claire"`, `"Ceremony"`, `"Reception"`, `"Travel Recommendations"`, `"FAQs"` |

## New/changed files

- `vitest.config.ts` (new)
- `vitest.setup.ts` (new)
- `test/mocks/imageMock.ts` (new) — the `{ src, width, height }` stub used by the asset-import alias
- `src/utils/dateUtils.test.ts` (new)
- `src/components/Header.test.tsx` (new)
- `src/app/page.test.tsx` (new)
- `package.json` — new devDependencies, `test`/`test:coverage` scripts
- `.github/workflows/ci.yml` — new `npm test` step in the `app` job
