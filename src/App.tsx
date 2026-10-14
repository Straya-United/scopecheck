import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Download, Info, LoaderCircle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { analyze, getDemos, getHealth } from './api';
import { exportQuestions, exportReview } from './files';
import type { Analysis, DemoScenario, Documents, Filter, Health, Selection } from './types';
import DocumentEditor from './components/DocumentEditor';
import FindingList from './components/FindingList';
import EvidencePanel from './components/EvidencePanel';
import SourcePanel from './components/SourcePanel';
import Modal from './components/Modal';

const emptyDocs: Documents = { projectName: 'Scope review', scope: '', quote: '' };

export default function App() {
  const [documents, setDocuments] = useState<Documents>(emptyDocs);
  const [result, setResult] = useState<Analysis | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [scenarioId, setScenarioId] = useState('riverside');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState(true); const [exported, setExported] = useState(false);
  const [jump, setJump] = useState<{ side: 'scope' | 'quote'; line: number; time: number } | null>(null);

  function acceptResult(data: Analysis) {
    setResult(data); setReviewed(new Set()); setFilter(data.findings.length ? 'all' : 'covered');
    setSelection(data.findings[0] ? { type: 'finding', id: data.findings[0].id } : data.coverage[0] ? { type: 'coverage', id: data.coverage[0].id } : null);
  }
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const [examples, status] = await Promise.all([getDemos(), getHealth()]);
        const demo = examples[0];
        if (!demo) throw new Error('No fictional scenarios were found.');
        const analysis = await analyze(demo, 'rules');
        if (active) { setDocuments(demo); setScenarios(examples); setScenarioId(demo.id); setHealth(status); acceptResult(analysis); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'The local server could not be reached.'); }
      finally { if (active) setBusy(false); }
    }
    void start(); return () => { active = false; };
  }, []);

  async function run(data: Documents, demo: boolean, mode: 'rules' | 'nebius' = 'rules', demoId = scenarioId) {
    setBusy(true); setError(''); setAiOpen(false);
    try { const analysis = await analyze(data, mode); setDocuments(data); setIsDemo(demo); setScenarioId(demo ? demoId : ''); acceptResult(analysis); setEditor(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'The review could not be completed.'); }
    finally { setBusy(false); }
  }
  async function loadDemo(id = 'riverside') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const examples = scenarios.length ? scenarios : await getDemos();
      const demo = examples.find(scenario => scenario.id === id);
      if (!demo) throw new Error('The requested fictional scenario was not found.');
      setScenarios(examples); await run(demo, true, 'rules', id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the demo.'); setBusy(false); }
  }
  function toggleReviewed(id: string) { setReviewed(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function chooseFilter(value: Filter) {
    setFilter(value);
    if (!result) return;
    if (value === 'covered') { const c = result.coverage.find(c => c.status === 'covered'); setSelection(c ? { type: 'coverage', id: c.id } : null); }
    else { const f = result.findings.find(f => value === 'all' || value === 'attention' && f.kind !== 'clarification' || value === 'clarification' && f.kind === 'clarification' || value === 'reviewed' && reviewed.has(f.id)); setSelection(f ? { type: 'finding', id: f.id } : null); }
  }
  const selected = selection?.type === 'finding' ? result?.findings.find(f => f.id === selection.id) : result?.coverage.find(c => c.id === selection?.id);
  function doExport(format: 'json' | 'text') { if (!result) return; if (format === 'json') exportReview(documents, result, reviewed); else exportQuestions(documents, result, reviewed); setExportOpen(false); setExported(true); setTimeout(() => setExported(false), 1800); }
  useEffect(() => { getHealth().then(setHealth).catch(() => { /* Health is refreshed when the AI dialog opens. */ }); }, []);
  async function openAi() { setAiOpen(true); try { setHealth(await getHealth()); } catch { /* Existing health can explain local setup. */ } }

  return <>
    <header className="app-header"><a className="brand" href="#" aria-label="ScopeCheck home"><svg width="25" height="26" viewBox="0 0 25 26" aria-hidden="true"><path d="M2 21V3h17v5H7v13zm9 5V12h14v5h-9v9z" fill="currentColor" /></svg><span>ScopeCheck</span></a><span className="header-divider" /><span className="workspace-label">Project workspace</span><div className="header-right"><span className="local-label">{health?.hosted ? 'Hosted demo · fictional documents' : 'Local review'}</span><button className="button primary" disabled={busy} onClick={() => setEditor('new')}>New review</button></div></header>
    <main className="main-shell">
      <nav className="breadcrumb" aria-label="Breadcrumb"><span>Reviews</span><ChevronRight /><span>{documents.projectName}</span></nav>
      <div className="page-heading"><div><h1>{documents.projectName}</h1><p>Compare the scope. Catch the gaps.</p></div><div className="heading-actions"><button className="button primary ai-button" disabled={!result || busy} onClick={() => void openAi()}><Sparkles />Review with Nemotron</button><button className="button export-button" disabled={!result || busy} onClick={() => setExportOpen(true)}><Download />{exported ? 'Exported' : 'Export review'}</button></div></div>
      <div className={`notice ${isDemo ? 'demo' : 'info'}`}><AlertTriangle /><span>{isDemo ? 'Synthetic demo · Fictional documents. Human review required.' : 'Human review required · Check source wording, specifications and terms before award.'}</span></div>
      {scenarios.length > 0 && <div className="scenario-bar"><div><label htmlFor="scenario-select">Try a fictional scenario</label><select id="scenario-select" disabled={busy} value={scenarioId} onChange={e => void loadDemo(e.target.value)}>{!isDemo && <option value="">Your documents</option>}{scenarios.map(s => <option key={s.id} value={s.id}>{s.projectName}</option>)}</select></div><p>{isDemo ? scenarios.find(s => s.id === scenarioId)?.description : 'Choosing a scenario replaces this session. Export first to keep your review.'}</p></div>}
      {error && <div className="notice error" role="alert"><AlertTriangle /><span>{error}{result ? ' Your previous review is still shown.' : ''}</span><button className="text-button" onClick={() => void loadDemo()}><RotateCcw />Retry demo</button></div>}
      {busy && <div className="loading-bar" role="status"><LoaderCircle className="spin" />{result ? 'Comparing documents. Your previous review is shown until this finishes.' : 'Loading the fictional review…'}</div>}
      {result && <>
        <div className={`workspace-grid ${busy ? 'busy' : ''}`} aria-busy={busy}>
          <FindingList result={result} filter={filter} setFilter={chooseFilter} selection={selection} onSelect={setSelection} reviewed={reviewed} />
          <EvidencePanel result={result} selection={selection} reviewed={reviewed} onToggle={toggleReviewed} onConfigure={() => void openAi()} onJump={(side, line) => setJump({ side, line, time: Date.now() })} />
        </div>
        <SourcePanel documents={documents} scopeEvidence={selected?.scopeEvidence || []} quoteEvidence={selected?.quoteEvidence || []} onEdit={() => { if (!busy) { setError(''); setEditor('edit'); } }} jump={jump} />
        <div className="review-footer"><span><ShieldCheck />{reviewed.size} of {result.findings.length} findings reviewed in this session</span><span>No automatic storage · Export to keep this review</span></div>
        <details className="limitations"><summary><Info />Review limitations</summary><p>ScopeCheck supports estimator review. It cannot establish contractual completeness, price adequacy, code compliance or safety. “Covered” means a candidate text match; “reviewed” does not mean resolved.</p>{result.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>
      </>}
      {!result && !busy && <section className="panel blank-state"><h2>Ready for a closer look</h2><p>Start the local server to compare your scope and quote, or retry the fictional demo.</p><button className="button primary" onClick={() => void loadDemo()}>Load demo</button></section>}
    </main>
    {editor && <DocumentEditor initial={documents} isNew={editor === 'new'} onClose={() => setEditor(null)} onRun={data => void run(data, false)} onDemo={() => void loadDemo()} busy={busy} externalError={error} />}
    {exportOpen && result && <Modal title="Export this review" onClose={() => setExportOpen(false)}>
      <p className="modal-intro">Save a copy on your device. Nothing is sent to a supplier. Both formats may include source text, so review before sharing.</p>
      <div className="export-options"><button className="export-option" onClick={() => doExport('text')}><strong>Download clarification checklist</strong><span>Plain text questions, exact evidence lines and review status.</span></button><button className="export-option" onClick={() => doExport('json')}><strong>Download full review JSON</strong><span>All findings, coverage, review marks and complete source documents.</span></button></div>
      <p className="muted export-note">Reviewed means checked in this session. It does not mean the issue is resolved.</p>
    </Modal>}
    {aiOpen && <Modal title="Review with NVIDIA Nemotron" onClose={() => setAiOpen(false)}>
      <p className="modal-intro">The rule-based checker works without an AI service. Nebius mode adds semantic review using an NVIDIA Nemotron model.</p>
      <div className="ai-status"><span className={`dot ${health?.nebius.available ? 'green' : 'amber'}`} /><strong>{health?.nebius.available ? 'Nebius runtime is enabled' : 'Live AI is disabled'}</strong></div>
      <dl className="setup-list"><dt>Provider</dt><dd>Nebius Token Factory</dd><dt>Model</dt><dd>{health?.nebius.model || 'nvidia/nemotron-3-super-120b-a12b'}</dd><dt>Privacy</dt><dd>Running AI sends both document texts to Nebius. Only use material you are authorized to share.</dd><dt>Cost</dt><dd>Live calls may incur usage charges. Confirm your billing budget before enabling the server feature flag.</dd></dl>
      {!health?.nebius.available && <p className="notice info">Configure the server-only key and model, approve a usage budget, then enable NEBIUS_ENABLED. See the included README. Never paste a key here.</p>}
      <p className="muted">AI suggestions must pass source-line validation. A successful API call still does not prove a finding is correct. Failed AI calls never silently switch to demo results.</p>
      <div className="modal-actions"><button className="button" onClick={() => setAiOpen(false)}>Keep rule-based review</button><button className="button primary" disabled={!health?.nebius.available || busy} onClick={() => void run(documents, isDemo, 'nebius')}>Send documents & run AI</button></div>
    </Modal>}
  </>;
}
