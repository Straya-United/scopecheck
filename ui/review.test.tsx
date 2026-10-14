import { test, afterEach } from 'node:test';
import React from 'react';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { analyzeRules } from '../server/analysis.mjs';
import demo from '../server/demo.mjs';
import scenarios from '../server/scenarios.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:8787' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'MutationObserver', 'Node']) Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as any)[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).React = React;
(dom.window.HTMLDialogElement.prototype as any).showModal = function () { this.setAttribute('open', ''); };
(dom.window.HTMLDialogElement.prototype as any).close = function () { this.removeAttribute('open'); };
let clipboard = ''; Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text: string) => { clipboard = text; } } });
let failNext = false;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.endsWith('/api/demo')) return Response.json(demo);
  if (url.endsWith('/api/demos')) return Response.json(scenarios);
  if (url.endsWith('/api/health')) return Response.json({ ok: true, nebius: { enabled: false, configured: false, available: false, model: null }, limits: { maxDocumentChars: 20000, maxLines: 250 } });
  if (url.endsWith('/api/analyze')) {
    if (failNext) { failNext = false; return Response.json({ error: { code: 'TEST_FAILURE', message: 'The local review server is temporarily unavailable.' } }, { status: 503 }); }
    const { scope, quote } = JSON.parse(options?.body as string); return Response.json(analyzeRules(scope, quote));
  }
  throw new Error(`Unexpected fetch: ${url}`);
};
const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
const { default: App } = await import('../src/App');
afterEach(() => { cleanup(); failNext = false; });
async function ready() { render(<App />); await screen.findByRole('heading', { name: 'Riverside fit-out', exact: true }); }

test('demo renders actual findings, evidence, review/filter and clipboard states', async () => {
  await ready();
  assert.equal(document.querySelectorAll('.finding-row').length, 5);
  assert.match(screen.getByLabelText('Evidence inspector').textContent!, /40 m/);
  fireEvent.click(screen.getByRole('button', { name: 'Copy question', exact: true }));
  await waitFor(() => assert.match(clipboard, /120 m/));
  fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed', exact: true }));
  assert.match(document.querySelector('.review-footer')!.textContent!, /1 of 5/);
  fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'reviewed' } });
  assert.equal(document.querySelectorAll('.finding-row').length, 1);
  fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'covered' } });
  assert.equal(document.querySelectorAll('.finding-row').length, 4);
  assert.match(screen.getByLabelText('Evidence inspector').textContent!, /Review note/);
});

test('new review recomputes from entered text and AI remains disabled', async () => {
  await ready(); fireEvent.click(screen.getByRole('button', { name: 'New review', exact: true }));
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Workshop revision' } });
  fireEvent.change(screen.getByLabelText('Scope of works'), { target: { value: 'Supply and install 10 LED luminaires, including mounting brackets.' } });
  fireEvent.change(screen.getByLabelText('Supplier quote', { exact: true }), { target: { value: 'Supply and install 7 LED luminaires, including mounting brackets.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare documents', exact: true }));
  await screen.findByRole('heading', { name: 'Workshop revision', exact: true });
  assert.equal(document.querySelectorAll('.finding-row').length, 1);
  assert.match(screen.getByLabelText('Evidence inspector').textContent!, /3 units/);
  fireEvent.click(screen.getByRole('button', { name: 'Configure AI', exact: true }));
  await screen.findByText('Live AI is disabled', { exact: true });
  assert.equal((screen.getByRole('button', { name: 'Send documents & run AI' }) as HTMLButtonElement).disabled, true);
});

test('API failures preserve draft and inline validation catches line limits', async () => {
  await ready(); fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
  const scope = screen.getByLabelText('Scope of works') as HTMLTextAreaElement;
  fireEvent.change(scope, { target: { value: 'Supply and install 130 m of cable tray.' } });
  failNext = true; fireEvent.click(screen.getByRole('button', { name: 'Compare documents' }));
  await waitFor(() => assert.match(within(screen.getByRole('dialog')).getByRole('alert').textContent!, /temporarily unavailable/));
  assert.equal(scope.value, 'Supply and install 130 m of cable tray.');
  fireEvent.change(scope, { target: { value: Array.from({ length: 251 }, () => 'A scope line.').join('\n') } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare documents' }));
  assert.match(within(screen.getByRole('dialog')).getByRole('alert').textContent!, /at most 250 lines/);
  assert.equal(scope.value.split('\n').length, 251);
});

test('carriage-return source documents retain consistent line numbering', async () => {
  const { default: SourcePanel } = await import('../src/components/SourcePanel');
  render(<SourcePanel documents={{ projectName: 'CR example', scope: 'Heading\rSupply 120 m cable tray.', quote: 'Heading\rSupply 80 m cable tray.' }} scopeEvidence={[{ line: 2, text: 'Supply 120 m cable tray.' }]} quoteEvidence={[{ line: 2, text: 'Supply 80 m cable tray.' }]} onEdit={() => {}} jump={null} />);
  assert.match(document.querySelector('#source-scope-2')!.textContent!, /120 m/);
  assert.ok(document.querySelector('#source-scope-2')!.classList.contains('highlight'));
  assert.match(document.querySelector('#source-quote-2')!.textContent!, /80 m/);
});

test('fictional scenario selector recalculates clean matches and uncertain quantities', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed', exact: true }));
  fireEvent.change(screen.getByLabelText('Try a fictional scenario'), { target: { value: 'clean-lighting' } });
  await screen.findByRole('heading', { name: 'Workshop lighting · Matching quote', exact: true });
  assert.equal(document.querySelectorAll('.finding-row').length, 4);
  assert.equal((screen.getByLabelText('Filter findings') as HTMLSelectElement).value, 'covered');
  assert.match(document.querySelector('.review-footer')!.textContent!, /0 of 0/);
  assert.ok(screen.getByRole('button', { name: '0 Needs attention' }));
  fireEvent.change(screen.getByLabelText('Try a fictional scenario'), { target: { value: 'quantity-review' } });
  await screen.findByRole('heading', { name: 'Containment · Quantity review', exact: true });
  assert.equal(document.querySelectorAll('.finding-row').length, 3);
  assert.match(screen.getByLabelText('Evidence inspector').textContent!, /No conclusion yet/);
  assert.match(screen.getByLabelText('Evidence inspector').textContent!, /400 ft/);
});

test('export chooser describes both local formats and disclosure of source material', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Export review', exact: true }));
  const dialog = screen.getByRole('dialog');
  assert.match(dialog.textContent!, /Nothing is sent to a supplier/);
  assert.ok(within(dialog).getByRole('button', { name: /Download clarification checklist/ }));
  assert.ok(within(dialog).getByRole('button', { name: /Download full review JSON/ }));
});
