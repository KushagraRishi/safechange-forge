// End-to-end test of the Forge handlers against a fake Jira and Confluence.
// Run with: npm test (uses node --experimental-test-module-mocks)
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HAZARD_HTML = readFileSync(new URL('../fixtures/hazard-log.html', import.meta.url), 'utf8');

// ---------- fake site ----------
const site = {
  kv: new Map(),
  page: { id: '100', title: 'Hazard log', version: 3, body: HAZARD_HTML },
  issues: {},
  props: {},
  users: { 'acc-1': 'Ana Reviewer' },
};
function issue(key, summary, description, components = [], status = ['To Do', 'new'], links = []) {
  site.issues[key] = {
    key,
    fields: {
      summary,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] },
      components: components.map((name) => ({ name })),
      labels: [],
      status: { name: status[0], statusCategory: { key: status[1] } },
      issuelinks: links.map((k) => ({ type: { outward: 'relates to' }, outwardIssue: { key: k, fields: { summary: site.issues[k]?.fields.summary || '', status: site.issues[k]?.fields.status } } })),
    },
  };
}
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body ?? '') });

async function requestJira(path, opts = {}) {
  const p = String(path);
  let m;
  if ((m = p.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/comment$/))) {
    site.comments = site.comments || {};
    const body = JSON.parse(opts.body).body;
    (site.comments[m[1]] = site.comments[m[1]] || []).push(body.content.map((pp) => pp.content[0].text).join('\n'));
    return res(201, {});
  }
  if ((m = p.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/properties\/safechange-alert$/))) {
    site.alerts = site.alerts || {};
    if (opts.method === 'PUT') {
      site.alerts[m[1]] = JSON.parse(opts.body);
      return res(200, {});
    }
    return site.alerts[m[1]] ? res(200, { value: site.alerts[m[1]] }) : res(404, {});
  }
  if ((m = p.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/properties\/safechange-reviews$/))) {
    if (opts.method === 'PUT') {
      site.props[m[1]] = JSON.parse(opts.body);
      return res(200, {});
    }
    return site.props[m[1]] ? res(200, { value: site.props[m[1]] }) : res(404, {});
  }
  if ((m = p.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\?/))) return site.issues[m[1]] ? res(200, site.issues[m[1]]) : res(404, {});
  if (p === '/rest/api/3/search/jql') {
    const { jql } = JSON.parse(opts.body);
    const keys = jql.startsWith('key in') ? [...jql.matchAll(/"([A-Z]+-\d+)"/g)].map((x) => x[1]) : Object.keys(site.issues);
    return res(200, { issues: keys.map((k) => site.issues[k]).filter(Boolean) });
  }
  if ((m = p.match(/^\/rest\/api\/3\/user\?accountId=(.+)$/))) return res(200, { displayName: site.users[m[1]] });
  return res(404, { path: p });
}
async function requestConfluence(path) {
  const p = String(path);
  if (p.startsWith('/wiki/api/v2/pages/100')) {
    return res(200, { id: '100', title: site.page.title, version: { number: site.page.version }, body: { storage: { value: site.page.body } }, _links: { base: 'https://x.atlassian.net/wiki', webui: '/pages/100' } });
  }
  return res(404, {});
}
const client = { requestJira, requestConfluence };
const route = (s, ...v) => s.reduce((a, x, i) => a + x + (i < v.length ? encodeURIComponent(v[i]).replace(/%2F/g, '/') : ''), '');

mock.module('@forge/api', {
  defaultExport: { asApp: () => client, asUser: () => client },
  namedExports: { route, fetch: async () => res(200, { meta: { results: { total: 2 }, last_updated: '2026-11-21' }, results: [{ cfres_id: '1', recalling_firm: 'Firm', event_date_initiated: '2025-01-01', reason_for_recall: 'Software may over infuse', root_cause_description: 'Software design' }] }) },
});
mock.module('@forge/kvs', { namedExports: { kvs: { get: async (k) => site.kv.get(k), set: async (k, v) => site.kv.set(k, v) } } });
mock.module('@forge/resolver', {
  defaultExport: class {
    constructor() {
      this.fns = {};
    }
    define(n, f) {
      this.fns[n] = f;
    }
    getDefinitions() {
      return this.fns;
    }
  },
});

const app = await import('../src/index.js');

// ---------- the story ----------
issue('PUMP-2', 'Verify HAZ-1: Rate accuracy test', 'test', [], ['To Do', 'new']);
issue('PUMP-1', 'Max flow rate raised to 1200 mL/h', 'Files changed: src/dose/limits.c', ['Dose Calculator'], ['In Progress', 'indeterminate'], ['PUMP-2']);
issue('PUMP-3', 'Update user manual link', 'Files changed: docs/manual.md');
const ctx = (key) => ({ context: { extension: { issue: { key } }, accountId: 'acc-1' } });

