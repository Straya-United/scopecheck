# ScopeCheck design specification

Reference: `design-concept.png`, generated with the built-in image tool at 1536 × 1024.

## Surface and tokens

A working comparison workspace, not a marketing page. Full-width restrained header, project title, synthetic-data notice, 60/40 comparison and evidence panels, then a source-document viewer. The primary workflow selects a finding, checks both line references, copies the clarification and marks it reviewed. Documents can be edited or imported; results can be exported.

- Background: cool very-light gray `#f7f8fa`; panels white `#ffffff`.
- Ink: `#101b34`; muted `#65728b`; dividers `#e1e6ed`.
- Emerald action: `#008464`, hover `#006b51`; selected row `#f0f6f9`.
- Alert red `#dd3345`; amber `#ed9b0b`; green `#008464`.
- Font: Inter when locally available, system sans fallback; 14–16px content; 32px page title; 24px inspector heading. Code-like line numbers use monospace.
- Corners: panels 5px; buttons 5px. No decorative shadows, gradients, stock photos, hero badges or arbitrary extra cards.
- Header 60px. Desktop gutters 48px. Panel gap 16px. Row rhythm about 78px, maintained with variable content height.
- Icons: Lucide outline 18px, 1.75 stroke. Brand: nested-corner vector mark.

## Allowed primary copy

ScopeCheck; Project workspace; Local review; New review; Reviews; Riverside fit-out; Compare the scope. Catch the gaps.; Export review; Synthetic demo · Fictional documents. Human review required.; Scope comparison; All findings; Needs attention; To clarify; Covered; Cable tray quantity shortfall; Testing excluded from quote; Removal and disposal not quoted; Lift access is not confirmed; Warranty terms need confirmation; Suggested clarification; Mark reviewed; Copy question; Rule-based demo · No AI call made; Configure AI; Document source; Scope; Supplier quote; Edit text.

Counts and findings are derived from actual analysis. Accuracy takes precedence over illustrative concept strings (e.g. exclusions are labelled Exclusion, rather than the image's inaccurate Missing item). Line labels and source text come from actual uploaded/edited documents. Additional necessary states use the same components: document editing/import dialog, AI information dialog, empty/error/loading states, coverage details and reviewed filters. Mobile stacks the panels without hiding evidence or controls.

## Data and interaction invariants

No invented savings, certifications or confidence scores. Rule-based mode is always explicit. Model output requires verified source citations and remains a review aid. No API key appears in the browser. No upload to AI happens implicitly. Session content is held in memory only; export is a user-triggered local download. Imported PDF text is extracted in the browser; scanned PDFs require OCR outside this MVP. Marking reviewed never asserts the issue is resolved.

## Subsequent functional refinements

The expanded demo adds a compact fictional-scenario selector within the existing workspace rhythm, a precise evidence-basis line in the inspector and a format chooser for local exports. The original concept's definitive “not quoted” / “Missing item” language is intentionally replaced by “not matched” / “Unmatched scope” and “Omission unconfirmed.” Clean-match scenarios open the covered view. Existing panel, type, border and color tokens remain unchanged. Real-browser visual verification is still blocked by the execution environment; no fidelity sign-off is claimed.
