import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Documents, Evidence } from '../types';

export default function SourcePanel({ documents, scopeEvidence, quoteEvidence, onEdit, jump }: { documents: Documents; scopeEvidence: Evidence[]; quoteEvidence: Evidence[]; onEdit: () => void; jump: { side: 'scope' | 'quote'; line: number; time: number } | null }) {
  const [view, setView] = useState<'both' | 'scope' | 'quote'>('both');
  useEffect(() => {
    if (!jump) return;
    setView(jump.side);
    const timer = setTimeout(() => document.getElementById(`source-${jump.side}-${jump.line}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    return () => clearTimeout(timer);
  }, [jump]);
  return <section className="panel source-panel" aria-labelledby="source-heading">
    <div className="source-toolbar"><h2 id="source-heading">Document source</h2><div className="source-tabs" role="group" aria-label="Document view">{(['both', 'scope', 'quote'] as const).map(v => <button aria-pressed={view === v} className={view === v ? 'active' : ''} key={v} onClick={() => setView(v)}>{v === 'both' ? 'Both' : v === 'scope' ? 'Scope' : 'Supplier quote'}</button>)}</div><button className="text-button edit-button" onClick={onEdit}><Pencil />Edit text</button></div>
    <div className={`source-columns ${view !== 'both' ? 'single' : ''}`}>
      {(['scope', 'quote'] as const).filter(side => view === 'both' || view === side).map(side => <div className="source-column" key={side}>
        <h3>{side === 'scope' ? 'Scope' : 'Supplier quote'} <span>({documents.projectName})</span></h3>
        <div className="document-lines" tabIndex={0} aria-label={`${side} source lines`}>{documents[side].split(/\r\n|\n|\r/).map((line, index) => <div id={`source-${side}-${index + 1}`} className={`document-line ${(side === 'scope' ? scopeEvidence : quoteEvidence).some(e => e.line === index + 1) ? `highlight ${side}` : ''}`} key={index}><span className="line-number">{index + 1}</span><span>{line || ' '}</span></div>)}</div>
      </div>)}
    </div>
  </section>;
}
