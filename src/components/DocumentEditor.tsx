import { useRef, useState } from 'react';
import { FileUp, LoaderCircle } from 'lucide-react';
import Modal from './Modal';
import { readDocument } from '../files';
import type { Documents } from '../types';

export default function DocumentEditor({ initial, isNew, onClose, onRun, onDemo, busy, externalError }: { initial: Documents; isNew: boolean; onClose: () => void; onRun: (data: Documents) => void; onDemo: () => void; busy: boolean; externalError: string }) {
  const [data, setData] = useState<Documents>(isNew ? { projectName: '', scope: '', quote: '' } : initial);
  const [error, setError] = useState(''); const [note, setNote] = useState(''); const [reading, setReading] = useState<string | null>(null);
  const scopeFile = useRef<HTMLInputElement>(null); const quoteFile = useRef<HTMLInputElement>(null);
  const maxLength = 20000;
  async function importFile(file: File | undefined, side: 'scope' | 'quote') {
    if (!file) return;
    setError(''); setNote(''); setReading(side);
    try { const result = await readDocument(file); setData(d => ({ ...d, [side]: result.text })); if (result.note) setNote(result.note); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read the document.'); }
    finally { setReading(null); }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (data.scope.trim().length < 20 || data.quote.trim().length < 20) { setError('Add at least 20 characters to both documents. Put one scope item per line where possible.'); return; }
    if (data.scope.length > maxLength || data.quote.length > maxLength) { setError('Keep each document within 20,000 characters.'); return; }
    for (const side of ['scope', 'quote'] as const) {
      const lines = data[side].split(/\r\n|\n|\r/);
      if (lines.length > 250 || lines.some(line => line.length > 2000)) { setError(`${side === 'scope' ? 'Scope' : 'Quote'} must have at most 250 lines, with no more than 2,000 characters on each line. Your draft is kept here for editing.`); return; }
    }
    setError('');
    onRun({ ...data, projectName: data.projectName.trim() || 'Untitled review' });
  }
  return <Modal title={isNew ? 'Start a new review' : 'Edit your documents'} onClose={onClose} wide>
    <form onSubmit={submit}>
      <p className="muted modal-intro">Paste text or import a text-based PDF. Your documents stay in this review session and are sent only to the local rule checker.</p>
      <label className="field-label" htmlFor="project-name">Project name</label>
      <input id="project-name" className="text-input" value={data.projectName} onChange={e => setData({ ...data, projectName: e.target.value })} maxLength={100} placeholder="e.g. Riverside fit-out" disabled={busy} />
      <div className="editor-grid">{(['scope', 'quote'] as const).map(side => <div className="editor-column" key={side}>
        <div className="editor-label"><label htmlFor={`document-${side}`}>{side === 'scope' ? 'Scope of works' : 'Supplier quote'}</label>
          <button type="button" className="text-button" disabled={reading !== null || busy} onClick={() => (side === 'scope' ? scopeFile : quoteFile).current?.click()}>{reading === side ? <LoaderCircle className="spin" /> : <FileUp />} Import file</button></div>
        <input ref={side === 'scope' ? scopeFile : quoteFile} type="file" accept=".pdf,.txt,.md,.csv" className="visually-hidden" tabIndex={-1} aria-label={`Import ${side} file`} onChange={e => { void importFile(e.target.files?.[0], side); e.target.value = ''; }} />
        <textarea id={`document-${side}`} value={data[side]} onChange={e => setData({ ...data, [side]: e.target.value })} placeholder={side === 'scope' ? 'Supply and install 120 m of cable tray.\nInclude testing and commissioning.' : 'Supply and install 80 m of cable tray.\nTesting and commissioning excluded.'} spellCheck={false} maxLength={maxLength} disabled={busy} />
        <span className="input-help">{data[side].length.toLocaleString()} / 20,000 characters · PDF or text, up to 5 MB</span>
      </div>)}</div>
      {note && <p className="notice info" role="status">{note}</p>}
      {(error || externalError) && <p className="notice error" role="alert">{error || externalError}</p>}
      <div className="modal-actions"><button type="button" className="text-button" onClick={onDemo} disabled={busy}>Use fictional demo</button><div><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={reading !== null || busy}>{busy ? 'Comparing…' : 'Compare documents'}</button></div></div>
      <p className="privacy-note">Rule-based review does not use AI. Changes replace the current result and reset review marks. No automatic storage.</p>
    </form>
  </Modal>;
}
