# Hero Image Resize + Size Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resize the 20 MB hero background image to a web-appropriate size, and add a permanent, CI-enforced guardrail so an oversized image can never be committed to `public/images` again.

**Architecture:** A committed guardrail script (`scripts/check-image-sizes.mjs`) checks every file under `public/images` against width/height/file-size thresholds using the `image-size` library. It's written and wired into `npm`/CI *first*, against the current 20 MB file, so it visibly fails — that failure is the proof the check works. Then a throwaway script (not committed) uses the `sharp` library already present in `node_modules` to resize the hero image in place, after which the guardrail passes.

**Tech Stack:** Node.js (`fs`, `path` built-ins), `image-size` (new devDependency, dimension reads only), `sharp` (already present transitively via `next`, used only for the one-off resize, never imported by committed code), GitHub Actions (existing `ci.yml`).

## Global Constraints

- `MAX_WIDTH_PX = 2600`, `MAX_HEIGHT_PX = 2600`, `MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024` (1 MiB) — exact thresholds from the spec.
- Resize target: 2560px wide, JPEG mozjpeg quality ~82, EXIF stripped, auto-rotated per original EXIF orientation before stripping.
- No new dependency for the one-off resize (`sharp` already present via `next`'s optional dependency). Exactly one new devDependency for the permanent guardrail (`image-size`).
- `npm run build` must pass with zero errors; `npm run lint` must pass, before any task is considered done (per project `CLAUDE.md`).
- Full repo path: `/Users/aczarnick/personal/repos/wedding-website`.

---

### Task 1: Guardrail script (written and proven against the current oversized file)

**Files:**
- Create: `scripts/check-image-sizes.mjs`
- Modify: `package.json` (add `check:images` script and `image-size` devDependency)

**Interfaces:**
- Produces: an executable script at `scripts/check-image-sizes.mjs`, runnable as `node scripts/check-image-sizes.mjs`, exit code 0 on success / 1 on any violation. Later tasks (2 and 3) invoke it via `npm run check:images` and rely on this exit-code contract.

- [ ] **Step 1: Install the new devDependency**

Run: `npm install --save-dev image-size@^2.0.2`

Expected: `package.json` gains `"image-size": "^2.0.2"` under `devDependencies`, and `package-lock.json` is updated.

- [ ] **Step 2: Write the guardrail script**

Create `scripts/check-image-sizes.mjs`:

```js
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { imageSizeFromFile } from 'image-size/fromFile';

const IMAGES_DIR = 'public/images';
const MAX_WIDTH_PX = 2600;
const MAX_HEIGHT_PX = 2600;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

const toMiB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

async function checkImage(filePath) {
  const violations = [];
  const { size } = statSync(filePath);
  const { width, height } = await imageSizeFromFile(filePath);

  if (width > MAX_WIDTH_PX || height > MAX_HEIGHT_PX) {
    violations.push(
      `${filePath}: ${width}x${height}px exceeds ${MAX_WIDTH_PX}x${MAX_HEIGHT_PX}px`
    );
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    violations.push(
      `${filePath}: ${toMiB(size)} MiB exceeds ${toMiB(MAX_FILE_SIZE_BYTES)} MiB`
    );
  }
  return violations;
}

const files = readdirSync(IMAGES_DIR).map((name) => join(IMAGES_DIR, name));
const results = await Promise.all(files.map(checkImage));
const violations = results.flat();

if (violations.length > 0) {
  console.error('Image size check failed:');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(`Image size check passed (${files.length} file(s) checked).`);
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"check:images": "node scripts/check-image-sizes.mjs"
```

- [ ] **Step 4: Run it and verify it FAILS against the current 20 MB file**

Run: `npm run check:images`

Expected output (exit code 1):

```
Image size check failed:
  - public/images/trees-handhold.jpg: 6720x4480px exceeds 2600x2600px
  - public/images/trees-handhold.jpg: 20.50 MiB exceeds 1.00 MiB
```

This is the proof the guardrail actually detects the problem it's meant to catch — equivalent to a failing test before the fix.

- [ ] **Step 5: Lint the new script**

Run: `npm run lint`

Expected: no errors. If ESLint flags anything (e.g. Node globals), fix in `scripts/check-image-sizes.mjs` directly — do not add an ESLint ignore for the file.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/check-image-sizes.mjs
git commit -m "Add image size guardrail script (fails on current oversized hero image)"
```

---

### Task 2: Resize the hero image

**Files:**
- Modify (binary): `public/images/trees-handhold.jpg`
- Create then delete (throwaway, never committed): `resize-hero.tmp.mjs` at the repo root

**Interfaces:**
- Consumes: `npm run check:images` from Task 1 (exit code contract) to verify success.
- Produces: `public/images/trees-handhold.jpg` at 2560px wide, under 1 MiB — the file Task 3's CI wiring will validate on every future PR.

- [ ] **Step 1: Write the throwaway resize script**

Create `resize-hero.tmp.mjs` at the repo root (placed here, not in the scratchpad, so the bare `sharp` import resolves against the project's own `node_modules` without needing an absolute path):

```js
import sharp from 'sharp';

const SOURCE = 'public/images/trees-handhold.jpg';
const TARGET_WIDTH = 2560;

await sharp(SOURCE)
  .rotate() // auto-orient per EXIF before stripping metadata
  .resize({ width: TARGET_WIDTH })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(SOURCE + '.tmp');

console.log('Resized. Replacing original...');
```

Note: `sharp` can't read from and write to the same path in one pipeline, hence the `.tmp` suffix.

- [ ] **Step 2: Run it**

Run: `node resize-hero.tmp.mjs && mv public/images/trees-handhold.jpg.tmp public/images/trees-handhold.jpg`

Expected: script prints `Resized. Replacing original...` and the `.tmp` file is moved into place with no error.

- [ ] **Step 3: Verify size and dimensions on disk**

Run: `file public/images/trees-handhold.jpg && ls -la public/images/trees-handhold.jpg`

Expected: `JPEG image data, ... 2560x1707` (or similar 2560-wide, EXIF-orientation-corrected dimensions, no Exif/TIFF block reported by `file` since metadata was stripped), and file size well under 1 MiB (a few hundred KB expected).

- [ ] **Step 4: Run the guardrail and verify it now PASSES**

Run: `npm run check:images`

Expected:

```
Image size check passed (3 file(s) checked).
```

- [ ] **Step 5: Delete the throwaway resize script and confirm it's gone**

Run: `rm resize-hero.tmp.mjs && git status --short`

Expected: `resize-hero.tmp.mjs` does not appear in `git status` output (it never gets staged or committed — it's a one-off tool, not part of the codebase). Only `public/images/trees-handhold.jpg` should show as modified.

- [ ] **Step 6: Build and visually verify in a browser**

Run: `npm run build && npm run dev`

Then open `http://localhost:3000` in a browser (or use `claude-in-chrome` tooling) at both a desktop width (e.g. 1440px) and a mobile width (e.g. 390px). Confirm:
- The hero image renders immediately (no long blank-area delay before the image appears).
- The image is crisp, not pixelated or blurry, at both widths.
- No layout shift or distortion compared to before the resize.

Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add public/images/trees-handhold.jpg
git commit -m "Resize hero image from 20MB/6720x4480 to ~2560px wide, strip EXIF"
```

---

### Task 3: Wire the guardrail into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run check:images` (Task 1).

- [ ] **Step 1: Add the CI step**

In `.github/workflows/ci.yml`, in the `app` job, add a step after `npm run lint` and before `npm run build`:

```yaml
      - run: npm run lint
      - run: npm run check:images
      - run: npm run build
```

- [ ] **Step 2: Verify the full local sequence matches CI**

Run: `npm ci && npm run lint && npm run check:images && npm run build`

Expected: all four commands exit 0, in that order, with no manual intervention.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Enforce image size guardrail in CI"
```

---

## Definition of Done (post-implementation)

Per the user's request, implementation is not complete until:
1. All three tasks above are committed with passing verification steps.
2. The work is reviewed by multiple independent agents (dispatch via the `code-review` skill and at least one additional independent review pass) and any findings are triaged/addressed.
3. Tests exist: satisfied by `scripts/check-image-sizes.mjs` as a CI-enforced regression check (per the spec's Testing section — this repo has no test runner, so this script *is* the test).
