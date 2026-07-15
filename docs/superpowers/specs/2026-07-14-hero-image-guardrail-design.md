# Hero image resize + size guardrail

Ticket: [#32](https://github.com/aczarnick/wedding-website/issues/32) — Resize `trees-handhold.jpg` (20 MB, 6720×4480) to a web-appropriate size.

## Problem

`public/images/trees-handhold.jpg`, the hero background on the landing page, is 20 MB at 6720×4480. `next/image` serves optimized AVIF/WebP derivatives to the browser, but the optimizer must decode the full 20 MB source on every cold request, which is slow and memory-hungry on a small container, and the hero renders as a blank area while loading. It's also 20 MB of dead weight in the repo. There is currently no automated guard against this recurring (both other images in `public/images` are already reasonably sized, but nothing stops a future oversized image from being committed).

## Scope

1. Resize the source image in place to a web-appropriate size.
2. Add a permanent, CI-enforced guardrail script so an oversized image can't be committed again.
3. Wire the guardrail into `npm run` scripts and CI.

Out of scope: adding a formal test runner (vitest/RTL) for the wider project — tracked separately in issue #36. Not pulling that in here; the guardrail script is a plain Node script, not a test-runner test.

## Design

### 1. One-off resize

- Tool: `sharp`, already present in `node_modules` as an optional (transitive) dependency of `next` itself (used for Next's own image optimizer). No new dependency needed for this step.
- Run via a throwaway Node script (not committed — written to the scratchpad, executed once, then deleted).
- Transform: auto-rotate per EXIF orientation, strip all metadata (EXIF/GPS/camera info — also a minor privacy win), resize to 2560px wide (matches the hero's `sizes="100vw"` usage on large desktop viewports, per Next's own image device-size breakpoints), re-encode as JPEG with mozjpeg at quality ~82.
- Output overwrites `public/images/trees-handhold.jpg` in place.
- Expected result: well under 1 MB, comparable to the repo's other two images (`lift-bar.jpg` 273 KB, `ring-shot.jpg` 193 KB, both 1024×1536).

### 2. Guardrail script (permanent)

New file: `scripts/check-image-sizes.mjs`.

- Scans all files under `public/images/**`.
- For each file, reads:
  - byte size via Node's built-in `fs.statSync`
  - pixel width/height via a new devDependency, `image-size` — a small, pure-JS library that parses just the image header (no native binaries), appropriate for a dimensions-only check as opposed to pulling in `sharp` (a heavy multi-platform native image-processing library) as an explicit dependency just to read a width/height.
- Thresholds, as named constants at the top of the script:
  - `MAX_WIDTH_PX = 2600`
  - `MAX_HEIGHT_PX = 2600`
  - `MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024` (1 MiB)
  - (Buffer above the 2560px resize target / expected few-hundred-KB output; both existing images at 1024×1536 pass comfortably today.)
- Behavior: check every file, collect *all* violations (don't stop at the first), print them, and `process.exit(1)` if any exist; otherwise print a success line and exit 0.
- Error handling: a corrupt/unreadable image should fail loud — let `image-size`'s parse error propagate rather than being swallowed.

### 3. Wiring

- `package.json`: add `"check:images": "node scripts/check-image-sizes.mjs"`.
- `.github/workflows/ci.yml`: add a step in the `app` job, after `npm run lint` and before `npm run build`.

## Testing

This ticket is an asset change with no application logic, so "tests written" is satisfied by the guardrail script itself:

- The guardrail script is the automated, CI-enforced check — it runs on every PR from now on and would have caught the original 20 MB file. It's the regression test for this class of bug.
- Manual verification (not automated, but required before calling this done): confirm the resized file's size/dimensions on disk, run `npm run build`, and visually check the hero renders crisply on both desktop and mobile widths in a browser.

## Alternatives considered

- **`sharp` as an explicit devDependency for both resize and guardrail.** Rejected: promotes a multi-platform native binary package to an explicit, CI-required dependency just to read image dimensions, which is heavier than the job requires. `image-size` is a tiny, purpose-built alternative for the read-only check.
- **macOS `sips` for the resize + a hand-rolled JPEG/PNG header parser for the guardrail (zero new dependencies).** Rejected: `sips` is macOS-only and not reproducible on Linux CI or by other contributors if this ever needs to be redone; hand-rolling an image header parser reinvents what a small, well-maintained library (`image-size`) already does correctly.
