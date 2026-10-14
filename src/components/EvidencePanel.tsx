import { Check, Copy, FileSearch } from 'lucide-react';
import { useState } from 'react';
import type { Analysis, Evidence, Selection } from '../types';
import { findingBasis } from '../review';

function EvidenceBlock({ label, evidence, onJump }: { label: string; evidence: Evidence[]; onJump: (side: 'scope' | 'quote', line: number) => void }) {
  const side = label === 'Scope' ? 'scope' : 'quote';
  return <div className="evidence-block">{evidence.length ? evidence.map((e, index) => <div key={`${e.line}-${index}`}>
    <button className="evidence-label" onClick={() => onJump(side, e.line)} aria-label={`View ${label.toLowerCase()} line ${e.line}`}>{label} · Line {e.line}</button><p className="evidence-quote">{e.text}</p>
  </div>) : <><div className="evidence-label static">{label}</div><p className="evidence-quote absent">No matching source line cited. Check the complete document.</p></>}</div>;
}
export default function EvidencePanel({ result, selection, reviewed, onToggle, onConfigure, onJump }: { result: Analysis; selection: Selection | null; reviewed: Set<string>; onToggle: (id: string) => void; onConfigure: () => void; onJump: (side: 'scope' | 'quote', line: number) => void }) {
  const [copied, setCopied] = useState(false);
  const finding = selection?.type === 'finding' ? result.findings.find(f => f.id === selection.id) : null;
  const coverage = selection?.type === 'coverage' ? result.coverage.find(c => c.id === selection.id) : null;
  const selected = finding || coverage;
  async function copy() { if (!finding) return; try { await navigator.clipboard.writeText(finding.question); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }
  return <aside className="panel inspector" aria-label="Evidence inspector">
    {selected ? <div className="inspector-content" key={selection?.id}>
      <h2>{finding?.title || coverage?.label}</h2><p className="inspector-summary">{finding?.summary || 'Matching language found in the quote. Verify quantities, specifications and terms before relying on it.'}</p>
      {finding && <p className={`finding-basis ${finding.kind}`}>{findingBasis[finding.kind]}</p>}
      {finding?.source === 'model' && <p className="model-label">AI-suggested finding · Evidence validated, interpretation needs review</p>}
      <EvidenceBlock label="Scope" evidence={selected.scopeEvidence} onJump={onJump} /><EvidenceBlock label="Supplier quote" evidence={selected.quoteEvidence} onJump={onJump} />
      <div className="clarification"><h3>{finding ? 'Suggested clarification' : 'Review note'}</h3><p>{finding?.question || 'A text match does not establish contractual completeness. Check the source wording and any qualifications.'}</p>
        {finding && <div className="inspector-actions"><button className={`button ${reviewed.has(finding.id) ? 'reviewed' : 'primary'}`} onClick={() => onToggle(finding.id)}>{reviewed.has(finding.id) && <Check />}{reviewed.has(finding.id) ? 'Reviewed' : 'Mark reviewed'}</button><button className="button" onClick={() => void copy()}><Copy />{copied ? 'Copied' : 'Copy question'}</button></div>}
        {finding && reviewed.has(finding.id) && <p className="review-note">Reviewed in this session. The issue still needs resolution.</p>}
      </div>
    </div> : <div className="inspector-empty"><FileSearch /><h2>Select an item</h2><p>Open a finding or covered item to compare its source evidence.</p></div>}
    <div className="inspector-footer"><span>{result.mode === 'rules' ? 'Rule-based review · No AI call made' : `Nebius AI · ${result.model || 'NVIDIA Nemotron'}`}</span><button className="text-link" onClick={onConfigure}>{result.mode === 'rules' ? 'Configure AI' : 'AI details'}</button></div>
  </aside>;
}
