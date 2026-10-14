import riverside from './demo.mjs';

// Entirely fictional examples. These deliberately exercise both positive matches
// and uncertainty; they are not an accuracy benchmark or real customer documents.
export const scenarios = [
  {
    id: 'riverside', ...riverside,
    description: 'A quantity difference, an exclusion, an unmatched scope item and two clarifications.',
  },
  {
    id: 'clean-lighting', projectName: 'Workshop lighting · Matching quote',
    description: 'Four exact wording matches. A quiet result still needs human review.',
    scope: `Supply and install 12 LED luminaires, including mounting brackets.
Supply and install 8 twin socket outlets, including faceplates.
Provide updated as-built drawings at handover.
Label all new circuits and distribution-board schedules.`,
    quote: `Supply and install 12 LED luminaires, including mounting brackets.
Supply and install 8 twin socket outlets, including faceplates.
Provide updated as-built drawings at handover.
Label all new circuits and distribution-board schedules.`,
  },
  {
    id: 'quantity-review', projectName: 'Containment · Quantity review',
    description: 'Different units, split lines and boxed items. The checker must not invent a total.',
    scope: `Supply and install 120 m of 150 mm cable tray.
Supply and install 12 LED luminaires.
Supply and install 8 twin socket outlets.
Provide updated as-built drawings at handover.`,
    quote: `Supply and install 400 ft of 150 mm cable tray.
Supply and install 6 LED luminaires in the workshop.
Supply and install 6 LED luminaires in the store.
Supply and install 2 boxes of twin socket outlets; quantity per box to be confirmed.
Provide updated as-built drawings at handover.`,
  },
  {
    id: 'allowances', projectName: 'Fit-out · Exclusions and allowances',
    description: 'A section-level exclusion, client-side disposal, provisional lift access and a shorter warranty.',
    scope: `Include electrical testing and commissioning.
Remove and dispose of redundant electrical containment.
Provide MEWP lift access for high-level installation.
Provide a 24-month workmanship warranty.
Provide updated as-built drawings at handover.`,
    quote: `Exclusions:
Electrical testing and commissioning.
Inclusions:
Removal and disposal of redundant electrical containment by the main contractor.
MEWP lift access: provisional allowance only, subject to site conditions.
Provide a 12-month workmanship warranty.
Provide updated as-built drawings at handover.`,
  },
];

export default scenarios;
