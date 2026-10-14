import type { Analysis, Documents } from './types';
import { buildClarificationText } from './review';

export async function readDocument(file: File): Promise<{ text: string; note?: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB.');
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > 40) throw new Error('Choose a PDF with 40 pages or fewer.');
      const pages: string[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        let current = ''; const lines: string[] = [];
        for (const item of content.items) {
          if (!('str' in item)) continue;
          current += (current && !current.endsWith(' ') ? ' ' : '') + item.str;
          if (item.hasEOL) { if (current.trim()) lines.push(current.trim()); current = ''; }
        }
        if (current.trim()) lines.push(current.trim());
        pages.push(lines.join('\n'));
      }
      const text = pages.join('\n');
      if (text.trim().length < 20) throw new Error('This PDF has little readable text. Scanned PDFs need OCR first. You can paste the text instead.');
      if (text.length > 20000) throw new Error('Extracted text exceeds 20,000 characters. Import a smaller excerpt.');
      return { text, note: 'PDF text extracted in your browser. Check reading order, quantities and tables before comparing. Evidence refers to these extracted lines, not PDF page numbers.' };
    } finally { await pdf.destroy(); }
  }
  if (!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('Choose a text file (.txt, .md, .csv) or a text-based PDF.');
  const text = await file.text();
  if (text.length > 20000) throw new Error('Document exceeds 20,000 characters. Import a smaller excerpt.');
  return { text };
}

function saveFile(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportReview(documents: Documents, result: Analysis, reviewed: Set<string>) {
  const report = {
    product: 'ScopeCheck', project: documents.projectName,
    notice: 'Review aid only. Reviewed does not mean resolved. Coverage is a tentative text match, not proof of contractual completeness or safety compliance.',
    ...result,
    findings: result.findings.map(f => ({ ...f, reviewed: reviewed.has(f.id) })),
    documents,
  };
  saveFile(JSON.stringify(report, null, 2), `${documents.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'scopecheck'}-review.json`, 'application/json');
}

export function exportQuestions(documents: Documents, result: Analysis, reviewed: Set<string>) {
  saveFile(buildClarificationText(documents, result, reviewed), `${documents.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'scopecheck'}-clarifications.txt`, 'text/plain;charset=utf-8');
}
