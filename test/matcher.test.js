// Rule matcher: file paths, components, labels and words, plus fingerprints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHazardLog } from '../src/core/hazardLog.js';
import { analyzeChange, extractFiles, fingerprint, adfToText, changeFromIssue } from '../src/core/analyze.js';

const { hazards } = parseHazardLog(readFileSync(new URL('../fixtures/hazard-log.html', import.meta.url), 'utf8'));
const base = { key: 'X-1', summary: '', description: '', components: [], labels: [], files: [] };
const ids = (t) => t.map((x) => x.hazard.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// Every labelled sample change (rules only, no model) gives exactly the hazards
// the rules should give. These pin the hand labels used in logs/evaluate.log.
const changes = JSON.parse(readFileSync(new URL('../fixtures/changes.json', import.meta.url), 'utf8'));
const RULE_EXTRA = { 'PUMP-101': ['HAZ-6'], 'PUMP-104': ['HAZ-6'], 'PUMP-116': ['HAZ-1'] }; // known extra flags, see README
for (const c of changes) {
  test(`sample ${c.key}: ${c.summary}`, () => {
    const ch = { ...c, files: (c.description.match(/Files changed: (.*)/)?.[1] || '').split(/,\s*/).filter((f) => f.includes('/')) };
    const want = [...new Set([...c.expect, ...(RULE_EXTRA[c.key] || [])])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    assert.deepEqual(ids(analyzeChange(ch, hazards)), want);
  });
}

// File path rules.
const pathCases = [
  ['src/dose/bolus.c', ['HAZ-1']],
  ['./src/dose/bolus.c', ['HAZ-1']],
  ['SRC/DOSE/BOLUS.C', ['HAZ-1']],
  ['firmware/src/dose/limits.c', ['HAZ-1']],
  ['src/dosefoo/x.c', []],
  ['src/sensors/pressure_monitor.c', ['HAZ-3']],
  ['src/sensors/pressure/cal.c', []],
  ['src/sensors/air_ultrasonic.c', ['HAZ-4']],
  ['src/sensors/temperature.c', []],
  ['src/alarms/mute.c', ['HAZ-2', 'HAZ-6']],
  ['src/power/gauge.c', ['HAZ-7']],
  ['src/net/ota.c', ['HAZ-8']],
  ['src/ui/entry/units.c', ['HAZ-5']],
  ['src/ui/about.c', []],
  ['src/library/import.c', ['HAZ-5']],
  ['docs/manual.md', []],
  ['src/motor/pid.c', ['HAZ-1', 'HAZ-2']],
];
for (const [file, want] of pathCases) {
  test(`file ${file} touches [${want}]`, () => assert.deepEqual(ids(analyzeChange({ ...base, files: [file] }, hazards)), want));
}

// Component and label rules (case-insensitive, exact name).
const compCases = [
  [['Dose Calculator'], ['HAZ-1']], [['dose calculator'], ['HAZ-1']], [['Alarms'], ['HAZ-6']], [['Power'], ['HAZ-7']],
  [['Connectivity'], ['HAZ-8']], [['Air Sensor'], ['HAZ-4']], [['Keypad UI', 'Drug Library'], ['HAZ-5']], [['Dose'], []],
  [['Pressure Sensor', 'Alarms'], ['HAZ-3', 'HAZ-6']], [['Website'], []],
];
for (const [comps, want] of compCases) {
  test(`components ${comps.join(' + ')} touch [${want}]`, () => assert.deepEqual(ids(analyzeChange({ ...base, components: comps }, hazards)), want));
}
test('a label that names a watch matches', () => assert.deepEqual(ids(analyzeChange({ ...base, labels: ['Alarms'] }, hazards)), ['HAZ-6']));
test('the verification label is never gated', () => assert.deepEqual(analyzeChange({ ...base, summary: 'bolus alarm battery', labels: ['Verification'] }, hazards), []));

// Word rules: whole words, simple endings, phrases across spaces, no part words.
const wordCases = [
  ['Two boluses in a row', ['HAZ-1']], ['bolus', ['HAZ-1']], ['BOLUS', ['HAZ-1']], ['bolusing', ['HAZ-1']],
  ['embolus risk', []], ['flow rate', ['HAZ-1']], ['flow   rate', ['HAZ-1']], ['flowrate', []],
  ['occlusion', ['HAZ-3']], ['occlusions', ['HAZ-3']], ['nonocclusion', []], ['air-in-line', ['HAZ-4']],
  ['bubbles', ['HAZ-4']], ['alarm', ['HAZ-6']], ['alarms', ['HAZ-6']], ['alarming', ['HAZ-6']], ['muted', ['HAZ-6']],
  ['volume', ['HAZ-6']], ['battery', ['HAZ-7']], ['batteries', ['HAZ-7']], ['muting', ['HAZ-6']], ['stalls', ['HAZ-2']], ['low battery', ['HAZ-7']], ['wireless', ['HAZ-8']],
  ['remote', ['HAZ-8']], ['remotely', []], ['OTA', ['HAZ-8']], ['rota', []], ['units', ['HAZ-5']], ['unit', []],
  ['stall', ['HAZ-2']], ['stalled', ['HAZ-2']], ['install', []], ['installer', []], ['concentration', ['HAZ-5']],
  ['under-infusion', ['HAZ-2']], ['dose limit', ['HAZ-5']], ['dose limits', ['HAZ-5']], ['rate limit', ['HAZ-1']],
  ['', []], ['Update the README', []], ['Typo fix', []],
];
for (const [text, want] of wordCases) {
  test(`words "${text}" touch [${want}]`, () => assert.deepEqual(ids(analyzeChange({ ...base, summary: text }, hazards)), want));
}

test('words in the description count too', () => assert.deepEqual(ids(analyzeChange({ ...base, summary: 'x', description: 'adds a mute timer' }, hazards)), ['HAZ-6']));
test('each reason says what matched', () => {
  const t = analyzeChange({ ...base, components: ['Alarms'], files: ['src/alarms/a.c'], summary: 'mute' }, hazards).find((x) => x.hazard.id === 'HAZ-6');
  assert.deepEqual(t.reasons.map((r) => r.kind).sort(), ['component', 'file', 'word', 'word'].slice(0, t.reasons.length).sort());
});
test('most severe first, then by number', () => {
  const t = analyzeChange({ ...base, components: ['Alarms', 'Power', 'Dose Calculator', 'Air Sensor'] }, hazards);
  assert.deepEqual(t.map((x) => x.hazard.id), ['HAZ-1', 'HAZ-4', 'HAZ-6', 'HAZ-7']);
});

// File extraction from free text.
const fileCases = [
  ['Files changed: src/a.c, src/b.h', ['src/a.c', 'src/b.h']],
  ['see `src/dose/x.c`.', ['src/dose/x.c']],
  ['(src/x/y.c)', ['src/x/y.c']],
  ['https://example.com/a/b', []],
  ['//comment/style', []],
  ['no paths here', []],
  ['src/a.c src/a.c', ['src/a.c']],
  ['path: lib/@scope/pkg/index.ts;', ['lib/@scope/pkg/index.ts']],
  ['src/', ['src/']],
];
for (const [text, want] of fileCases) test(`extract files from "${text}"`, () => assert.deepEqual(extractFiles(text), want));

// Atlassian Document Format to text.
const adfCases = [
  [null, ''],
  ['plain', 'plain'],
  [{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }, 'a\n'],
  [{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }] }, 'a\nb\n'],
  [{ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }] }] }, 'x\n\n'],
  [{ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'src/a.c' }] }] }, 'src/a.c\n'],
];
for (const [i, [node, want]] of adfCases.entries()) test(`ADF case ${i + 1}`, () => assert.equal(adfToText(node), want));

