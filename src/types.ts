export type Evidence = { line: number; text: string };
export type FindingKind = 'quantity' | 'exclusion' | 'missing' | 'clarification';
export type Finding = {
  id: string; kind: FindingKind; severity: 'high' | 'medium'; title: string; summary: string;
  scopeEvidence: Evidence[]; quoteEvidence: Evidence[]; question: string; source: 'rule' | 'model';
};
export type Coverage = { id: string; label: string; status: 'covered' | 'attention' | 'unclear'; scopeEvidence: Evidence[]; quoteEvidence: Evidence[] };
export type Analysis = { mode: 'rules' | 'nebius'; model?: string; generatedAt: string; findings: Finding[]; coverage: Coverage[]; warnings: string[] };
export type Documents = { projectName: string; scope: string; quote: string };
export type DemoScenario = Documents & { id: string; description: string };
export type Health = { ok: boolean; hosted?: boolean; nebius: { enabled: boolean; configured: boolean; available: boolean; model?: string }; limits: { maxDocumentChars: number; maxLines: number } };
export type Filter = 'all' | 'attention' | 'clarification' | 'reviewed' | 'covered';
export type Selection = { type: 'finding'; id: string } | { type: 'coverage'; id: string };
