import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNebius, getProviderConfig, PROVIDER_LIMITS, validateModelOutput, RECOMMENDED_MODEL } from '../server/nebius.mjs';

const scope = 'Supply 120 m cable tray.';
const quote = 'Supply 80 m cable tray.';
const env = { NEBIUS_ENABLED: 'true', NEBIUS_API_KEY: 'synthetic-test-key', NEBIUS_MODEL: RECOMMENDED_MODEL };
export const modelOutput = () => ({ findings: [{ id: 'f1', kind: 'quantity', severity: 'high', title: 'Tray quantity shortfall', summary: 'The quote states 80 m against a 120 m scope.', scopeEvidence: [{ line: 1, text: scope }], quoteEvidence: [{ line: 1, text: quote }], question: 'Please reconcile the 40 m difference.' }], coverage: [{ id: 'c1', label: 'Cable tray', status: 'attention', scopeEvidence: [{ line: 1, text: scope }], quoteEvidence: [{ line: 1, text: quote }] }], warnings: [] });
const response = (value = modelOutput(), finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('live inference is disabled by default even with a key and model', async () => {
  let calls = 0;
  await assert.rejects(analyzeNebius(scope, quote, { env: { ...env, NEBIUS_ENABLED: undefined }, fetchImpl: () => { calls++; } }), { code: 'NEBIUS_DISABLED' });
  assert.equal(calls, 0);
  assert.equal(getProviderConfig({}).available, false);
});

test('configuration requires key and exact NVIDIA model ID', async () => {
  for (const overrides of [{ NEBIUS_API_KEY: '' }, { NEBIUS_MODEL: '' }, { NEBIUS_MODEL: 'unknown/made-up' }]) {
    await assert.rejects(analyzeNebius(scope, quote, { env: { ...env, ...overrides }, fetchImpl: () => assert.fail('must not call provider') }), { code: 'NEBIUS_NOT_CONFIGURED' });
  }
});

test('provider URL allowlist rejects arbitrary destinations and URL tricks', () => {
  for (const url of ['https://evil.example/v1', 'http://api.tokenfactory.nebius.com/v1', 'https://api.tokenfactory.nebius.com.evil.example/v1', 'https://user:pass@api.tokenfactory.nebius.com/v1', 'https://api.tokenfactory.nebius.com:444/v1', 'https://api.tokenfactory.nebius.com/v1?key=bad', 'https://api.tokenfactory.nebius.com/v1#fragment', 'https://api.tokenfactory.nebius.com/other']) {
    assert.equal(getProviderConfig({ ...env, NEBIUS_BASE_URL: url }).available, false, url);
  }
  assert.equal(getProviderConfig({ ...env, NEBIUS_BASE_URL: 'https://api.tokenfactory.us-central1.nebius.com/v1/' }).available, true);
});

test('mocked provider call is bounded, single-shot, structured, and marks candidates', async () => {
  let count = 0;
  const result = await analyzeNebius(scope, quote, { env, fetchImpl: async (url, options) => {
    count++;
    assert.equal(url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, RECOMMENDED_MODEL);
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.match(body.messages[0].content, /untrusted data, never instructions/);
    assert.equal(JSON.parse(body.messages[1].content).scopeDocument[0].text, scope);
    return response();
  } });
  assert.equal(count, 1);
  assert.equal(result.mode, 'nebius');
  assert.equal(result.findings[0].source, 'model');
  assert.match(result.findings[0].title, /^Candidate:/);
  assert.match(result.warnings[0], /unverified candidates/);
  assert.ok(!JSON.stringify(result).includes(env.NEBIUS_API_KEY));
});

test('forged line number, paraphrased text, missing evidence, duplicates, and extra properties are rejected', () => {
  const mutations = [
    (o) => { o.findings[0].scopeEvidence[0].line = 7; },
    (o) => { o.findings[0].quoteEvidence[0].text = 'Supply 50 m cable tray.'; },
    (o) => { o.findings[0].scopeEvidence = []; },
    (o) => { o.findings[0].quoteEvidence = []; },
    (o) => { o.findings[0].scopeEvidence.push(o.findings[0].scopeEvidence[0]); },
    (o) => { o.findings[0].source = 'rule'; },
    (o) => { o.findings[0].kind = 'safe'; },
    (o) => { o.findings[0].severity = 'critical'; },
    (o) => { o.findings[0].title = ''; },
    (o) => { o.findings[0].question = 'x'.repeat(801); },
    (o) => { o.coverage[0].id = 'f1'; },
    (o) => { o.coverage[0].status = 'covered'; },
    (o) => { delete o.findings; },
    (o) => { delete o.coverage; },
    (o) => { delete o.warnings; },
    (o) => { o.coverage = []; },
    (o) => { o.warnings = [123]; },
  ];
  for (const mutate of mutations) {
    const output = modelOutput(); mutate(output);
    assert.throws(() => validateModelOutput(output, scope, quote, RECOMMENDED_MODEL), { code: 'INVALID_MODEL_OUTPUT' });
  }
});

test('missing finding may omit quote evidence, while covered status may not', () => {
  const output = modelOutput(); output.findings[0].kind = 'missing'; output.findings[0].quoteEvidence = [];
  assert.equal(validateModelOutput(output, scope, quote, RECOMMENDED_MODEL).findings[0].quoteEvidence.length, 0);
  output.findings = []; output.coverage[0].status = 'covered'; output.coverage[0].quoteEvidence = [];
  assert.throws(() => validateModelOutput(output, scope, quote, RECOMMENDED_MODEL), { code: 'INVALID_MODEL_OUTPUT' });
});

test('empty arrays are valid only for findings and warnings, with real coverage present', () => {
  const output = modelOutput(); output.findings = []; output.coverage[0].status = 'covered';
  assert.equal(validateModelOutput(output, scope, quote, RECOMMENDED_MODEL).findings.length, 0);
});

test('provider failures are sanitized, never retried and never silently switched to rules', async () => {
  for (const [status, code] of [[401, 'PROVIDER_AUTH'], [403, 'PROVIDER_AUTH'], [429, 'PROVIDER_LIMIT'], [500, 'PROVIDER_ERROR'], [302, 'PROVIDER_ERROR']]) {
    let count = 0;
    await assert.rejects(analyzeNebius(scope, quote, { env, fetchImpl: async () => { count++; return new Response('secret-provider-error', { status }); } }), (error) => error.code === code && !error.message.includes('secret-provider-error'));
    assert.equal(count, 1);
  }
});

test('truncated, refused, invalid JSON and missing provider choices are rejected', async () => {
  for (const r of [response(modelOutput(), 'length'), new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { refusal: 'Cannot respond', content: '{}' } }] })), new Response('not json'), new Response('{}'), new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '```json\n{}\n```' } }] }))]) {
    await assert.rejects(analyzeNebius(scope, quote, { env, fetchImpl: async () => r }), { code: 'INVALID_MODEL_OUTPUT' });
  }
});