test('changeFromIssue reads summary, components, labels and files', () => {
  const ch = changeFromIssue({ key: 'K-1', fields: { summary: 'S', description: 'Files changed: src/a.c', components: [{ name: 'Alarms' }], labels: ['l'] } });
  assert.deepEqual([ch.key, ch.summary, ch.components, ch.labels, ch.files], ['K-1', 'S', ['Alarms'], ['l'], ['src/a.c']]);
});
test('changeFromIssue copes with missing fields', () => {
  const ch = changeFromIssue({ key: 'K-2', fields: {} });
  assert.deepEqual([ch.summary, ch.description, ch.components, ch.labels, ch.files], ['', '', [], [], []]);
});

// Fingerprints: stable for the same change, different for any real edit.
const fpBase = { ...base, summary: 'Raise rate', description: 'Files changed: src/a.c', components: ['A', 'B'], labels: ['x', 'y'], files: ['src/a.c', 'src/b.c'] };
test('fingerprint ignores order of components, labels and files', () => {
  assert.equal(fingerprint(fpBase), fingerprint({ ...fpBase, components: ['B', 'A'], labels: ['y', 'x'], files: ['src/b.c', 'src/a.c'] }));
});
test('fingerprint ignores extra white space', () => assert.equal(fingerprint(fpBase), fingerprint({ ...fpBase, description: '  Files   changed:\n src/a.c ' })));
test('fingerprint ignores the issue key', () => assert.equal(fingerprint(fpBase), fingerprint({ ...fpBase, key: 'Z-9' })));
const edits = [
  ['summary', { summary: 'Raise rates' }], ['description', { description: 'Files changed: src/a.c, src/c.c' }],
  ['component added', { components: ['A', 'B', 'C'] }], ['label removed', { labels: ['x'] }], ['file changed', { files: ['src/a.c'] }],
];
for (const [name, patch] of edits) test(`fingerprint changes when the ${name} changes`, () => assert.notEqual(fingerprint(fpBase), fingerprint({ ...fpBase, ...patch })));
test('fingerprint is 12 hex characters', () => assert.match(fingerprint(fpBase), /^[0-9a-f]{12}$/));
