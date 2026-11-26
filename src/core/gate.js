// Decides whether a change may reach Done.
//
// Every hazard the change touches needs:
//   1. a risk review signed by a person,
//   2. done for this exact version of the change (not stale),
//   3. that judged the risk acceptable,
//   4. with a linked verification test that has passed (status category Done).

export const STATES = {
  ok: { label: 'Reviewed and tested', blocks: false },
  'missing-review': { label: 'Needs a risk review', blocks: true },
  'stale-review': { label: 'Change edited after review', blocks: true },
  rejected: { label: 'Risk judged not acceptable', blocks: true },
  'missing-test': { label: 'Needs a linked test', blocks: true },
  'test-not-passed': { label: 'Linked test not passed yet', blocks: true },
};

export function hazardState(review, currentPrint, tests) {
  if (!review) return 'missing-review';
  if (review.fingerprint !== currentPrint) return 'stale-review';
  if (review.decision !== 'acceptable') return 'rejected';
  if (!review.testKey) return 'missing-test';
  const t = tests[review.testKey];
  if (!t || t.statusCategory !== 'done') return 'test-not-passed';
  return 'ok';
}

/**
 * @param touched  output of analyzeChange
 * @param reviews  { [hazardId]: { decision, note, testKey, fingerprint, reviewer, reviewedAt } }
 * @param currentPrint fingerprint of the change now
 * @param tests    { [issueKey]: { statusCategory, status, summary } }
 */
export function evaluateGate(touched, reviews, currentPrint, tests = {}) {
  const items = touched.map(({ hazard, reasons }) => {
    const review = reviews[hazard.id];
    const state = hazardState(review, currentPrint, tests);
    return {
      hazard,
      reasons,
      review: review || null,
      test: review?.testKey ? { key: review.testKey, ...(tests[review.testKey] || { status: 'Not found', statusCategory: 'unknown' }) } : null,
      state,
      label: STATES[state].label,
      blocks: STATES[state].blocks,
    };
  });
  const open = items.filter((i) => i.blocks);
  return {
    status: touched.length === 0 ? 'no-hazards' : open.length ? 'blocked' : 'clear',
    items,
    open: open.length,
    total: items.length,
  };
}

/** The message a person sees when the workflow stops their transition. */
export function blockMessage(gate) {
  if (gate.status !== 'blocked') return '';
  const parts = gate.items
    .filter((i) => i.blocks)
    .slice(0, 4)
    .map((i) => `${i.hazard.id} (${i.label.toLowerCase()})`);
  const more = gate.open > 4 ? ` and ${gate.open - 4} more` : '';
  return `SafeChange: this change touches ${gate.open} hazard${gate.open === 1 ? '' : 's'} that ${gate.open === 1 ? 'is' : 'are'} not cleared: ${parts.join(', ')}${more}. Open the SafeChange panel to review them.`;
}
