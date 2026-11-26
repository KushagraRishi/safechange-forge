import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHazardLog, htmlToText } from '../src/core/hazardLog.js';
import { analyzeChange, extractFiles, fingerprint, adfToText, changeFromIssue } from '../src/core/analyze.js';
import { evaluateGate, blockMessage } from '../src/core/gate.js';

const html = readFileSync(new URL('../fixtures/hazard-log.html', import.meta.url), 'utf8');
const { hazards, problems } = parseHazardLog(html);
const base = { key: 'X-1', summary: '', description: '', components: [], labels: [], files: [] };

test('reads all 8 hazards from the sample log', () => {
  assert.equal(hazards.length, 8);
  assert.deepEqual(problems, []);
  assert.equal(hazards[0].id, 'HAZ-1');
  assert.equal(hazards[0].severity, 'Catastrophic');
  assert.ok(hazards[0].watches.includes('src/dose/'));
});

test('reports a page with no hazard table', () => {
  const r = parseHazardLog('<p>nothing here</p>');
  assert.equal(r.hazards.length, 0);
  assert.match(r.problems[0], /No hazard table/);
});

test('reports duplicate ids and empty watches', () => {
  const r = parseHazardLog('<table><tr><th>ID</th><th>Watches</th></tr><tr><td>H1</td><td>a</td></tr><tr><td>H1</td><td>b</td></tr><tr><td>H2</td><td></td></tr></table>');
  assert.equal(r.hazards.length, 2);
  assert.equal(r.problems.length, 2);
});

test('decodes entities', () => {
  assert.equal(htmlToText('<p>a &amp; b&nbsp;&#956;L</p>'), 'a & b μL');
});

test('finds file paths in text', () => {
  assert.deepEqual(extractFiles('Files changed: src/dose/bolus.c, `src/motor/pid.c`. See https://x.org/a/b'), ['src/dose/bolus.c', 'src/motor/pid.c']);
});

test('matches by file path, component and word', () => {
  const t = analyzeChange({ ...base, summary: 'tweak', files: ['src/sensors/air_ultrasonic.c'] }, hazards);
  assert.deepEqual(t.map((x) => x.hazard.id), ['HAZ-4']);
  assert.equal(t[0].reasons[0].kind, 'file');
  const c = analyzeChange({ ...base, components: ['Alarms'] }, hazards);
  assert.deepEqual(c.map((x) => x.hazard.id), ['HAZ-6']);
  const w = analyzeChange({ ...base, summary: 'Two boluses in a row' }, hazards);
  assert.deepEqual(w.map((x) => x.hazard.id), ['HAZ-1']);
});

test('does not match part of a word', () => {
  const t = analyzeChange({ ...base, summary: 'Rebalance the airflow fan', description: 'new installer for the service tool' }, hazards);
  assert.deepEqual(t.map((x) => x.hazard.id), []);
});

test('most severe hazard comes first', () => {
  const t = analyzeChange({ ...base, components: ['Alarms', 'Motor Control'] }, hazards);
  assert.deepEqual(t.map((x) => x.hazard.id), ['HAZ-1', 'HAZ-2', 'HAZ-6']);
});

test('fingerprint changes when the change is edited', () => {
  const a = { ...base, summary: 'A', files: ['src/a.c'] };
  assert.equal(fingerprint(a), fingerprint({ ...a, files: ['src/a.c'] }));
  assert.notEqual(fingerprint(a), fingerprint({ ...a, summary: 'B' }));
});

test('reads Jira ADF descriptions', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Files changed: src/dose/a.c' }] }] };
  assert.match(adfToText(adf), /src\/dose\/a\.c/);
  const ch = changeFromIssue({ key: 'P-1', fields: { summary: 's', description: adf, components: [{ name: 'Power' }], labels: ['x'] } });
  assert.deepEqual(ch.files, ['src/dose/a.c']);
  assert.deepEqual(ch.components, ['Power']);
});

test('gate: every state', () => {
  const touched = analyzeChange({ ...base, components: ['Dose Calculator'] }, hazards);
  const fp = 'abc';
  const g0 = evaluateGate(touched, {}, fp, {});
  assert.equal(g0.status, 'blocked');
  assert.equal(g0.items[0].state, 'missing-review');
  assert.match(blockMessage(g0), /HAZ-1 \(needs a risk review\)/);
  const r = { decision: 'acceptable', fingerprint: fp, testKey: 'PUMP-9' };
  assert.equal(evaluateGate(touched, { 'HAZ-1': { ...r, fingerprint: 'old' } }, fp, {}).items[0].state, 'stale-review');
  assert.equal(evaluateGate(touched, { 'HAZ-1': { ...r, decision: 'not-acceptable' } }, fp, {}).items[0].state, 'rejected');
  assert.equal(evaluateGate(touched, { 'HAZ-1': { ...r, testKey: '' } }, fp, {}).items[0].state, 'missing-test');
  assert.equal(evaluateGate(touched, { 'HAZ-1': r }, fp, { 'PUMP-9': { statusCategory: 'indeterminate' } }).items[0].state, 'test-not-passed');
  const ok = evaluateGate(touched, { 'HAZ-1': r }, fp, { 'PUMP-9': { statusCategory: 'done' } });
  assert.equal(ok.status, 'clear');
  assert.equal(blockMessage(ok), '');
  assert.equal(evaluateGate([], {}, fp).status, 'no-hazards');
});

test('verification tests are never gated', () => {
  const t = analyzeChange({ ...base, summary: 'Verify HAZ-6: alarm mute timeout', labels: ['verification'] }, hazards);
  assert.deepEqual(t, []);
});
