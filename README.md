# ScopeCheck

**Catch the gaps between a contractor's scope and a supplier's quote, with the exact lines to prove it.** ScopeCheck flags quantity differences, exclusions, unmatched requirements and terms that need clarifying, then shows the source line behind every finding and a question to send the supplier.

The AI review runs **NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) on Nebius Token Factory**. Built for the [Nebius × NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/), *Best Apps and Agents* track.

- **Live demo:** _URL added at deployment_ (fictional documents only; no sign-in)
- **Licence:** MIT

## How Nemotron and Token Factory are used

When a reviewer chooses **Review with Nemotron**, the server sends both documents, as numbered lines, to Nebius Token Factory's OpenAI-compatible `/v1/chat/completions` endpoint with:

- `model: nvidia/nemotron-3-super-120b-a12b`, `temperature: 0`
- `response_format: json_schema` (strict) describing findings, coverage and warnings
- a system prompt that treats document text as untrusted data and requires exact, numbered source lines for every claim

Nemotron does the semantic work the rules can't: matching requirements that are worded differently, reading exclusion sections, and writing the clarification question. ScopeCheck then **checks every answer before showing it**. Each cited line number and quote must match the source exactly, every scope requirement must be accounted for, and findings must agree with coverage. Anything that fails is rejected outright, with no silent fallback. Results are labelled with the model ID in the interface and in exports.

The deterministic rules engine runs first and needs no key, so the page is useful immediately and the two can be compared.

### Verified live runs (14 Oct 2026)

Genuine Token Factory calls (US-central endpoint) through the app's own adapter (`scripts/live-check.mjs`), all passing validation:

| Fictional scenario | Nemotron findings | Rules findings | Time |
|---|---|---|---|
| Riverside fit-out | 5 | 5 | 12.9–17.0 s |
| Workshop lighting (matching quote) | 0 | 0 | 3.5 s |
| Containment quantity review | 2 | 3 | 8.9 s |
| Fit-out exclusions and allowances | 3 (+1 raised as a warning) | 4 | 12.6 s |

Nemotron matched the rules on the first two. On the last two it missed a split luminaire allowance and raised "disposal by the main contractor" as a warning instead of a finding. That's why every result is labelled as a candidate for human review. These four cases are demonstrations, not an accuracy benchmark.

## Run locally

Requires Node.js 22.16+ and npm.

```sh
npm ci --include=dev
npm run build
npm start
```

Open **http://127.0.0.1:8787**. The fictional Riverside fit-out loads automatically. Rules mode needs no key.

To enable Nemotron, copy `.env.example` to `.env`, set `NEBIUS_API_KEY` (server-side only), keep `NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b`, set `NEBIUS_ENABLED=true` and restart. Check `node --env-file=.env scripts/live-check.mjs` for a direct test.

For development: `npm run dev` starts the API on 8787 and Vite on **http://127.0.0.1:5173**.

## Hosted mode

By default the server binds to loopback and accepts only loopback hostnames. Setting `PUBLIC_HOSTS` (e.g. `scopecheck.onrender.com`) turns on hosted mode:

- listens on all interfaces behind the platform's HTTPS proxy; only the listed hostnames are accepted, and cross-origin requests must be same-origin HTTPS
- HSTS, a strict Content Security Policy and no-referrer headers
- live-AI limits: `LIVE_PER_IP_PER_HOUR` (default 6), `LIVE_DAILY_CAP` (default 150, resets 00:00 UTC), one request at a time and five per minute
- the key stays in the host's secret store; the browser never sees it

`render.yaml` is a ready Render blueprint. Set a spending limit in the Nebius console as well: in-process caps reset on restart.

## Try the workflow

1. Review the five synthetic findings: 40 m of cable tray difference; testing excluded; disposal wording not matched; lift access uncertain; warranty uncertain.
2. Select a finding. Compare the exact scope and quote lines, or click a line label to jump into the source document.
3. Copy its clarification question and mark it reviewed. This changes session review state; it does not resolve the issue or contact a supplier.
4. Choose **Covered items** to inspect four candidate text matches.
5. Choose **New review** or **Edit text**. Paste text or import `.txt`, `.md`, `.csv` or a text-based `.pdf`.
6. Open **Export review**. Choose a plain-text clarification checklist (questions, exact source lines and review status) or a full JSON review (both source documents, findings, coverage, evidence, mode and review marks). Neither option contacts a supplier. Review the contents before sharing.

### Four fictional scenarios

