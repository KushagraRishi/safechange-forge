// The Done gate: every combination of review and test state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate, hazardState, blockMessage, STATES } from '../src/core/gate.js';

const PRINT = 'abc123abc123';
const hz = (id, severity = 'Critical') => ({ hazard: { id, title: `Hazard ${id}`, severity }, reasons: [{ kind: 'word', detail: 'x' }] });

// Exhaustive: review present? decision, fingerprint match, test key, test status.
const decisions = ['acceptable', 'not-acceptable'];
const prints = [PRINT, 'old000old000'];
const testKeys = ['T-1', ''];
const statuses = ['done', 'indeterminate', 'new', 'missing'];

function expected(d, fp, tk, st) {
  if (fp !== PRINT) return 'stale-review';
  if (d !== 'acceptable') return 'rejected';
  if (!tk) return 'missing-test';
  if (st !== 'done') return 'test-not-passed';
  return 'ok';
}

for (const d of decisions)
  for (const fp of prints)
    for (const tk of testKeys)
      for (const st of statuses) {
        test(`review ${d}, ${fp === PRINT ? 'current' : 'old'} fingerprint, ${tk ? 'test linked' : 'no test'}, test ${st}`, () => {
          const tests = st === 'missing' ? {} : { 'T-1': { statusCategory: st, status: st } };
          const want = expected(d, fp, tk, st);
          assert.equal(hazardState({ decision: d, fingerprint: fp, testKey: tk }, PRINT, tests), want);
          const g = evaluateGate([hz('H1')], { H1: { decision: d, fingerprint: fp, testKey: tk } }, PRINT, tests);
          assert.equal(g.status, want === 'ok' ? 'clear' : 'blocked');
          assert.equal(g.items[0].blocks, STATES[want].blocks);
        });
      }

test('no review means missing review', () => assert.equal(hazardState(undefined, PRINT, {}), 'missing-review'));
test('no hazards means no-hazards, never blocked', () => {
  const g = evaluateGate([], {}, PRINT, {});
  assert.deepEqual([g.status, g.open, g.total], ['no-hazards', 0, 0]);
  assert.equal(blockMessage(g), '');
});

// Mixed sets: the change is clear only if every hazard is clear.
for (let n = 1; n <= 6; n++) {
  for (let cleared = 0; cleared <= n; cleared++) {
    test(`${cleared} of ${n} hazards cleared`, () => {
      const touched = Array.from({ length: n }, (_, i) => hz(`H${i + 1}`));
      const reviews = {};
      for (let i = 0; i < cleared; i++) reviews[`H${i + 1}`] = { decision: 'acceptable', fingerprint: PRINT, testKey: 'T-1' };
      const g = evaluateGate(touched, reviews, PRINT, { 'T-1': { statusCategory: 'done' } });
      assert.equal(g.open, n - cleared);
      assert.equal(g.status, cleared === n ? 'clear' : 'blocked');
    });
  }
}

test('reviews for hazards the change does not touch are ignored', () => {
  const g = evaluateGate([hz('H1')], { H9: { decision: 'acceptable', fingerprint: PRINT, testKey: 'T-1' } }, PRINT, {});
  assert.equal(g.items[0].state, 'missing-review');
});

test('a linked test that is not found reports Not found', () => {
  const g = evaluateGate([hz('H1')], { H1: { decision: 'acceptable', fingerprint: PRINT, testKey: 'T-404' } }, PRINT, {});
  assert.equal(g.items[0].test.status, 'Not found');
  assert.equal(g.items[0].state, 'test-not-passed');
});

// Messages people see in Jira.
test('one hazard: singular message', () => {
  const m = blockMessage(evaluateGate([hz('H1')], {}, PRINT, {}));
  assert.equal(m, 'SafeChange: this change touches 1 hazard that is not cleared: H1 (needs a risk review). Open the SafeChange panel to review them.');
});
test('several hazards: plural message lists each with its state', () => {
  const m = blockMessage(evaluateGate([hz('H1'), hz('H2')], { H2: { decision: 'acceptable', fingerprint: 'old', testKey: 'T' } }, PRINT, {}));
  assert.match(m, /touches 2 hazards that are not cleared: H1 \(needs a risk review\), H2 \(change edited after review\)/);
});
test('more than four hazards: the message stays short', () => {
  const m = blockMessage(evaluateGate(Array.from({ length: 7 }, (_, i) => hz(`H${i + 1}`)), {}, PRINT, {}));
  assert.match(m, /H4 \(needs a risk review\) and 3 more\./);
  assert.ok(!m.includes('H5'));
});
test('every state has a label and a block flag', () => {
  for (const [k, v] of Object.entries(STATES)) {
    assert.equal(typeof v.label, 'string', k);
    assert.equal(typeof v.blocks, 'boolean', k);
  }
  assert.equal(STATES.ok.blocks, false);
});
