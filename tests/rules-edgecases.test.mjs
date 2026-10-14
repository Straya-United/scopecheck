import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRules, extractQuantities, sourceLines } from '../server/analysis.mjs';

const expectClarification = (scope, quote) => {
  const result = analyzeRules(scope, quote);
  assert.equal(result.findings[0]?.kind, 'clarification', `${scope} / ${quote}`);
  assert.equal(result.coverage[0].status, 'unclear');
  assert.ok(!result.findings.some(({ kind }) => kind === 'quantity'));
  return result;
};

test('incompatible and unsupported units never become linear/count arithmetic', () => {
  for (const unit of ['ft', 'feet', 'm²', 'm2', 'm^2', 'square metres', 'sqm', 'cases', 'packs', 'boxes']) {
    expectClarification('Supply 120 m cable tray.', `Supply 80 ${unit} cable tray.`);
    expectClarification(`Supply 120 ${unit} cable tray.`, 'Supply 80 m cable tray.');
    expectClarification(`Supply 120 ${unit} cable tray.`, `Supply 120 ${unit} cable tray.`);
  }
  expectClarification('Supply 12 units LED luminaires.', 'Supply 8 cases LED luminaires.');
  for (const text of ['80 m² cable tray', '80 m2 cable tray', '80 m^2 cable tray', '80 m³ cable tray', '80 m/s cable tray']) {
    assert.deepEqual(extractQuantities(text), [], text);
  }
});

test('ranges, approximate values, alternatives and split allowances need clarification', () => {
  for (const amount of ['80-120 m', '80–120 m', '80 — 120 m', '80 to 120 m', 'between 80 and 120 m', 'approx. 120 m', 'about 120 m', 'circa 120 m', '~120 m', 'up to 120 m', 'at least 120 m', '120 m ± 5 m', '120 m +/- 5%', '120 m or 80 m', '120 m provisional']) {
    expectClarification('Supply 120 m cable tray.', `Supply ${amount} cable tray.`);
    expectClarification(`Supply ${amount} cable tray.`, 'Supply 120 m cable tray.');
  }
  expectClarification('Supply 120 m cable tray.', 'Supply 80 m cable tray.\nSupply 40 m cable tray.');
});

test('unsafe, signed, malformed and overly precise numbers are never silently accepted', () => {
  for (const amount of ['-120', '- 120', '−120', '+120', '1,20', '1.2.3', '1 200', '1e3', '0.0000001', '120.0000001', '9007199254740993', '9'.repeat(350), 'NaN', 'Infinity', '0']) {
    const text = `Supply ${amount} m cable tray.`;
    assert.deepEqual(extractQuantities(text), [], text);
    expectClarification(text, text);
    expectClarification('Supply 120 m cable tray.', text);
  }
});

test('exact supported decimal differences never round down to zero', () => {
  const result = analyzeRules('Supply 0.300001 m cable tray.', 'Supply 0.3 m cable tray.');
  assert.equal(result.findings[0].kind, 'quantity');
  assert.match(result.findings[0].summary, /difference is 0\.000001 m/);
  const ordinary = analyzeRules('Supply 0.3 m cable tray.', 'Supply 0.1 m cable tray.');
  assert.match(ordinary.findings[0].summary, /difference is 0\.2 m/);
});

test('dimension and rating tokens cannot supply procurement quantities', () => {
  for (const text of ['Cable tray width: 3 m', 'Cable tray height 2 m', 'Cable tray 3 m long sections', 'Cable tray 3 m × 2 m', 'Cable tray 3 m x 2', 'Cable tray 3 x 2 m', 'Socket outlets 230 V', 'LED luminaires 36 W']) {
    assert.deepEqual(extractQuantities(text), [], text);
  }
  expectClarification('Supply 120 m cable tray.', 'Supply cable tray width: 80 m.');
});

test('exclusion sections preserve exact heading context and reset at inclusions', () => {
  const scope = 'Provide electrical testing and commissioning.\nSupply 12 LED luminaires.';
  const quote = 'Quotation:\r\n  Exclusions:  \r\n\r\nElectrical testing and commissioning.\r\nInclusions:\r\nSupply 12 LED luminaires.';
  const result = analyzeRules(scope, quote);
  assert.equal(result.findings[0]?.kind, 'exclusion');
  assert.equal(result.coverage[0].status, 'attention');
  assert.equal(result.coverage[1].status, 'covered');
  assert.deepEqual(result.findings[0].quoteEvidence, [
    { line: 2, text: '  Exclusions:  ' },
    { line: 4, text: 'Electrical testing and commissioning.' },
  ]);
  for (const evidence of result.findings[0].quoteEvidence) assert.equal(evidence.text, sourceLines(quote)[evidence.line - 1].text);
});

test('scope exclusions are scope qualifications rather than positive requirements', () => {
  const result = analyzeRules('Exclusions:\nElectrical testing and commissioning.', 'Electrical testing and commissioning included.');
  assert.equal(result.findings[0]?.kind, 'clarification');
  assert.match(result.findings[0].summary, /scope itself/i);
  assert.deepEqual(result.findings[0].scopeEvidence, [
    { line: 1, text: 'Exclusions:' },
    { line: 2, text: 'Electrical testing and commissioning.' },
  ]);
});

