import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import scenarios from '../server/scenarios.mjs';
import { analyzeRules, sourceLines } from '../server/analysis.mjs';
import { createAppServer } from '../server/index.mjs';

test('four fictional scenarios have distinct expected outcomes with exact line evidence', () => {
  assert.equal(scenarios.length, 4);
  assert.equal(new Set(scenarios.map(scenario => scenario.id)).size, 4);
  const expected = [
    { findings: ['quantity', 'exclusion', 'missing', 'clarification', 'clarification'], covered: 4 },
    { findings: [], covered: 4 },
    { findings: ['clarification', 'clarification', 'clarification'], covered: 1 },
    { findings: ['exclusion', 'exclusion', 'clarification', 'clarification'], covered: 1 },
  ];
  scenarios.forEach((scenario, index) => {
    const result = analyzeRules(scenario.scope, scenario.quote);
    assert.deepEqual(result.findings.map(finding => finding.kind), expected[index].findings, scenario.id);
    assert.equal(result.coverage.filter(item => item.status === 'covered').length, expected[index].covered, scenario.id);
    for (const item of [...result.findings, ...result.coverage]) {
      for (const e of item.scopeEvidence) assert.equal(e.text, sourceLines(scenario.scope)[e.line - 1].text);
      for (const e of item.quoteEvidence) assert.equal(e.text, sourceLines(scenario.quote)[e.line - 1].text);
    }
  });
});

test('scenario catalog is available over the local API without provider calls', async () => {
  const server = createAppServer({ env: {}, fetchImpl: async () => { throw new Error('No provider call should happen'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/demos`);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), scenarios);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
