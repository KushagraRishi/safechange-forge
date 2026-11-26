// A starting draft for a risk review note. The reviewer edits it and signs.

const KIND = { file: 'changes', component: 'is in component', label: 'is labelled', word: 'mentions' };

export function draftNote(result, item) {
  const { hazard, reasons } = item;
  const why = reasons.map((r) => `${KIND[r.kind] || r.kind} ${r.detail}`).join('; ');
  const lines = [
    `${result.issueKey} ${why}, which can lead to ${hazard.id}: ${hazard.title} (${hazard.severity}${hazard.harm ? `, harm: ${hazard.harm}` : ''}).`,
    hazard.control ? `Existing risk control: ${hazard.control}.` : 'No risk control is listed for this hazard yet.',
    hazard.verification
      ? `Before release, re-run: ${hazard.verification}, and link the passed test to this issue.`
      : 'Name the test that shows the control still works, and link it to this issue.',
    'Residual risk: acceptable only if the control is unchanged by this change and the test passes.',
  ];
  return lines.join('\n');
}