test('matching exclusions cannot be hidden behind the four-line evidence cap', () => {
  const result = analyzeRules('Provide electrical testing and commissioning.', [
    ...Array(5).fill('Electrical testing and commissioning included.'),
    'Exclusions:',
    'Electrical testing and commissioning.',
  ].join('\n'));
  assert.equal(result.findings[0]?.kind, 'exclusion');
  assert.ok(result.findings[0].quoteEvidence.some(({ line }) => line === 6));
  assert.ok(result.findings[0].quoteEvidence.some(({ line }) => line === 7));
});

test('an unmatched requirement is phrased as a candidate gap, not proven omission', () => {
  const result = analyzeRules('Remove and dispose of redundant cable tray.', 'Supply 120 m new cable tray.');
  assert.equal(result.findings[0].kind, 'missing');
  assert.match(result.findings[0].title, /not matched|no quote match/i);
  assert.match(result.findings[0].summary, /not proof/);
});

test('expanded area notation and mixed-unit dimensions still block arithmetic', () => {
  for (const unit of ['m squared', 'metres squared', 'm sq.', 'square feet', 'sq ft', 'm cubed', 'cu m']) {
    expectClarification('Supply 120 m cable tray.', `Supply 80 ${unit} cable tray.`);
    expectClarification(`Supply 80 ${unit} cable tray.`, `Supply 80 ${unit} cable tray.`);
  }
  for (const text of ['Cable tray 300 mm × 2 m', 'Cable tray 300mm×2m', 'Cable tray 3 cm × 2 m']) {
    assert.deepEqual(extractQuantities(text), [], text);
    expectClarification('Supply 120 m cable tray.', text);
  }
});

test('fractional unit counts and estimated unitless quantities remain unresolved', () => {
  for (const scope of ['Supply 1.5 units LED luminaires.', 'Supply approximately 120 cable tray.', 'Supply 80 to 120 cable tray.']) {
    expectClarification(scope, scope);
  }
});

test('unclassified numeric allowances require units rather than silently matching', () => {
  for (const [needed, quoted] of [['120', '80'], ['120 kg', '80 kg'], ['120kg', '80kg'], ['120km', '80km'], ['120 (m)', '80 (m)'], ['120(m)', '80(m)'], ['.5 m', '.3 m']]) {
    expectClarification(`Supply ${needed} cable tray.`, `Supply ${quoted} cable tray.`);
    expectClarification(`Supply ${needed} cable tray.`, `Supply ${needed} cable tray.`);
  }
});

test('non-procurement prices and known specifications do not contaminate quantity checks', () => {
  for (const price of ['$1,200.00', '£120', '€120', 'USD 120', '120 USD', 'price: 120']) {
    const result = analyzeRules('Supply 120 m cable tray.', `Supply 80 m cable tray, ${price}.`);
    assert.equal(result.findings[0]?.kind, 'quantity', price);
  }
  for (const specification of ['300 mm', '23 cm', '230 V', '36 W']) {
    assert.equal(analyzeRules(`Supply ${specification} cable tray.`, `Supply ${specification} cable tray.`).findings.length, 0, specification);
  }
});

test('markdown and compound exclusion headings retain their exact source context', () => {
  for (const heading of ['**Exclusions:**', '**Exclusions**:', '## Exclusions:', '__Exclusions:__', 'Exclusions and qualifications:', '**Exclusions & Qualifications:**', 'Qualifications and exclusions:']) {
    const item = 'Provide electrical testing and commissioning.';
    const result = analyzeRules(item, `${heading}\n${item}`);
    assert.equal(result.findings[0]?.kind, 'exclusion', heading);
    assert.deepEqual(result.findings[0].quoteEvidence, [{ line: 1, text: heading }, { line: 2, text: item }]);
    assert.equal(analyzeRules(`${heading}\n${item}`, item).findings[0]?.kind, 'clarification', heading);
  }
});

test('warranty decimals never match a numeric tail and valid fractional years become months', () => {
  for (const duration of ['1.5-year', '0.5-year', '.5-year', '-3-year', '−3-year', '- 3-year', '2-3-year', '2 to 3 year', '2-year or 5-year', '9007199254740993-year', '1.2.3-year']) {
    expectClarification('Provide a 2-year workmanship warranty.', `Provide a ${duration} workmanship warranty.`);
  }
  assert.equal(analyzeRules('Provide an 18-month workmanship warranty.', 'Provide a 1.5-year workmanship warranty.').findings.length, 0);
  assert.equal(analyzeRules('Provide a 6-month workmanship warranty.', 'Provide a 0.5-year workmanship warranty.').findings.length, 0);
  for (const scope of ['Provide a -3-year workmanship warranty.', 'Provide a 2-year or 5-year workmanship warranty.']) {
    expectClarification(scope, 'Provide a 5-year workmanship warranty.');
  }
});
