// Hazard log parser: many shapes of real Confluence tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHazardLog, htmlToText, normaliseSeverity, splitWatches, parseCategories } from '../src/core/hazardLog.js';

const table = (head, ...rows) =>
  `<table><tbody><tr>${head.map((h) => `<th><p>${h}</p></th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

const HEAD = ['ID', 'Hazard', 'Harm', 'Severity', 'Watches', 'Risk control', 'Verification', 'Category'];
const ROW = ['H1', 'Overdose risk', 'Overdose', 'Catastrophic', 'src/dose/, bolus', 'Rate check', 'Rate test', 'dose'];

// Column header spellings that must all be understood.
const headerCases = [
  ['ID', 'id'], ['Hazard ID', 'id'], ['Ref', 'id'],
  ['Watches', 'watches'], ['Software items', 'watches'], ['Software item', 'watches'], ['Triggers', 'watches'],
  ['Risk control', 'control'], ['Risk controls', 'control'], ['Mitigation', 'control'],
  ['Verification', 'verification'], ['Verification test', 'verification'],
  ['Severity', 'severity'], ['Sev', 'severity'],
  ['Category', 'categories'], ['Hazard category', 'categories'], ['Hazard type', 'categories'],
];
for (const [header, field] of headerCases) {
  test(`header "${header}" is read as ${field}`, () => {
    const head = HEAD.map((h) => {
      if (field === 'id' && h === 'ID') return header;
      if (field === 'watches' && h === 'Watches') return header;
      if (field === 'control' && h === 'Risk control') return header;
      if (field === 'verification' && h === 'Verification') return header;
      if (field === 'severity' && h === 'Severity') return header;
      if (field === 'categories' && h === 'Category') return header;
      return h;
    });
    const { hazards } = parseHazardLog(table(head, ROW));
    assert.equal(hazards.length, 1);
    const h = hazards[0];
    const expect = { id: 'H1', watches: ['src/dose/', 'bolus'], control: 'Rate check', verification: 'Rate test', severity: 'Catastrophic', categories: ['dose'] };
    assert.deepEqual(h[field], expect[field]);
  });
}

test('columns can come in any order', () => {
  const order = [4, 0, 7, 2, 1, 6, 3, 5];
  const { hazards } = parseHazardLog(table(order.map((i) => HEAD[i]), order.map((i) => ROW[i])));
  assert.equal(hazards[0].id, 'H1');
  assert.deepEqual(hazards[0].watches, ['src/dose/', 'bolus']);
  assert.equal(hazards[0].severity, 'Catastrophic');
});

test('only ID and Watches are required', () => {
  const { hazards, problems } = parseHazardLog(table(['ID', 'Watches'], ['A', 'x, y']));
  assert.equal(hazards.length, 1);
  assert.equal(hazards[0].title, 'A');
  assert.equal(hazards[0].severity, 'Unrated');
  assert.deepEqual(hazards[0].categories, []);
  assert.deepEqual(problems, []);
});

test('a table without Watches is skipped and the next table is used', () => {
  const html = table(['Name', 'Owner'], ['a', 'b']) + table(['ID', 'Watches'], ['H9', 'alarm']);
  assert.equal(parseHazardLog(html).hazards[0].id, 'H9');
});

test('empty ID rows are ignored', () => {
  const { hazards } = parseHazardLog(table(['ID', 'Watches'], ['', 'x'], ['H2', 'y']));
  assert.deepEqual(hazards.map((h) => h.id), ['H2']);
});

test('a table with only a header has no hazards', () => {
  assert.equal(parseHazardLog(table(['ID', 'Watches'])).hazards.length, 0);
});

test('nothing at all reports a problem', () => {
  for (const input of ['', null, undefined, '<p>hi</p>']) {
    const r = parseHazardLog(input);
    assert.equal(r.hazards.length, 0);
    assert.equal(r.problems.length, 1);
  }
});

test('watches split on commas, semicolons and new lines, and trim', () => {
  assert.deepEqual(splitWatches(' a , b;c\n d ,, '), ['a', 'b', 'c', 'd']);
  assert.deepEqual(splitWatches(''), []);
});

test('watches written as separate paragraphs in one cell', () => {
  const html = '<table><tr><th>ID</th><th>Watches</th></tr><tr><td>H1</td><td><p>alarm</p><p>mute</p></td></tr></table>';
  assert.deepEqual(parseHazardLog(html).hazards[0].watches, ['alarm', 'mute']);
});

const sevCases = [
  ['Catastrophic', 'Catastrophic'], ['catastrophic', 'Catastrophic'], ['CRITICAL', 'Critical'], ['Serious (S3)', 'Serious'],
  ['minor', 'Minor'], ['Negligible', 'Negligible'], ['', 'Unrated'], ['High', 'High'], ['  ', 'Unrated'],
];
for (const [inp, out] of sevCases) test(`severity "${inp}" becomes ${out}`, () => assert.equal(normaliseSeverity(inp), out));

const catCases = [
  ['dose', ['dose']], ['Wrong therapy amount', ['dose']], ['alarm, stop', ['alarm', 'stop']], ['Alarm or detection failure', ['alarm']],
  ['Security; comms', ['security', 'comms']], ['battery', ['power']], ['User interface', ['ui']], ['nonsense', []],
  ['dose, dose', ['dose']], ['', []], ['Loss of function', ['stop']], ['Connectivity', ['comms']],
];
for (const [inp, out] of catCases) test(`category "${inp}" maps to [${out}]`, () => assert.deepEqual(parseCategories(inp), out));

const entityCases = [
  ['a &amp; b', 'a & b'], ['&lt;tag&gt;', '<tag>'], ['5&nbsp;mL', '5 mL'], ['&#956;g', 'μg'], ['&#x3bc;g', 'μg'],
  ['line<br/>two', 'line\ntwo'], ['<p>a</p><p>b</p>', 'a\nb'], ['&unknown;', '&unknown;'], ['<strong>bold</strong>', 'bold'],
];
for (const [inp, out] of entityCases) test(`html text "${inp}"`, () => assert.equal(htmlToText(inp), out));

test('duplicate IDs keep the first and report the second', () => {
  const r = parseHazardLog(table(['ID', 'Watches', 'Hazard'], ['H1', 'a', 'first'], ['H1', 'b', 'second']));
  assert.equal(r.hazards.length, 1);
  assert.equal(r.hazards[0].title, 'first');
  assert.match(r.problems[0], /listed twice/);
});

test('a big log of 200 hazards parses in order', () => {
  const rows = Array.from({ length: 200 }, (_, i) => [`H${i + 1}`, `word${i}`]);
  const r = parseHazardLog(table(['ID', 'Watches'], ...rows));
  assert.equal(r.hazards.length, 200);
  assert.equal(r.hazards[199].id, 'H200');
});
