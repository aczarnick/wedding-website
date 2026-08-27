---
name: run-wedding-website
description: Build, run, and drive the wedding website (Next.js). Use when asked to start the dev server, run or screenshot the site, verify UI changes in a real browser, or interact with the running app.
---

Static Next.js 16 wedding site. Start the dev server, then drive it headlessly
with `.claude/skills/run-wedding-website/driver.mjs` — a Playwright script that
uses the machine's installed Google Chrome (`playwright-core` +
`channel: 'chrome'`, no browser download). There is no `chromium-cli` on this
machine; the driver is the harness.

All paths are relative to the repo root.

## Prerequisites

- Node ≥ 20 (verified with v24.13.0)
- Google Chrome installed at `/Applications/Google Chrome.app`

## Setup

```bash
npm install   # includes playwright-core (devDependency)
```

## Run (agent path)

Start the dev server in the background and poll the port — macOS has no
`timeout` command, so use a shell loop:

```bash
npm run dev > /tmp/wedding-dev.log 2>&1 &
echo $! > /tmp/wedding-dev.pid
for i in $(seq 1 30); do curl -sf http://localhost:3000 >/dev/null && { echo SERVER_UP; break; }; sleep 1; done
```

Then drive it:

```bash
node .claude/skills/run-wedding-website/driver.mjs smoke
node .claude/skills/run-wedding-website/driver.mjs shot /rsvp --mobile
```

| command | what it does |
|---|---|
| `smoke` | Full flow: home hero + client-side countdown, click FAQs nav link and verify scroll, `/rsvp` page, open the mobile nav drawer. Screenshots each step, fails (exit 1) on any console error. Prints `SMOKE PASSED`. |
| `shot <path> [--mobile]` | Navigate to `<path>`, wait for network idle, screenshot. `--mobile` uses a 390×844 viewport. |

Screenshots land in `.claude/skills/run-wedding-website/screenshots/`
(gitignored). `BASE_URL` env var overrides `http://localhost:3000`.
**Actually open the screenshots** — a passing exit code plus an unviewed
screenshot proves nothing.

Stop the server when done:

```bash
kill $(cat /tmp/wedding-dev.pid)   # or: pkill -f 'next dev'
```

## Run (human path)

```bash
npm run dev   # → http://localhost:3000, Ctrl-C to stop
```

## Test

No test suite. The verification gate is:

```bash
npm run lint && npm run build
```

Both pass clean; `next build` prerenders `/`, `/registry`,
`/_not-found` as static.

## Gotchas

- **Nav links exist twice in the DOM** — desktop bar and mobile drawer both
  render every `NAV_LINKS` entry, so `getByRole('link', { name: 'FAQs' })`
  hits a strict-mode violation → filter with `.filter({ visible: true })`
  (the driver's `visibleLink()` helper).
- **No `<nav>` element** — the header is plain `div`s, so
  `getByRole('navigation')` matches nothing. Target links directly.
- **Mobile drawer waits lie twice.** Playwright counts the off-screen drawer
  as "visible" (it has a box, just translated off-canvas), and Tailwind v4's
  `translate-x-*` utilities use the CSS `translate` property — so
  `getComputedStyle(el).transform` is `'none'` and a `DOMMatrix`-based check
  passes vacuously. Both bugs produce a screenshot of a *closed* drawer with a
  green exit code. Wait on `getBoundingClientRect()` reaching the fully-open
  position (see the driver's `waitForFunction` in `smoke()`).
- **Countdown is client-side** — `HeroSection` renders ` ` until a
  `useEffect` fills it in. Wait for `/days to go/i` before hero screenshots.
- **Section "headings" are `<p>` tags** — e.g. the FAQ section is
  `<p>FAQs</p>` / `<p>GOOD TO KNOW</p>`. `getByRole('heading')` only finds
  the hero `<h1>Alex &amp; Claire</h1>`.

## Troubleshooting

- **`command not found: timeout`**: macOS has no GNU coreutils `timeout`.
  Use the `for … curl … sleep` poll loop above.
- **`Cannot find package 'playwright-core'`**: run `npm install` — it's a
  devDependency, not globally installed.