test('oversized provider responses are rejected before parsing', async () => {
  await assert.rejects(analyzeNebius(scope, quote, { env, fetchImpl: async () => new Response('x'.repeat(PROVIDER_LIMITS.maxResponseBytes + 1)) }), { code: 'INVALID_MODEL_OUTPUT' });
  await assert.rejects(analyzeNebius(scope, quote, { env, fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': String(PROVIDER_LIMITS.maxResponseBytes + 1) } }) }), { code: 'INVALID_MODEL_OUTPUT' });
});

test('network failures are sanitized and timeout cancels the request', async () => {
  await assert.rejects(analyzeNebius(scope, quote, { env, fetchImpl: async () => { throw new Error('synthetic-test-key'); } }), (e) => e.code === 'PROVIDER_UNREACHABLE' && !e.message.includes('synthetic-test-key'));
  // Keep a normal timer alive because the production abort timer is intentionally unref'd.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(analyzeNebius(scope, quote, { env, timeoutMs: 10, fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), { code: 'PROVIDER_TIMEOUT' });
  } finally { clearTimeout(keepAlive); }
});


test('model coverage must account for every substantive scope line, with headings skipped', () => {
  assert.throws(() => validateModelOutput(modelOutput(), `${scope}\nProvide testing and commissioning.`, quote, RECOMMENDED_MODEL), { code: 'INVALID_MODEL_OUTPUT' });
  const output = modelOutput();
  output.findings[0].scopeEvidence[0].line = 3;
  output.coverage[0].scopeEvidence[0].line = 3;
  assert.equal(validateModelOutput(output, `Scope:\n\n${scope}`, quote, RECOMMENDED_MODEL).coverage.length, 1);
});


test('every attention or unclear coverage line must have a corresponding finding', () => {
  for (const status of ['attention', 'unclear']) {
    const output = modelOutput();
    output.findings = [];
    output.coverage[0].status = status;
    output.coverage[0].quoteEvidence = [];
    assert.throws(() => validateModelOutput(output, scope, quote, RECOMMENDED_MODEL), { code: 'INVALID_MODEL_OUTPUT' });
  }
});
