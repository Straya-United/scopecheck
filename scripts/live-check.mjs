// One genuine Nebius Token Factory call per fictional scenario, through the app's own adapter and validator.
// Usage: node --env-file=.env scripts/live-check.mjs [demo|all]
// Enables live mode for this process only; prints a summary, never the key or full documents.
import demo from '../server/demo.mjs';
import scenarios from '../server/scenarios.mjs';
import { analyzeNebius } from '../server/nebius.mjs';
import { analyzeRules } from '../server/analysis.mjs';

const which = process.argv[2] || 'demo';
const list = which === 'all' ? (Array.isArray(scenarios) ? scenarios : scenarios.scenarios || []) : [{ name: 'Riverside fit-out (demo)', ...demo }];
const env = { ...process.env, NEBIUS_ENABLED: 'true' };
console.log(`model ${env.NEBIUS_MODEL} @ ${env.NEBIUS_BASE_URL}`);
for (const s of list) {
  const label = s.name || s.title || s.id || 'scenario';
  const t0 = Date.now();
  try {
    const r = await analyzeNebius(s.scope, s.quote, { env });
    const rules = analyzeRules(s.scope, s.quote);
    console.log(`\n== ${label}: OK mode=${r.mode} model=${r.model} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`   model: ${r.findings.length} findings, ${r.coverage.length} coverage | rules: ${rules.findings.length} findings, ${rules.coverage.length} coverage`);
    for (const f of r.findings) console.log(`   - [${f.kind}/${f.severity}] ${f.title} :: scope L${f.scopeEvidence.map((e) => e.line).join(',')} quote L${f.quoteEvidence.map((e) => e.line).join(',') || '-'}`);
    for (const w of r.warnings.slice(2)) console.log(`   ! ${w}`);
  } catch (e) {
    console.log(`\n== ${label}: FAILED ${e.code || ''} ${e.message} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
