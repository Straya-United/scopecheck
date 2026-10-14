import type { Analysis, Documents, FindingKind } from './types';

export const findingBasis: Record<FindingKind, string> = {
  quantity: 'Stated quantity difference',
  exclusion: 'Explicit exclusion wording',
  missing: 'Unmatched wording · Omission unconfirmed',
  clarification: 'Needs clarification · No conclusion yet',
};

export function buildClarificationText(documents: Documents, result: Analysis, reviewed: Set<string>) {
  const lines = [
    `${documents.projectName} — Clarification checklist`,
    `Prepared: ${result.generatedAt}`,
    `Analysis: ${result.mode === 'rules' ? 'Rule-based review; no AI call made' : `AI candidates via Nebius (${result.model || 'NVIDIA Nemotron'})`}`,
    'Review aid only. An unmatched line is not proof of omission. Reviewed does not mean resolved.',
    'This local export has not been sent to a supplier. Review its wording and quoted source material before sharing.',
    '',
  ];
  if (!result.findings.length) lines.push('No clarification findings were generated. Matching wording does not establish complete scope or safety compliance.');
  result.findings.forEach((finding, index) => {
    lines.push(`${index + 1}. ${finding.title}`, `Basis: ${finding.source === 'model' ? 'AI candidate; ' : ''}${findingBasis[finding.kind]}`, `Review status: ${reviewed.has(finding.id) ? 'Reviewed, not resolved' : 'Awaiting review'}`, `Question: ${finding.question}`);
    for (const evidence of finding.scopeEvidence) lines.push(`Scope line ${evidence.line}: ${evidence.text}`);
    for (const evidence of finding.quoteEvidence) lines.push(`Quote line ${evidence.line}: ${evidence.text}`);
    if (!finding.quoteEvidence.length) lines.push('Quote evidence: no matching source line cited; verify the complete quotation.');
    lines.push('');
  });
  return lines.join('\n');
}
