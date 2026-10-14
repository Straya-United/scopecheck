import { invalidInput } from './errors.mjs';

export const LIMITS = Object.freeze({ maxDocumentChars: 20_000, maxLines: 250, maxLineChars: 2_000 });
export const RULE_WARNING = 'Keyword rules are a first-pass review. A matched line is not a guarantee of full scope, pricing, technical adequacy, or safety compliance. Check the original documents.';
export const sourceLines = (text) => text.split(/\r\n|\n|\r/).map((text, i) => ({ line: i + 1, text }));

export function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidInput('Provide a JSON object with scope, quote, and mode.');
  if (!['rules', 'nebius'].includes(value.mode)) throw invalidInput('Mode must be rules or nebius.');
  for (const name of ['scope', 'quote']) {
    const text = value[name];
    if (typeof text !== 'string' || !text.trim()) throw invalidInput(`${name} must contain text.`);
    if (text.length > LIMITS.maxDocumentChars) throw invalidInput(`${name} exceeds ${LIMITS.maxDocumentChars.toLocaleString('en-US')} characters.`);
    if (text.includes('\0')) throw invalidInput(`${name} contains unsupported null characters.`);
    const lines = sourceLines(text);
    if (lines.length > LIMITS.maxLines || lines.some((line) => line.text.length > LIMITS.maxLineChars)) {
      throw invalidInput(`${name} must have at most ${LIMITS.maxLines} lines, each at most ${LIMITS.maxLineChars} characters.`);
    }
  }
  return { scope: value.scope, quote: value.quote, mode: value.mode };
}

