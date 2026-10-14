import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClarificationText } from '../src/review';
import { analyzeRules } from '../server/analysis.mjs';
import scenarios from '../server/scenarios.mjs';
import { exportQuestions, exportReview } from '../src/files';

test('clarification export includes questions, exact line evidence and honest review status', () => {
  const demo = scenarios[0]; const result = analyzeRules(demo.scope, demo.quote);
  const text = buildClarificationText(demo, result, new Set([result.findings[0].id]));
  assert.match(text, /Rule-based review; no AI call made/);
  assert.match(text, /Reviewed, not resolved/);
  assert.match(text, /Omission unconfirmed/);
  assert.match(text, /has not been sent to a supplier/);
  for (const finding of result.findings) {
    assert.ok(text.includes(finding.question));
    for (const evidence of finding.scopeEvidence) assert.ok(text.includes(`Scope line ${evidence.line}: ${evidence.text}`));
    for (const evidence of finding.quoteEvidence) assert.ok(text.includes(`Quote line ${evidence.line}: ${evidence.text}`));
  }
  assert.match(text, /no matching source line cited/);
});

test('clean quote export contains no invented clarification', () => {
  const demo = scenarios[1]; const result = analyzeRules(demo.scope, demo.quote);
  assert.equal(result.findings.length, 0);
  const text = buildClarificationText(demo, result, new Set());
  assert.match(text, /No clarification findings were generated/);
  assert.doesNotMatch(text, /Question:/);
  assert.match(text, /does not establish complete scope or safety compliance/);
});

test('both export actions create local downloads with no network transmission', async () => {
  const demo = scenarios[0]; const result = analyzeRules(demo.scope, demo.quote);
  const blobs: Blob[] = []; const filenames: string[] = [];
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousCreate = URL.createObjectURL; const previousRevoke = URL.revokeObjectURL; const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() { filenames.push(this.download); } }) } });
  URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return `blob:scopecheck-${blobs.length}`; };
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async () => { throw new Error('Exports must not make network requests.'); };
  try {
    const reviewed = new Set([result.findings[0].id]);
    exportReview(demo, result, reviewed); exportQuestions(demo, result, reviewed);
    assert.deepEqual(filenames, ['riverside-fit-out-review.json', 'riverside-fit-out-clarifications.txt']);
    assert.equal(blobs.length, 2);
    const json = JSON.parse(await blobs[0].text());
    assert.equal(json.documents.scope, demo.scope); assert.equal(json.documents.quote, demo.quote);
    assert.equal(json.findings[0].reviewed, true); assert.equal(json.findings[1].reviewed, false);
    assert.ok((await blobs[1].text()).includes(result.findings[0].scopeEvidence[0].text));
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete (globalThis as any).document;
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; globalThis.fetch = previousFetch;
  }
});
