import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('PDF.js extracts actual quantity and specification from synthetic selectable-text PDF', async () => {
  const data = new Uint8Array(await readFile(new URL('../fixtures/synthetic-scope.pdf', import.meta.url)));
  const document = await getDocument({ data, isEvalSupported: false, standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replace(/[\\/]?$/, '/') }).promise;
  try {
    assert.equal(document.numPages, 1);
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.filter(item => 'str' in item).map(item => item.str).join('\n');
    assert.match(text, /Supply and install 120 m of 150 mm cable tray\./);
    assert.match(text, /Include electrical testing and commissioning\./);
  } finally { await document.destroy(); }
});
