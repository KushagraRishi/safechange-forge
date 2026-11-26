// Scores SafeChange's matcher against 30 labelled sample changes, and shows
// what a plain Jira workflow would let through. Writes logs/evaluate.log.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseHazardLog } from '../src/core/hazardLog.js';
import { analyzeChange, fingerprint } from '../src/core/analyze.js';
import { evaluateGate } from '../src/core/gate.js';

const root = new URL('..', import.meta.url);
const { hazards } = parseHazardLog(readFileSync(new URL('fixtures/hazard-log.html', root), 'utf8'));
const changes = JSON.parse(readFileSync(new URL('fixtures/changes.json', root), 'utf8'));
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };

log(`SafeChange evaluation, ${new Date().toISOString()}`);
log(`Hazard log: ${hazards.length} hazards. Changes: ${changes.length}.`);
log('');
let tp = 0, fp = 0, fn = 0, touchingChanges = 0, blocked = 0, passedClean = 0, plainJiraLetThrough = 0;
const t0 = process.hrtime.bigint();
for (const c of changes) {
  const ch = { ...c, files: (c.description.match(/Files changed: (.*)/)?.[1] || '').split(/,\s*/).filter((f) => f.includes('/')) };
  const touched = analyzeChange(ch, hazards);
  const got = touched.map((t) => t.hazard.id);
  const want = c.expect;
  const hit = got.filter((g) => want.includes(g));
  tp += hit.length; fp += got.filter((g) => !want.includes(g)).length; fn += want.filter((w) => !got.includes(w)).length;
  if (want.length) { touchingChanges++; plainJiraLetThrough++; }
  const gate = evaluateGate(touched, {}, fingerprint(ch), {});
  if (gate.status === 'blocked') blocked++; else passedClean++;
  const mark = got.join(',') === [...want].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(',') || (got.length === want.length && hit.length === want.length) ? 'OK  ' : 'DIFF';
  log(`${mark} ${c.key.padEnd(9)} found [${got.join(', ')}] expected [${want.join(', ')}]  ${c.summary}`);
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
log('');
log(`Hazard links found: ${tp} of ${tp + fn} expected (missed ${fn}). Extra links: ${fp}.`);
log(`Changes that touch a hazard: ${touchingChanges} of ${changes.length}.`);
log(`Plain Jira workflow: ${plainJiraLetThrough} of ${touchingChanges} hazard changes could reach Done with no risk review.`);
log(`SafeChange, before any review: ${blocked} changes held at Done, ${passedClean} passed with no extra step.`);
log(`Time to analyse all ${changes.length} changes: ${ms.toFixed(1)} ms.`);
mkdirSync(new URL('logs/', root), { recursive: true });
writeFileSync(new URL('logs/evaluate.log', root), lines.join('\n') + '\n');