test('before setup, the gate lets changes through and the panel asks for setup', async () => {
  assert.deepEqual(await app.validate({ issue: { key: 'PUMP-1' } }), { result: true });
  const r = await app.panelResolver.check(ctx('PUMP-1'));
  assert.equal(r.error, 'not-configured');
});

test('setup picks the hazard log page', async () => {
  const r = await app.adminResolver.setPage({ payload: { pageId: '100' } });
  assert.equal(r.ok, true);
  assert.equal(r.count, 8);
});

test('a change with no hazards passes the gate', async () => {
  const r = await app.panelResolver.check(ctx('PUMP-3'));
  assert.equal(r.gate.status, 'no-hazards');
  assert.deepEqual(await app.validate({ issue: { key: 'PUMP-3' } }), { result: true });
});

test('a hazard change is held at Done with a clear message', async () => {
  const r = await app.panelResolver.check(ctx('PUMP-1'));
  assert.equal(r.gate.status, 'blocked');
  assert.deepEqual(r.gate.items.map((i) => i.hazard.id), ['HAZ-1']);
  const v = await app.validate({ issue: { key: 'PUMP-1' } });
  assert.equal(v.result, false);
  assert.match(v.errorMessage, /HAZ-1 \(needs a risk review\)/);
});

test('a too short note is refused', async () => {
  const r = await app.panelResolver.sign({ ...ctx('PUMP-1'), payload: { hazardId: 'HAZ-1', decision: 'acceptable', note: 'ok', testKey: 'PUMP-2' } });
  assert.equal(r.error, 'error');
});

test('signed review with a test not yet passed still holds', async () => {
  const d = await app.panelResolver.draft({ ...ctx('PUMP-1'), payload: { hazardId: 'HAZ-1' } });
  assert.match(d.note, /PUMP-1 .*HAZ-1/);
  const r = await app.panelResolver.sign({ ...ctx('PUMP-1'), payload: { hazardId: 'HAZ-1', decision: 'acceptable', note: d.note, testKey: 'PUMP-2' } });
  assert.equal(r.gate.items[0].state, 'test-not-passed');
  assert.equal(r.gate.items[0].review.reviewerName, 'Ana Reviewer');
  assert.equal((await app.validate({ issue: { key: 'PUMP-1' } })).result, false);
});

test('once the test passes, the change is cleared', async () => {
  site.issues['PUMP-2'].fields.status = { name: 'Done', statusCategory: { key: 'done' } };
  const r = await app.panelResolver.check(ctx('PUMP-1'));
  assert.equal(r.gate.status, 'clear');
  assert.deepEqual(await app.validate({ issue: { key: 'PUMP-1' } }), { result: true });
});

test('editing the change after review makes the review stale and adds new hazards', async () => {
  site.issues['PUMP-1'].fields.description.content[0].content[0].text = 'Files changed: src/dose/limits.c, src/alarms/priorities.c';
  const r = await app.panelResolver.check(ctx('PUMP-1'));
  assert.equal(r.gate.status, 'blocked');
  const states = Object.fromEntries(r.gate.items.map((i) => [i.hazard.id, i.state]));
  assert.equal(states['HAZ-1'], 'stale-review');
  assert.equal(states['HAZ-6'], 'missing-review');
  const v = await app.validate({ issue: { key: 'PUMP-1' } });
  assert.match(v.errorMessage, /change edited after review/);
});

test('Rovo actions: analyze, impact, recalls, record, release', async () => {
  const a = await app.actionAnalyzeChange({ issueKey: 'pump-1' });
  assert.equal(a.verdict, 'blocked');
  assert.equal(a.hazardsNotCleared, 3);
  const a2 = await app.actionAnalyzeChange({ context: { jira: { issueKey: 'PUMP-3' } } });
  assert.equal(a2.verdict, 'no-hazards');
  const imp = await app.actionHazardImpact({ hazardId: 'HAZ-6' });
  assert.deepEqual(imp.changes.map((c) => c.key), ['PUMP-1']);
  const rec = await app.actionSimilarRecalls({ hazardId: 'HAZ-1' });
  assert.equal(rec.total, 2);
  const noUser = await app.actionRecordReview({ issueKey: 'PUMP-1', hazardId: 'HAZ-6', decision: 'acceptable', note: 'Alarm priority unchanged for high alarms.' });
  assert.equal(noUser.error, 'error');
  const saved = await app.actionRecordReview({ issueKey: 'PUMP-1', hazardId: 'HAZ-6', decision: 'acceptable', note: 'Alarm priority unchanged for high alarms.', testKey: 'PUMP-2' }, { accountId: 'acc-1' });
  assert.equal(saved.saved, true);
  assert.equal(saved.stillOpen, 2);
  const rel = await app.actionReleaseCheck({});
  assert.equal(rel.checked, 3);
  assert.equal(rel.blocked, 1);
});

