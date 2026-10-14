import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer, API_LIMITS } from '../server/index.mjs';
import { RECOMMENDED_MODEL } from '../server/nebius.mjs';
import { scope, quote } from '../server/demo.mjs';
import { analyzeRules } from '../server/analysis.mjs';

const input = { scope, quote, mode: 'rules' };
const enabledEnv = { NEBIUS_ENABLED: 'true', NEBIUS_API_KEY: 'synthetic-secret-for-tests', NEBIUS_MODEL: RECOMMENDED_MODEL };
const providerResponse = () => {
  const rules = analyzeRules(scope, quote);
  const value = { findings: rules.findings.map(({ source, ...f }) => f), coverage: rules.coverage, warnings: [] };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }));
};
async function withServer(options, task) {
  const server = createAppServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { return await task(url); } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
const post = (url, value = input, headers = {}) => fetch(`${url}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });

test('health and demo routes expose no secrets and the expected app contract', async () => {
  await withServer({ env: enabledEnv }, async (url) => {
    const health = await (await fetch(`${url}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.deepEqual(health.nebius, { enabled: true, configured: true, available: true, model: RECOMMENDED_MODEL });
    assert.equal(health.limits.maxDocumentChars, 20000);
    assert.ok(!JSON.stringify(health).includes(enabledEnv.NEBIUS_API_KEY));
    const demo = await (await fetch(`${url}/api/demo`)).json();
    assert.equal(demo.scope, scope); assert.equal(demo.quote, quote); assert.ok(demo.projectName);
  });
});

test('rules API end-to-end returns five findings and four covered requirements', async () => {
  await withServer({ env: {} }, async (url) => {
    const res = await post(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const analysis = await res.json();
    assert.equal(analysis.findings.length, 5);
    assert.equal(analysis.coverage.filter((c) => c.status === 'covered').length, 4);
  });
});

test('API rejects invalid JSON, wrong media type, invalid inputs and oversized body', async () => {
  await withServer({ env: {} }, async (url) => {
    const malformed = await fetch(`${url}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
    const plain = await fetch(`${url}/api/analyze`, { method: 'POST', body: JSON.stringify(input) });
    assert.equal(plain.status, 415);
    const empty = await post(url, { ...input, scope: '' }); assert.equal(empty.status, 400);
    const huge = await post(url, { ...input, padding: 'x'.repeat(API_LIMITS.maxBodyBytes) }); assert.equal(huge.status, 413);
    const lineLimit = await post(url, { ...input, quote: 'q\n'.repeat(251) }); assert.equal(lineLimit.status, 400);
  });
});

test('API does not silently fall back when live mode is disabled', async () => {
  let calls = 0;
  await withServer({ env: { ...enabledEnv, NEBIUS_ENABLED: 'false' }, fetchImpl: () => { calls++; } }, async (url) => {
    const res = await post(url, { ...input, mode: 'nebius' });
    assert.equal(res.status, 503); assert.equal((await res.json()).error.code, 'NEBIUS_DISABLED');
    assert.equal(calls, 0);
  });
});

test('origin and hostname safeguards block browser cross-site use', async () => {
  await withServer({ env: {} }, async (url) => {
    for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      const res = await post(url, input, headers); assert.equal(res.status, 403, JSON.stringify(headers));
    }
    const hostStatus = await new Promise((resolve, reject) => {
      const request = http.request(`${url}/api/health`, { headers: { Host: 'evil.example' } }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(hostStatus, 403);
    assert.equal((await post(url, input, { Origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await post(url, input, { Origin: url })).status, 200);
  });
});

test('unknown API and unsupported method are JSON errors', async () => {
  await withServer({ env: {} }, async (url) => {
    assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
    assert.equal((await fetch(`${url}/api/analyze`)).status, 404);
    assert.equal((await fetch(`${url}/`, { method: 'DELETE' })).status, 405);
  });
});

test('mocked live API is rate-limited without retries', async () => {
  let calls = 0;
  await withServer({ env: enabledEnv, nowMs: () => 1000, fetchImpl: async () => { calls++; return providerResponse(); } }, async (url) => {
    for (let i = 0; i < 5; i++) {
      const res = await post(url, { ...input, mode: 'nebius' });
      assert.equal(res.status, 200); assert.equal((await res.json()).mode, 'nebius');
    }
    const limited = await post(url, { ...input, mode: 'nebius' });
    assert.equal(limited.status, 429); assert.equal((await limited.json()).error.code, 'RATE_LIMIT');
    assert.equal(calls, 5);
    assert.equal((await post(url)).status, 200);
  });
});

test('live session cap persists even after minute windows expire', async () => {
  let time = 0; let calls = 0;
  await withServer({ env: enabledEnv, nowMs: () => (time += 61_000), fetchImpl: async () => { calls++; return providerResponse(); } }, async (url) => {
    for (let i = 0; i < API_LIMITS.liveRequestsPerSession; i++) assert.equal((await post(url, { ...input, mode: 'nebius' })).status, 200);
    const limited = await post(url, { ...input, mode: 'nebius' });
    assert.equal((await limited.json()).error.code, 'SESSION_LIMIT');
    assert.equal(calls, 20);
  });
});

test('concurrent live calls are limited and failed call releases its slot', async () => {
  let release; let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  await withServer({ env: enabledEnv, fetchImpl: async () => { calls++; started(); if (calls === 1) return new Promise((resolve) => { release = resolve; }); return providerResponse(); } }, async (url) => {
    const first = post(url, { ...input, mode: 'nebius' });
    await ready;
    const second = await post(url, { ...input, mode: 'nebius' });
    assert.equal(second.status, 429); assert.equal((await second.json()).error.code, 'LIVE_BUSY');
    release(new Response('secret-upstream-error', { status: 500 }));
    assert.equal((await first).status, 502);
    assert.equal((await post(url, { ...input, mode: 'nebius' })).status, 200);
    assert.equal(calls, 2);
  });
});

test('production static handler serves the SPA but not secrets, missing assets or symlink escapes', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'scopecheck-test-'));
  try {
    const dist = path.join(temp, 'dist'); await mkdir(dist);
    await writeFile(path.join(dist, 'index.html'), '<html>ScopeCheck</html>');
    await writeFile(path.join(dist, 'app.js'), 'console.log("safe")');
    await writeFile(path.join(dist, 'pdf.worker.mjs'), 'export const ready = true;');
    await writeFile(path.join(temp, 'private.js'), 'secret');
    await symlink(path.join(temp, 'private.js'), path.join(dist, 'escape.js'));
    await withServer({ env: {}, distDir: dist }, async (url) => {
      const homepage = await fetch(`${url}/`); assert.equal(homepage.status, 200); assert.match(await homepage.text(), /ScopeCheck/);
      assert.equal((await fetch(`${url}/review/123`)).status, 200);
      assert.equal((await fetch(`${url}/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
      assert.equal((await fetch(`${url}/pdf.worker.mjs`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
      for (const requested of ['/escape.js', '/.env', '/%2e%2e%2fprivate.js', '/missing.js']) assert.equal((await fetch(`${url}${requested}`)).status, 404, requested);
      assert.equal(await (await fetch(`${url}/app.js`, { method: 'HEAD' })).text(), '');
    });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
