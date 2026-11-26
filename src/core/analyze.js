// Works out which hazards a change touches, and why.

import { createHash } from 'node:crypto';

const PATH_RE = /(?:^|[\s`'"(\[,])((?:[\w.@-]+\/)+[\w.@*-]*)/g;
const FILE_EXT_RE = /\.[a-z0-9]{1,5}$/i;

/** Pull file paths (anything with a slash) out of free text. */
export function extractFiles(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(PATH_RE)) {
    const p = m[1].replace(/[.,;:)]+$/, '');
    if (/^https?:/i.test(p) || p.startsWith('//')) continue;
    if (p.includes('/')) out.add(p);
  }
  return [...out];
}

/** The parts of an issue that decide which hazards it touches. */
export function changeFromIssue(issue) {
  const f = issue.fields || {};
  const description = typeof f.description === 'string' ? f.description : adfToText(f.description);
  return {
    key: issue.key,
    summary: f.summary || '',
    description,
    components: (f.components || []).map((c) => c.name),
    labels: f.labels || [],
    files: extractFiles(description),
  };
}

/** Flatten Atlassian Document Format to plain text. */
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content || []).map(adfToText).join('');
  const block = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow'];
  return block.includes(node.type) ? inner + '\n' : inner;
}

function isPathWatch(w) {
  return w.includes('/') || w.includes('*') || FILE_EXT_RE.test(w);
}

function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + esc + (glob.endsWith('/') ? '.*' : '') + '$', 'i');
}

function pathMatches(watch, file) {
  const w = watch.replace(/^\.\//, '');
  const f = file.replace(/^\.\//, '');
  if (w.includes('*')) return globToRegex(w).test(f);
  if (w.endsWith('/')) return f.toLowerCase().startsWith(w.toLowerCase()) || f.toLowerCase().includes('/' + w.toLowerCase());
  return f.toLowerCase() === w.toLowerCase() || f.toLowerCase().endsWith('/' + w.toLowerCase()) || f.toLowerCase().startsWith(w.toLowerCase() + '/');
}

function keywordRegex(word) {
  const esc = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  // Allow simple plurals and endings: "bolus" also matches "boluses".
  return new RegExp('(^|[^\\w])' + esc + '(e?s|ed|ing)?(?![\\w])', 'i');
}

/**
 * For each hazard, list the reasons this change touches it.
 * Returns only touched hazards, most severe first.
 */
export const TEST_LABEL = 'verification';

export function analyzeChange(change, hazards) {
  // Verification tests are evidence, not changes: they never need a review.
  if (change.labels.some((l) => l.toLowerCase() === TEST_LABEL)) return [];
  const text = `${change.summary}\n${change.description}`;
  const comps = change.components.map((c) => c.toLowerCase());
  const labels = change.labels.map((l) => l.toLowerCase());
  const touched = [];
  for (const h of hazards) {
    const reasons = [];
    for (const w of h.watches) {
      const wl = w.toLowerCase();
      if (isPathWatch(w)) {
        const hit = change.files.find((f) => pathMatches(w, f));
        if (hit) reasons.push({ kind: 'file', watch: w, detail: hit });
      } else if (comps.includes(wl)) {
        reasons.push({ kind: 'component', watch: w, detail: w });
      } else if (labels.includes(wl)) {
        reasons.push({ kind: 'label', watch: w, detail: w });
      } else if (keywordRegex(w).test(text)) {
        reasons.push({ kind: 'word', watch: w, detail: w });
      }
    }
    if (reasons.length) touched.push({ hazard: h, reasons });
  }
  const rank = (s) => {
    const i = ['Catastrophic', 'Critical', 'Serious', 'Minor', 'Negligible'].indexOf(s);
    return i === -1 ? 9 : i;
  };
  touched.sort((a, b) => rank(a.hazard.severity) - rank(b.hazard.severity) || a.hazard.id.localeCompare(b.hazard.id, undefined, { numeric: true }));
  return touched;
}

/**
 * A short fingerprint of what the change says it does. A risk review is tied
 * to this fingerprint, so if the change is edited after review, the review
 * goes stale and must be done again.
 */
export function fingerprint(change) {
  const basis = JSON.stringify([
    change.summary.trim(),
    change.description.replace(/\s+/g, ' ').trim(),
    [...change.components].sort(),
    [...change.labels].sort(),
    [...change.files].sort(),
  ]);
  return createHash('sha256').update(basis).digest('hex').slice(0, 12);
}
