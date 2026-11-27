// The hazard model inside the app gives the same numbers as scikit-learn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HazardModel, loadModel, tokenize, CATEGORIES, CATEGORY_NAMES, categoryCode } from '../src/core/model.js';
import { parseHazardLog } from '../src/core/hazardLog.js';
import { analyzeChange } from '../src/core/analyze.js';

const MODEL = JSON.parse(readFileSync(new URL('../src/core/model.json', import.meta.url), 'utf8'));
const PARITY = JSON.parse(readFileSync(new URL('./fixtures/model_parity.json', import.meta.url), 'utf8'));
const model = new HazardModel(MODEL);

// One test per reference text: every category probability within 1e-5.
PARITY.forEach((ref, n) => {
  test(`parity with scikit-learn, dev text ${n + 1}`, () => {
    const got = model.score(ref.text).map((s) => s.p);
    got.forEach((p, j) => assert.ok(Math.abs(p - ref.p[j]) < 1e-5, `${CATEGORIES[j]}: ${p} vs ${ref.p[j]}`));
  });
});

test('the JS module and model.json are the same model', () => {
  const m = loadModel();
  assert.equal(m.m.terms.length, MODEL.terms.length);
  assert.deepEqual(m.m.thresholds, MODEL.thresholds);
});

test('model covers exactly the 8 categories in order', () => assert.deepEqual(MODEL.categories, CATEGORIES));
test('every category has a name', () => CATEGORIES.forEach((c) => assert.ok(CATEGORY_NAMES[c])));
test('thresholds are between 0 and 1', () => Object.values(MODEL.thresholds).forEach((t) => assert.ok(t > 0 && t < 1)));
test('idf and terms line up', () => assert.equal(MODEL.idf.length, MODEL.terms.length));

const tokCases = [
  ['Pump may OVER infuse', ['pump', 'may', 'over', 'infuse']],
  ['a b c', []],
  ['x-ray  re-boot', ['ray', 're', 'boot']],
  ['v2.7 crash', ['v2', 'crash']],
  ['', []],
  ['μg dose', ['μg', 'dose']],
];
for (const [t, want] of tokCases) test(`tokenize "${t}"`, () => assert.deepEqual(tokenize(t), want));

test('empty text scores the intercept only and flags nothing odd', () => {
  const s = model.score('');
  assert.equal(s.length, 8);
  s.forEach((x) => assert.ok(x.p >= 0 && x.p <= 1));
});
test('unknown words change nothing', () => {
  const a = model.score('').map((x) => x.p);
  const b = model.score('zzqx wvvk').map((x) => x.p);
  assert.deepEqual(a, b);
});
test('scores are deterministic', () => assert.deepEqual(model.score('pump may stop infusing'), model.score('pump may stop infusing')));
test('top words come from the text', () => {
  const s = model.score('The pump may fail to detect air in line and no alarm sounds');
  for (const x of s) for (const w of x.words) assert.ok('the pump may fail to detect air in line and no alarm sounds'.includes(w.split(' ')[0]));
});

// Plain, obvious sentences the model must read the right way.
const sanity = [
  ['The infusion pump may deliver an incorrect dose of insulin', 'dose'],
  ['The alarm may not sound when an occlusion occurs', 'alarm'],
  ['The software may freeze and the system becomes unresponsive', 'stop'],
  ['A cybersecurity vulnerability could allow unauthorized access', 'security'],
  ['Patient images may be assigned to the wrong patient record', 'info'],
  ['Results may not be transmitted to the laboratory information system', 'comms'],
  ['The battery may drain faster than expected', 'power'],
];
for (const [text, cat] of sanity) {
  test(`model flags ${cat}: "${text}"`, () => assert.ok(model.score(text).find((s) => s.category === cat).flagged));
}

test('category names map back to codes', () => {
  assert.equal(categoryCode('Alarm or detection failure'), 'alarm');
  assert.equal(categoryCode('dose'), 'dose');
  assert.equal(categoryCode(''), null);
  assert.equal(categoryCode('nothing'), null);
});

// The model joins the rule matcher through the hazard log's Category column.
const { hazards } = parseHazardLog(readFileSync(new URL('../fixtures/hazard-log.html', import.meta.url), 'utf8'));
const base = { key: 'X', summary: '', description: '', components: [], labels: [], files: [] };
test('model finds a hazard the watch list misses', () => {
  const change = { ...base, summary: 'Pump may not detect a blocked line' };
  const rulesOnly = analyzeChange(change, hazards).map((t) => t.hazard.id);
  const withModel = analyzeChange(change, hazards, model.score(`${change.summary}\n`));
  assert.deepEqual(rulesOnly, []);
  assert.ok(withModel.some((t) => t.reasons.some((r) => r.kind === 'model')));
});
test('model reasons carry the probability and words', () => {
  const change = { ...base, summary: 'Alarm volume may be too low to hear' };
  const t = analyzeChange(change, hazards, model.score(change.summary)).find((x) => x.reasons.some((r) => r.kind === 'model'));
  const r = t.reasons.find((x) => x.kind === 'model');
  assert.ok(r.p > 0 && r.p <= 1);
  assert.match(r.detail, /%/);
});
test('verification tests stay exempt even when the model flags them', () => {
  const change = { ...base, summary: 'Verify the occlusion alarm', labels: ['verification'] };
  assert.deepEqual(analyzeChange(change, hazards, model.score(change.summary)), []);
});
