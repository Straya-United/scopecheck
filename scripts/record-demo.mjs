// Records the hackathon demo: drives the real app (live Nemotron on Nebius) in Chrome at 1080p,
// narrates with Microsoft neural TTS (edge-tts), trims the model wait, mixes to video/scopecheck-demo.mp4.
// Usage: node --env-file=.env scripts/record-demo.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const PORT = 8798, BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve('video'), AUD = path.join(OUT, 'audio');
fs.mkdirSync(AUD, { recursive: true });
const FFMPEG = spawnSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).stdout.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const durationMs = (f) => { const m = spawnSync(FFMPEG, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return Math.round(((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000); };
function tts(text) {
  const file = path.join(AUD, `${String(++n).padStart(2, '0')}.mp3`);
  const spoken = text.replace(/Nemotron 3 Super/g, 'Nemotron three Super').replace(/JSON/g, 'Jason');
  const r = spawnSync('python', ['-m', 'edge_tts', '--voice', 'en-AU-WilliamMultilingualNeural', '--text', spoken, '--write-media', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('tts failed: ' + r.stderr);
  return { file, ms: durationMs(file), text };
}
const LINES = {
  open: 'Before a contractor accepts a supplier quote, someone has to check it against the scope, line by line. A missed exclusion or a short quantity becomes an argument later. This is ScopeCheck.',
  rules: 'It opens on a fictional electrical fit-out. The built-in rules run instantly, with no AI: five candidate gaps, each tied to the exact lines behind it.',
  ai: 'Now the AI review. ScopeCheck sends both documents, as numbered lines, to NVIDIA Nemotron 3 Super on Nebius Token Factory, with a strict JSON schema.',
  back: 'Nemotron answers in about twelve seconds. Before anything is shown, ScopeCheck checks every line it cites against the source, word for word, and rejects the whole answer if one does not match.',
  exclusion: 'Here, the quote excludes testing and commissioning. The scope line and the quote line sit side by side, with a clarification question ready to send.',
  review: 'The estimator copies the question and marks it reviewed. Reviewed does not mean resolved. The person stays in charge.',
  second: 'A second example, with exclusions and provisional allowances. Nemotron returns its own candidate gaps, and each one arrives with validated evidence from both documents.',
  export: 'Export a clarification checklist for the supplier, or the full review, labelled with the model that produced it.',
  close: 'ScopeCheck. Nemotron on Nebius does the reading. Exact evidence earns the trust. Open source, under the MIT licence.',
};
console.log('rendering narration…');
const clip = Object.fromEntries(Object.entries(LINES).map(([k, v]) => [k, tts(v)]));

const INIT = `(() => {
  const css = '#demoCap{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);max-width:960px;padding:12px 22px;border-radius:12px;background:rgba(15,23,42,.88);color:#F8FAFC;font:500 19px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35);z-index:99999;opacity:0;transition:opacity .25s}#demoCap.on{opacity:1}#demoNote{position:fixed;right:16px;bottom:8px;font:12px system-ui,sans-serif;color:#64748B;z-index:99999}';
  const add = () => { if (document.getElementById('demoCap')) return; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'demoCap'; document.body.appendChild(c);
    const t = document.createElement('div'); t.id = 'demoNote'; t.textContent = 'Fictional documents · live Nebius Token Factory calls · model wait shortened in editing'; document.body.appendChild(t); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
})();`;

const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), NEBIUS_ENABLED: 'true' }, stdio: 'inherit' });
await sleep(1500);
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, acceptDownloads: true, recordVideo: { dir: OUT, size: { width: 1440, height: 810 } } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await ctx.addInitScript(INIT);
const p = await ctx.newPage();
const t0 = Date.now(); const audio = []; const cuts = [];
await p.goto(BASE, { waitUntil: 'networkidle' });
await sleep(1200);
const tStart = Date.now() - t0;
const cap = (t) => p.evaluate((x) => { const c = document.getElementById('demoCap'); if (c) { c.textContent = x || ''; c.classList.toggle('on', !!x); } }, t);
async function say(key, extra = 300) { const c = clip[key]; await cap(c.text); audio.push({ file: c.file, at: Date.now() - t0 }); await sleep(c.ms + extra); await cap(''); }
async function sayWhile(key, action) { const c = clip[key]; await cap(c.text); audio.push({ file: c.file, at: Date.now() - t0 }); const s = Date.now(); await action(); const left = c.ms - (Date.now() - s); if (left > 0) await sleep(left + 300); await cap(''); }
async function nemotron() {
  await p.getByRole('button', { name: 'Review with Nemotron' }).click(); await sleep(1600);
  await p.getByRole('button', { name: 'Send documents & run AI' }).click();
  const from = Date.now() - t0;
  await p.waitForFunction(() => /Nebius AI/.test(document.querySelector('.inspector-footer')?.innerText || '') && !document.querySelector('.loading-bar'), null, { timeout: 90000 });
  cuts.push({ from: from + 1500, to: Date.now() - t0 - 200 });
  await sleep(500);
}

await say('open', 500);
await sayWhile('rules', async () => { await sleep(1500); await p.locator('.finding-row').nth(1).click(); await sleep(1800); await p.locator('.finding-row').nth(0).click(); });
await sayWhile('ai', async () => { await sleep(2500); });
await nemotron();
await say('back');
await sayWhile('exclusion', async () => { await p.locator('.finding-row').filter({ hasText: /testing/i }).first().click(); });
await sayWhile('review', async () => { await sleep(1200); await p.getByRole('button', { name: /Copy question/ }).click().catch(() => {}); await sleep(1500); await p.getByRole('button', { name: /Mark reviewed/ }).click().catch(() => {}); });
await p.selectOption('#scenario-select', { label: 'Fit-out · Exclusions and allowances' }).catch(async () => { const opts = await p.locator('#scenario-select option').allTextContents(); const pick = opts.find((o) => /allowance/i.test(o)); if (pick) await p.selectOption('#scenario-select', { label: pick }); });
await sleep(1800);
await nemotron();
await sayWhile('second', async () => { await sleep(2500); await p.locator('.finding-row').nth(1).click(); await sleep(2500); await p.locator('.finding-row').nth(2).click(); });
await sayWhile('export', async () => { await sleep(800); await p.getByRole('button', { name: /Export review/ }).click(); await sleep(2500); await p.keyboard.press('Escape'); });
await say('close', 1200);
const tEnd = Date.now() - t0;
const raw = await p.video().path();
await ctx.close(); await b.close(); srv.kill();

const keeps = []; let cursor = tStart;
for (const c of cuts.filter((c) => c.to > c.from)) { keeps.push([cursor, c.from]); cursor = c.to; }
keeps.push([cursor, tEnd]);
const shift = (at) => at - tStart - cuts.filter((c) => c.to <= at).reduce((a, c) => a + (c.to - c.from), 0);
const total = keeps.reduce((a, [s, e]) => a + (e - s), 0);
const outFile = path.join(OUT, 'scopecheck-demo.mp4');
const inputs = ['-i', raw]; audio.forEach((a) => inputs.push('-i', a.file));
const v = keeps.map(([s, e], i) => `[0:v]trim=start=${(s / 1000).toFixed(3)}:end=${(e / 1000).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
const vc = `${keeps.map((_, i) => `[v${i}]`).join('')}concat=n=${keeps.length}:v=1:a=0,scale=1920:1080:flags=lanczos[vout]`;
const a = audio.map((x, i) => { const d = Math.max(0, Math.round(shift(x.at))); return `[${i + 1}:a]adelay=${d}|${d}[a${i}]`; });
const filter = [...v, vc, ...a, `${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest,apad[aout]`].join(';');
const r = spawnSync(FFMPEG, ['-y', ...inputs, '-filter_complex', filter, '-map', '[vout]', '-map', '[aout]', '-t', (total / 1000).toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr.slice(-1500)); process.exit(1); }
console.log(`video: ${outFile} ${(total / 1000).toFixed(1)} s (raw ${((tEnd - tStart) / 1000).toFixed(1)} s, ${cuts.length} waits trimmed)`);
