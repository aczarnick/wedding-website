#!/usr/bin/env node
// Headless-browser driver for the wedding website dev server.
// Usage (run from repo root, dev server already listening on :3000):
//   node .claude/skills/run-wedding-website/driver.mjs smoke
//   node .claude/skills/run-wedding-website/driver.mjs shot <path> [--mobile]
// Screenshots land in .claude/skills/run-wedding-website/screenshots/

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

mkdirSync(SHOT_DIR, { recursive: true });

const consoleErrors = [];

async function launchPage(viewport) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { browser, page };
}

async function screenshot(page, name) {
  const file = join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`screenshot: ${file}`);
}

function reportConsoleErrors() {
  if (consoleErrors.length === 0) {
    console.log('console: no errors');
    return;
  }
  console.error(`console: ${consoleErrors.length} error(s)`);
  for (const err of consoleErrors) console.error(`  ${err}`);
  process.exitCode = 1;
}

function visibleLink(page, name) {
  return page.getByRole('link', { name }).filter({ visible: true });
}

async function smoke() {
  const { browser, page } = await launchPage(DESKTOP);

  await page.goto(BASE_URL);
  await page.getByRole('heading', { name: 'Alex & Claire' }).waitFor();
  // Countdown renders client-side in a useEffect; wait for it to fill in.
  await page.getByText(/days to go/i).waitFor();
  await screenshot(page, 'home-desktop');

  // Nav links exist twice in the DOM (desktop bar + hidden mobile drawer);
  // filter to the visible one to satisfy strict mode.
  await visibleLink(page, 'FAQs').click();
  await page.getByText('Good to know').waitFor();
  await page.waitForFunction(() => window.scrollY > 0);
  await screenshot(page, 'faqs-scrolled');

  await page.goto(`${BASE_URL}/gallery`);
  await page.getByText('Coming Soon').waitFor();
  await screenshot(page, 'gallery');
  await browser.close();

  const mobile = await launchPage(MOBILE);
  await mobile.page.goto(BASE_URL);
  await mobile.page.getByRole('button', { name: 'Open mobile menu' }).click();
  // The drawer slides in via the CSS `translate` property (Tailwind v4), and
  // Playwright counts off-screen elements as visible — so wait for the
  // drawer's bounding rect to reach its fully-open position.
  await mobile.page.waitForFunction(() => {
    const drawer = document.querySelector('div.fixed.w-64');
    if (!drawer) return false;
    const rect = drawer.getBoundingClientRect();
    return rect.left <= window.innerWidth - rect.width + 0.5;
  });
  await screenshot(mobile.page, 'home-mobile-drawer');
  await mobile.browser.close();

  reportConsoleErrors();
  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
}

async function shot(path, isMobile) {
  const { browser, page } = await launchPage(isMobile ? MOBILE : DESKTOP);
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
  const name = `shot${path.replace(/[^a-z0-9]+/gi, '-')}${isMobile ? '-mobile' : ''}`;
  await screenshot(page, name);
  await browser.close();
  reportConsoleErrors();
}

const [command, ...args] = process.argv.slice(2);
if (command === 'smoke') {
  await smoke();
} else if (command === 'shot' && args[0]) {
  await shot(args[0], args.includes('--mobile'));
} else {
  console.error('usage: driver.mjs smoke | shot <path> [--mobile]');
  process.exit(2);
}
