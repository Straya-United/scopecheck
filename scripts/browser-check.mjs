// Real-browser QA on Treyn's PC: starts the built app with live AI enabled, drives Chrome, saves screenshots.
// Usage: node --env-file=.env scripts/browser-check.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const PORT = 8799;
const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), NEBIUS_ENABLED: 'true' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
fs.mkdirSync('shots', { recursive: true });
const errors = [];
const b = await chromium.launch({ channel: 'chrome' });
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'shots/1-rules-desktop.png', fullPage: true });
  await p.getByRole('button', { name: /Configure AI|Run AI|AI/ }).first().click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/2-ai-modal.png' });
  const t0 = Date.now();
  await p.getByRole('button', { name: 'Send documents & run AI' }).click();
  await p.waitForFunction(() => /Nebius AI/.test(document.body.innerText) && !document.querySelector('.loading-bar'), null, { timeout: 90000 });
  console.log(`live run in UI: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'shots/3-nemotron-desktop.png', fullPage: true });
  const footer = await p.locator('.inspector-footer').innerText().catch(() => '');
  console.log('footer:', footer.replace(/\s+/g, ' '));
  console.log('findings:', await p.locator('.model-label').count(), 'AI-labelled (selected panel)');
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  m.on('pageerror', (e) => errors.push(e.message));
  await m.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(800);
  await m.screenshot({ path: 'shots/4-mobile.png', fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('mobile horizontal overflow px:', overflow);
} finally {
  await b.close(); srv.kill();
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
}