test("if the hazard log cannot be read, the gate fails closed", async () => {
  const saved = site.page;
  site.page = null;
  const orig = client.requestConfluence;
  client.requestConfluence = async () => res(500, {});
  const v = await app.validate({ issue: { key: 'PUMP-1' } });
  assert.equal(v.result, false);
  assert.match(v.errorMessage, /could not check/);
  client.requestConfluence = orig;
  site.page = saved;
});

test('Confluence byline: each hazard lists the open changes touching it', async () => {
  const r = await app.bylineResolver.status({ context: { extension: { content: { id: '100' } } } });
  assert.equal(r.isHazardLog, true);
  assert.equal(r.isActiveLog, true);
  const byId = Object.fromEntries(r.rows.map((x) => [x.hazard.id, x]));
  assert.deepEqual(byId['HAZ-1'].changes.map((c) => c.key), ['PUMP-1']);
  assert.equal(byId['HAZ-4'].changes.length, 0);
  assert.ok(byId['HAZ-1'].open >= 1);
});

// ---------- live alert and release record ----------

test('stale alert: no comment for a change with no reviews', async () => {
  const r = await app.onIssueUpdated({ issue: { key: 'PUMP-3' }, changelog: { items: [{ field: 'description' }] } });
  assert.equal(r, undefined);
  assert.equal(site.comments?.['PUMP-3'], undefined);
});

test('stale alert: ignores edits to fields that do not change the review', async () => {
  const before = site.comments?.['PUMP-1']?.length || 0;
  await app.onIssueUpdated({ issue: { key: 'PUMP-1' }, changelog: { items: [{ field: 'assignee' }] } });
  assert.equal(site.comments?.['PUMP-1']?.length || 0, before);
});

test('stale alert: comments once when a reviewed change is edited, not twice', async () => {
  site.props['PUMP-1'] = { reviews: { 'HAZ-1': { decision: 'acceptable', fingerprint: 'old', testKey: 'PUMP-2', reviewer: 'acc-1', reviewedAt: '2026-11-27T00:00:00Z' } } };
  await app.onIssueUpdated({ issue: { key: 'PUMP-1' }, changelog: { items: [{ field: 'description' }] } });
  await app.onIssueUpdated({ issue: { key: 'PUMP-1' }, changelog: { items: [{ field: 'description' }] } });
  const cs = site.comments['PUMP-1'];
  assert.equal(cs.length, 1);
  assert.match(cs[0], /edited after its risk review/);
  assert.match(cs[0], /HAZ-1/);
});

test('release record HTML lists every hazard with state, review and fingerprint, and escapes text', async () => {
  const { releaseRecordHtml } = await import('../src/services/engine.js');
  const rows = [
    { key: 'A-1', summary: 'Rate <fix>', fingerprint: 'f1', gate: { status: 'blocked', items: [
      { hazard: { id: 'HAZ-1', severity: 'Catastrophic' }, reasons: [{ kind: 'file', detail: 'src/dose/a.c' }], state: 'stale-review', review: { decision: 'acceptable', reviewerName: 'Ana', reviewedAt: '2026-11-27T10:00:00Z' }, test: { key: 'T-1', status: 'Done' } },
      { hazard: { id: 'HAZ-6', severity: 'Serious' }, reasons: [{ kind: 'model', detail: 'Alarm 70%' }], state: 'missing-review', review: null, test: null },
    ] } },
    { key: 'A-2', summary: 'Docs', fingerprint: 'f2', gate: { status: 'no-hazards', items: [] } },
  ];
  const html = releaseRecordHtml({ title: 't', jql: 'project = A', generatedAt: 'now', log: { title: 'Log', version: 3 }, rows });
  assert.match(html, /<strong>2<\/strong> changes: <strong>0<\/strong> cleared, <strong>1<\/strong> held, <strong>1<\/strong> touching no hazard/);
  assert.match(html, /rowspan="2"/);
  assert.match(html, /Rate &lt;fix&gt;/);
  assert.match(html, /Edited after review/);
  assert.match(html, /acceptable, Ana, 2026-11-27/);
  assert.match(html, /T-1 \(Done\)/);
  assert.match(html, /model Alarm 70%/);
  assert.match(html, /No hazard touched/);
  assert.match(html, /<code>f1<\/code>/);
});