Use **Try a fictional scenario** to switch between examples. Switching replaces the session's current documents/results and resets review marks; export first if you want to retain them.

- **Riverside fit-out:** five findings and four candidate covered matches. Demonstrates a quantity difference, an explicit exclusion, an unmatched scope line and two clarification prompts.
- **Workshop lighting · Matching quote:** no findings, four matching items. The interface opens the covered view; a quiet result is not proof of completeness.
- **Containment · Quantity review:** three clarifications and one match. Metres versus feet, split luminaire allowances and boxed socket outlets are left unresolved rather than converted or summed.
- **Fit-out · Exclusions and allowances:** two exclusions, two clarifications and one match. Exclusion-heading context is quoted verbatim beside the item; provisional access and shorter warranty need checking.

These examples exercise behavior. They are not a measured accuracy benchmark or real customer validation. The inspector distinguishes a stated discrepancy, an explicit exclusion, an unmatched line with omission unconfirmed, and uncertainty that requires clarification.

Everything is in memory for the current session. No analytics, database, automatic document storage, email, external sharing or background model calls. Reloading discards session edits and marks. PDF text is extracted in the browser; rules analysis runs in the local Node server.

## Known limits

- Rules are conservative keyword matching, not general document understanding. One substantive requirement per line works best. Complex assemblies, tables, alternatives, multi-line requirements, synonyms, unit conversion and split allowances need human review. “Missing” means no matching line was found by this checker, not proven omission.
- Numeric checks support exact positive procurement lengths in metres and whole-item counts. Unsupported units (including feet and area units), ranges, estimates, fractional counts, split allowances, malformed numbers and values outside safe precision bounds require clarification. There is no unit conversion, package-size assumption or summing of ambiguous lines. Dimensions and ratings are not procurement quantities; specification differences are review prompts, not engineering judgments.
- Section context recognizes common explicit headings, including Exclusions and Inclusions. Unfamiliar formatting or headings may need manual interpretation. Evidence is the original extracted line text, including the applicable exclusion heading.
- A covered item is only a candidate wording match. It does not establish full inclusion, price adequacy, contract acceptance, code compliance or safety certification.
- PDF import handles selectable text only, up to 5 MB and 40 pages. No OCR. Reading order and tables can be flattened; inspect and edit extracted text before analysis. Evidence line numbers refer to the extracted text, not PDF pages.
- Model output can still be wrong despite evidence validation. Live connectivity, model schema compatibility, latency, real token usage and reproducibility require an approved end-to-end run.
- Session state is not persisted. Export if you want to keep results. No undo across a successful new comparison.

## Verification

```sh
npm test            # 64 backend, API, provider-contract, hosted-mode, PDF and scenario tests
npm run test:ui     # 9 DOM interaction and export tests
npm run typecheck
npm run build
node --env-file=.env scripts/live-check.mjs all      # genuine Nebius calls (costs a few cents)
node --env-file=.env scripts/browser-check.mjs       # real Chrome: rules view, AI run from the UI, mobile
```

On 14 Oct 2026: 64/64 backend tests, 9/9 UI tests, typecheck and build pass on Windows with Node 24. In real Chrome, the AI run started from the interface completed in 12.2 s and labelled its results `Nebius AI · nvidia/nemotron-3-super-120b-a12b`. The 390 px mobile layout has no horizontal overflow. Backend tests mock the provider and never incur charges.

## Structure

- `src/`: React/TypeScript workspace, document editor, source/evidence views and local export
- `server/analysis.mjs`: deterministic checks and exact source lines
- `server/nebius.mjs`: bounded server-side inference and strict result validation
- `server/index.mjs`: API, abuse controls, hosted mode and production static serving
- `server/demo.mjs`: fictional scope and quotation
- `server/scenarios.mjs`: four varied fictional examples
- `tests/`: backend regression, provider-contract and HTTP integration tests
- `ui/`: DOM interaction and clarification-export tests
- `e2e/`: browser workflow tests
- `docs/design-spec.md`: visual specification and interface invariants
- `docs/demo-walkthrough-draft.md`: rehearsal plan with separate truthful rules/live-runtime versions
- `scripts/live-check.mjs`: genuine Nebius runs over the fictional scenarios through the app's own adapter
- `scripts/browser-check.mjs`: real-browser QA (desktop, AI run from the UI, mobile)

## Licence

MIT. See [LICENSE](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party-licenses/`.

Built by Treyn at AppForge Digital, with ChatGPT and Claude as AI coding partners.