const topics = [
  ['disposal', 'Removal and disposal', /\b(?:remov\w*|dispos\w*|strip[- ]?out|demolition)\b/i],
  ['testing', 'Testing and commissioning', /\b(?:test\w*|commission\w*|certif\w*)\b/i],
  ['lift', 'Lift access', /\b(?:mewp|lift|scaffold\w*|access equipment|high[- ]level access)\b/i],
  ['warranty', 'Workmanship warranty', /\b(?:warrant\w*|guarantee\w*|defects liability)\b/i],
  ['tray', 'Cable tray', /\bcable\s+tray\b/i],
  ['lights', 'LED luminaires', /\b(?:luminaire\w*|led light\w*|lighting fixtures?)\b/i],
  ['sockets', 'Socket outlets', /\b(?:socket\w*|receptacle\w*)\b/i],
  ['drawings', 'As-built drawings', /\bas[- ]built\b/i],
  ['labels', 'Circuit labels and schedules', /\b(?:label\w*|circuit schedules?|board schedules?)\b/i],
];
const topicFor = (text) => topics.find(([, , pattern]) => pattern.test(text));
const stopWords = new Set('a an and are as at be by for from in including include included install installation of on or provide provided required shall supply the to with all new work works item qty quantity scope quote quotation quotation'.split(' '));
function tokens(text) {
  return new Set(text.toLowerCase().replace(/\b(?:\d+(?:\.\d+)?)\b/g, ' ').match(/[a-z][a-z-]{2,}/g)?.map((x) => x.replace(/s$/, '')).filter((x) => !stopWords.has(x)) ?? []);
}
function warrantyProfile(text) {
  const matches = [...text.matchAll(durationPattern)];
  if (!matches.length) return { months: null, uncertain: /\b(?:months?|years?)\b/i.test(text) };
  if (matches.length !== 1 || uncertainQuantity.test(text)) return { months: null, uncertain: true };
  const match = matches[0];
  const before = text.slice(0, match.index);
  const amount = exactAmount(match[1].trim());
  if (!amount || /[-−+\d.,]\s*$/.test(before)) return { months: null, uncertain: true };
  const scaledMonths = amount.scaled * (/^year/i.test(match[2]) ? 12n : 1n);
  if (scaledMonths % decimalScale !== 0n || scaledMonths > BigInt(Number.MAX_SAFE_INTEGER)) return { months: null, uncertain: true };
  return { months: scaledMonths / decimalScale, uncertain: false };
}
const cleanLabel = (text) => text.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').slice(0, 110);
const headingText = (text) => text.trim().replace(/^(?:#{1,6}\s+|\d+[.)]\s+)/, '').replace(/[*_`]/g, '').replace(/:$/, '').trim();
const isExclusionHeading = (text) => /^(?:exclusions?(?:\s+(?:and|&)\s+qualifications?)?|qualifications?\s+(?:and|&)\s+exclusions?|excluded works?|works excluded|not included)$/i.test(headingText(text));
const isHeading = (text) => isExclusionHeading(text) || /^(?:scope(?: of works?)?|requirements?|quotation|quote|project|inclusions?|included works?|notes?|pricing|terms(?: and conditions)?|clarifications?|assumptions?)$/i.test(headingText(text));
export const requirementLines = (scope) => sourceLines(scope).filter(({ text }) => text.trim() && !isHeading(text));
function contextualLines(text) {
  let exclusionHeading;
  const lines = [];
  for (const line of sourceLines(text)) {
    if (isHeading(line.text)) {
      exclusionHeading = isExclusionHeading(line.text) ? line : undefined;
    } else if (line.text.trim()) {
      lines.push({ ...line, exclusionHeading });
    }
  }
  return lines;
}
function evidenceFor(lines) {
  // Internal section flags never alter or leak into the public evidence shape.
  const evidence = new Map();
  for (const { line, text, exclusionHeading } of lines) {
    if (exclusionHeading) evidence.set(exclusionHeading.line, exclusionHeading);
    evidence.set(line, { line, text });
  }
  return [...evidence.values()].sort((a, b) => a.line - b.line);
}
const ambiguous = /\b(?:tbc|tbd|to be (?:confirmed|agreed|determined)|subject to|assum(?:ed|ing|ption)|provisional|allowance only|standard terms|if required|as required|optional|budget only|estimate only)\b/i;
function isExcluded(text) {
  // Negated exclusion statements ("not excluded", "no exclusions") are not exclusions.
  const stripped = text.replace(/\b(?:not excluded|no exclusions?|nothing excluded)\b/gi, '');
  return /\bno\s+(?:electrical\s+)?(?:testing|commissioning|warranty|removal|disposal|lift access|mewp|cable tray)\b/i.test(stripped) || /\bno\s+[^.;\n]{1,60}\b(?:included|provided|allowed for)\b/i.test(stripped) || /\b(?:excluded|excludes?|excluding|not included|not provided|not covered|not allowed for|omitted|by others|by (?:the )?(?:client|customer|owner|main contractor|principal contractor)|client[- ]supplied|client to provide|out of scope)\b/i.test(stripped);
}

// Recognized unsupported units remain review prompts. No conversion or package-size inference is attempted.
const quantityUnits = String.raw`(?:m(?:[²³]|\s*\^\s*[23]|[23])|(?:square|sq\.?|cubic|cu\.?)\s*(?:metres?|meters?|m|feet|foot|ft)|sqm|sqft|(?:linear\s+)?metres?|(?:linear\s+)?meters?|lm|m|units?|nos?\.?|pcs|pieces?|(?:LED\s+)?luminaires?|(?:twin\s+)?socket outlets?|sockets?|receptacles?|ft|feet|foot|yards?|yd|cases?|packs?|boxes?|cartons?|rolls?|sets?)`;
const numericToken = String.raw`(?:\d[\d,._]*(?:[eE][+\-]?\d+)?|\.\d+|Infinity|NaN)`;
const durationPattern = new RegExp(String.raw`(?<![\p{L}\p{N}_.])([+\-−]?\s*${numericToken})\s*-?\s*(months?|years?)\b`, 'giu');
const quantityPattern = new RegExp(String.raw`(?<![\p{L}\p{N}_.])([+\-−]?\s*(?:\d[\d,._]*(?:[eE][+\-]?\d+)?|Infinity|NaN))\s*(${quantityUnits})(?![\p{L}\p{N}_])`, 'giu');
const uncertainQuantity = /(?:\b(?:approx(?:imately)?\.?|about|circa|roughly|estimated|estimate|provisional|up to|at least|at most|minimum|maximum|between)\b|[~≈±]|\+\s*\/\s*-|\d\s*[-–—]\s*\d|\d\s+to\s+\d)/i;
const countUnit = /^(?:units?|nos?\.?|pcs|pieces?|(?:LED\s+)?luminaires?|(?:twin\s+)?socket outlets?|sockets?|receptacles?)$/i;
const lengthUnit = /^(?:(?:linear\s+)?met(?:re|er)s?|lm|m)$/i;
const decimalScale = 1_000_000n;
function exactAmount(amount) {
  // Six decimal places and a safe scaled integer bound prevent overflow,
  // lost integer precision, and tiny differences rounding down to zero.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(amount)) return null;
  const plain = amount.replaceAll(',', '');
  const [whole, fraction = ''] = plain.split('.');
  const scaled = BigInt(whole) * decimalScale + BigInt(fraction.padEnd(6, '0'));
  if (scaled <= 0n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const value = Number(plain);
  // Some values near the bound cannot round-trip through the public number field.
  if (value.toFixed(6) !== `${BigInt(whole)}.${fraction.padEnd(6, '0')}`) return null;
  return { value, scaled };
}
function decimalText(scaled) {
  const whole = scaled / decimalScale;
  const fraction = String(scaled % decimalScale).padStart(6, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
function quantityProfile(text) {
  // Keep offsets and distinguish list bullets from actual signed values.
  const scanText = text.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, (prefix) => ' '.repeat(prefix.length));
  const quantities = [];
  let uncertain = false;
  for (const match of scanText.matchAll(quantityPattern)) {
    const before = scanText.slice(Math.max(0, match.index - 45), match.index);
    const after = scanText.slice(match.index + match[0].length, match.index + match[0].length + 45);
    // A metre dimension is not a procurement length, whether the label comes first or last.
    const dimension = /(?:[x×]\s*|\b(?:width|height|depth|length|dimensions?)\s*[:=]?\s*)$/i.test(before)
      || /(?:\b\d+(?:\.\d+)?\s*[x×]\s*)$/i.test(before)
      || /^\s*(?:[x×](?=\s|\d)|[- ]?(?:wide|width|high|height|deep|depth|long|length)\b)/i.test(after);
    if (dimension) { uncertain = true; continue; }
    const amount = exactAmount(match[1].trim());
    const unit = lengthUnit.test(match[2]) ? 'm' : countUnit.test(match[2]) ? 'units' : null;
    // Reject numeric fragments, ratios/rates, unsupported units and malformed values.
    if (!amount || !unit || (unit === 'units' && amount.scaled % decimalScale !== 0n) || /[-−+\d.,/$£€]\s*$/.test(before) || /^\s*(?:\/|per\b|squared\b|cubed\b|sq\.?\b|cu\.?\b|[²³^])/i.test(after)) {
      uncertain = true;
      continue;
    }
    quantities.push({ ...amount, unit });
  }
  // A number that was not understood must not disappear and yield clean coverage.
  // Mask only explicitly recognized quantities, specifications, durations and prices.
  let residual = scanText.replace(quantityPattern, (match) => ' '.repeat(match.length));
  const knownNonQuantity = [
    /(?<![\p{L}\p{N}_.])\d+(?:\.\d+)?\s*(?:mm|cm|v|w|kv|kw|a|ma|hz|khz)\b/giu,
    durationPattern,
    /(?:\b(?:USD|GBP|EUR|AUD|CAD|NZD)\s*|[$£€])\s*\d[\d,.]*/gi,
    /(?<![\p{L}\p{N}_.])\d[\d,.]*\s*(?:USD|GBP|EUR|AUD|CAD|NZD|dollars?|pounds?|euros?)\b/giu,
    /\b(?:price|cost|total)\s*[:=]?\s*\d[\d,.]*/gi,
    /(?<![\p{L}\p{N}_.])\d+(?:\.\d+)?\s*%/giu,
  ];
  for (const pattern of knownNonQuantity) residual = residual.replace(pattern, (match) => ' '.repeat(match.length));
  if (new RegExp(String.raw`(?<![\p{L}\p{N}_])${numericToken}`, 'iu').test(residual)) uncertain = true;
  if (/\d/.test(scanText) && uncertainQuantity.test(scanText)) uncertain = true;
  return { quantities, uncertain };
}

/** Only exact, supported procurement lengths/counts; no dimensions, estimates or unsafe numbers. */
export function extractQuantities(text) {
  const { quantities, uncertain } = quantityProfile(text);
  return uncertain ? [] : quantities.map(({ value, unit }) => ({ value, unit }));
}

function specificationValues(text) {
  const values = new Set();
  for (const [, amount, unit] of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(mm|cm|v|w)\b/gi)) {
    // Canonical decimal strings avoid both substring collisions and numeric overflow.
    const [whole, fraction = ''] = amount.split('.');
    const canonicalWhole = whole.replace(/^0+(?=\d)/, '');
    const canonicalFraction = fraction.replace(/0+$/, '');
    values.add(`${canonicalWhole}${canonicalFraction ? `.${canonicalFraction}` : ''}:${unit.toLowerCase()}`);
  }
  return values;
}

function matchingLines(requirement, quoteLines) {
  const topic = topicFor(requirement.text);
  const needed = tokens(requirement.text);
  return quoteLines.map((candidate) => {
    const candidateWords = tokens(candidate.text);
    const shared = [...needed].filter((word) => candidateWords.has(word)).length;
    // A known topic is deliberately conservative: avoid matching "remove cable tray" to new tray installation.
    const candidateTopic = topicFor(candidate.text);
    const topicMatch = topic && topic[2].test(candidate.text) && (!candidateTopic || candidateTopic[0] === topic[0]);
    const score = topic ? (topicMatch ? 2 + shared / Math.max(needed.size, 1) : 0) : (shared >= 2 ? shared / Math.max(needed.size, 1) : 0);
    return { candidate, score };
  }).filter(({ score }) => score >= (topic ? 2 : 0.5)).sort((a, b) => b.score - a.score).map(({ candidate }) => candidate);
}

export function analyzeRules(scope, quote, { now = () => new Date() } = {}) {
  validateInput({ scope, quote, mode: 'rules' });
  const requirements = contextualLines(scope);
  const quoteLines = contextualLines(quote);
  if (!requirements.length) throw invalidInput('Scope needs at least one requirement line.');
  const findings = [];
  const coverage = requirements.map((requirement) => {
    const matches = matchingLines(requirement, quoteLines);
    const topic = topicFor(requirement.text);
    const label = topic?.[1] ?? cleanLabel(requirement.text);
    const scopeEvidence = evidenceFor([requirement]);
    const quoteEvidence = evidenceFor(matches);
    const base = { id: `scope-${requirement.line}`, label, status: 'covered', scopeEvidence, quoteEvidence };
    let issue;
    if (requirement.exclusionHeading || isExcluded(requirement.text) || /\b(?:do not|not required|not needed)\b/i.test(requirement.text)) {
      issue = { kind: 'clarification', severity: 'medium', title: `${label}: scope qualification`, summary: 'The scope itself contains negative or responsibility-limiting wording. Simple matching cannot determine the intended allocation.', question: `Please confirm the intended responsibilities and exclusions for ${label.toLowerCase()}.` };
    } else if (!matches.length) {
      issue = { kind: 'missing', severity: 'medium', title: `${label}: no matching quote line`, summary: 'No matching quote wording was found by the keyword rules. This is a review gap, not proof that the contractor omitted the work.', question: `Can you confirm whether ${label.toLowerCase()} is included and identify the relevant quote item?` };
    } else if (matches.some(({ text, exclusionHeading }) => exclusionHeading || isExcluded(text))) {
      issue = { kind: 'exclusion', severity: 'high', title: `${label}: explicit exclusion`, summary: 'The scope requests this work, while matching quote wording uses an exclusion heading, an explicit exclusion, or third-party responsibility. Resolve the allocation before accepting.', question: `Can you include ${label.toLowerCase()} in the quotation, or confirm who is responsible and any additional cost?` };
    } else if (ambiguous.test(requirement.text) || matches.some(({ text }) => ambiguous.test(text))) {
      issue = { kind: 'clarification', severity: 'medium', title: `${label}: clarification needed`, summary: 'The scope or matching quote wording is conditional or leaves a detail to be confirmed.', question: `Can you confirm the ${label.toLowerCase()} arrangements, inclusions, and any conditions in writing?` };
    } else {
      const scopeQuantity = quantityProfile(requirement.text);
      const quoteQuantities = matches.map(({ text }) => quantityProfile(text));
      const needed = scopeQuantity.quantities;
      const quoted = quoteQuantities.flatMap(({ quantities }) => quantities);
      const uncertain = scopeQuantity.uncertain || quoteQuantities.some(({ uncertain }) => uncertain);
      const scopeWarranty = topic?.[0] === 'warranty' ? warrantyProfile(requirement.text) : null;
      const quoteWarranty = topic?.[0] === 'warranty' ? warrantyProfile(matches.map(({ text }) => text).join(' ')) : null;
      const mismatch = needed.length === 1 && quoted.length === 1 && needed[0].unit === quoted[0].unit && quoted[0].value !== needed[0].value;
      if (uncertain || ((needed.length || quoted.length) && (needed.length !== 1 || quoted.length !== 1 || needed[0].unit !== quoted[0].unit))) {
        issue = { kind: 'clarification', severity: 'medium', title: `${label}: quantity not reconciled`, summary: 'Quantity wording is missing, split, approximate, dimension-only, unsupported, malformed, or incompatible. The rules cannot safely reconcile it, convert units, or sum separate quote lines.', question: `Can you confirm the exact total quantity and units for ${label.toLowerCase()} against the scope?` };
      } else if (mismatch) {
        const a = needed[0]; const b = quoted[0];
        const difference = decimalText(a.scaled > b.scaled ? a.scaled - b.scaled : b.scaled - a.scaled);
        const direction = b.value < a.value ? 'short' : 'extra';
        issue = { kind: 'quantity', severity: 'high', title: `${label}: ${difference} ${a.unit} ${direction}`, summary: `The scope lists ${a.value} ${a.unit}; the matching quote lists ${b.value} ${b.unit}. The stated difference is ${difference} ${a.unit}.`, question: `Please reconcile the ${a.value} ${a.unit} scope requirement with the ${b.value} ${b.unit} allowance and confirm the revised price.` };
      } else if ([...specificationValues(requirement.text)].some((specification) => !matches.some(({ text }) => specificationValues(text).has(specification)))) {
        issue = { kind: 'clarification', severity: 'medium', title: `${label}: specification needs review`, summary: 'A stated dimension or electrical rating in the scope is missing or different in the matching quote. It has not been treated as a procurement quantity.', question: `Can you reconcile the dimensions and specification for ${label.toLowerCase()} with the scope?` };
      } else if (topic?.[0] === 'warranty' && (scopeWarranty.uncertain || quoteWarranty.uncertain || quoteWarranty.months === null || (scopeWarranty.months !== null && quoteWarranty.months < scopeWarranty.months))) {
        issue = { kind: 'clarification', severity: 'medium', title: 'Workmanship warranty: duration unclear', summary: 'The warranty duration is ambiguous, missing, or shorter than the stated scope requirement. Multiple, signed, or ranged durations cannot be reconciled.', question: 'Please confirm the workmanship warranty duration, start date, and exclusions.' };
      } else if (topic?.[0] !== 'warranty' && tokens(requirement.text).size > 0 && !matches.some(({ text }) => [...tokens(requirement.text)].every((token) => tokens(text).has(token)))) {
        issue = { kind: 'clarification', severity: 'medium', title: `${label}: partial wording match`, summary: 'Only part of the requirement matches the quote wording. The rules cannot confirm the remaining details.', question: `Please confirm that the full requirement is included: ${cleanLabel(requirement.text)}` };
      }
    }
    if (issue) {
      const titles = { 'tray:quantity': 'Cable tray quantity shortfall', 'testing:exclusion': 'Testing excluded from quote', 'disposal:missing': 'Removal and disposal not matched', 'lift:clarification': 'Lift access is not confirmed', 'warranty:clarification': 'Warranty terms need confirmation' };
      issue.title = issue.kind === 'quantity' && /extra$/.test(issue.title) ? `${label} quantity difference` : (titles[`${topic?.[0]}:${issue.kind}`] ?? issue.title);
      base.status = issue.kind === 'clarification' ? 'unclear' : 'attention';
      findings.push({ id: `rule-${requirement.line}-${issue.kind}`, ...issue, scopeEvidence, quoteEvidence, source: 'rule' });
    }
    return base;
  });
  return { mode: 'rules', generatedAt: now().toISOString(), findings, coverage, warnings: [RULE_WARNING, 'Put one requirement per line. Dimensions, prices, complex assemblies, and split or alternative quote quantities require manual review.'] };
}
