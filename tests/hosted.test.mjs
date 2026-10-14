import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, getHostingConfig } from '../server/index.mjs';
import { RECOMMENDED_MODEL } from '../server/nebius.mjs';
import { scope, quote } from '../server/demo.mjs';
import { analyzeRules } from '../server/analysis.mjs';

const HOST = 'scopecheck.example.com';
const hostedEnv = { PUBLIC_HOSTS: HOST, NEBIUS_ENABLED: 'true', NEBIUS_API_KEY: 'synthetic-secret-for-tests', NEBIUS_MODEL: RECOMMENDED_MODEL, LIVE_PER_IP_PER_HOUR: '2', LIVE_DAILY_CAP: '3' };
const providerResponse = () => {
  const rules = analyzeRules(scope, quote);
  const value = { findings: rules.findings.map(({ source, ...f }) => f), coverage: rules.coverage, warnings: [] };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }));
};
async function withServer(options, task) {
  const server = createAppServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { return await task(port); } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
// fetch() cannot override Host, so use node:http for hosted-mode requests.
import http from 'node:http';
function call(port, { method = 'GET', path = '/api/health', host = HOST, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { host, ...headers } }, (res) => {
      let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: (() => { try { return JSON.parse(data); } catch { return null; } })() }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
const live = (port, ip, origin = `https://${HOST}`) => call(port, { method: 'POST', path: '/api/analyze', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: JSON.stringify({ scope, quote, mode: 'nebius' }) });

test('hosting config is local-only unless PUBLIC_HOSTS is set', () => {
  assert.equal(getHostingConfig({}).hosted, false);
  const h = getHostingConfig({ PUBLIC_HOSTS: ' ScopeCheck.Example.com , bad host!' });
  assert.equal(h.hosted, true); assert.deepEqual(h.publicHosts, ['scopecheck.example.com']);
});

test('hosted mode accepts only the configured public host and same-origin HTTPS', async () => {
  await withServer({ env: hostedEnv, fetchImpl: async () => providerResponse() }, async (port) => {
    const ok = await call(port);
    assert.equal(ok.status, 200); assert.equal(ok.headers['strict-transport-security'], 'max-age=31536000');
    assert.equal((await call(port, { host: 'evil.example.net', path: '/api/demo' })).status, 403);
    assert.equal((await call(port, { host: 'evil.example.net', path: '/' })).status, 403);
    assert.equal((await call(port, { host: '10.1.2.3:10000' })).status, 200, 'platform health probe on an internal host');
    assert.equal((await live(port, '1.1.1.1', 'https://evil.example.net')).status, 403);
    assert.equal((await live(port, '1.1.1.1', `http://${HOST}`)).status, 403);
  });
});

test('local mode still rejects public hostnames', async () => {
  await withServer({ env: {} }, async (port) => {
    assert.equal((await call(port, { host: HOST })).status, 403);
  });
});

test('hosted live calls are limited per client and per day', async () => {
  let calls = 0;
  await withServer({ env: hostedEnv, fetchImpl: async () => { calls += 1; return providerResponse(); } }, async (port) => {
    assert.equal((await live(port, '1.1.1.1')).status, 200);
    assert.equal((await live(port, '1.1.1.1')).status, 200);
    const third = await live(port, '1.1.1.1');
    assert.equal(third.status, 429); assert.equal(third.json.error.code, 'CLIENT_LIMIT');
    assert.equal((await live(port, '2.2.2.2')).status, 200);
    const capped = await live(port, '3.3.3.3');
    assert.equal(capped.status, 429); assert.equal(capped.json.error.code, 'DAILY_LIMIT');
    assert.equal(calls, 3);
  });
});
