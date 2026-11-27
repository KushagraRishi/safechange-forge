// One click sample data, so a judge (or a new team) can try SafeChange in a
// minute: a hazard log page in Confluence, components, verification tests and
// sample changes in a Jira project.

import api, { route } from '@forge/api';
import { HAZARD_LOG_HTML, DEMO_CHANGES } from '../demo/content.js';
import { parseHazardLog } from '../core/hazardLog.js';
import { analyzeChange, extractFiles } from '../core/analyze.js';
import { saveSettings } from './store.js';
import { loadModel } from '../core/model.js';

async function ok(res, what) {
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${what} failed (${res.status}) ${t.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const J = { Accept: 'application/json', 'Content-Type': 'application/json' };

export async function listProjectsAndSpaces() {
  const [p, s] = await Promise.all([
    api.asUser().requestJira(route`/rest/api/3/project/search?maxResults=50&orderBy=name`, { headers: J }),
    api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=50&type=global`, { headers: J }),
  ]);
  const projects = (await ok(p, 'Listing projects')).values || [];
  const spaces = (await ok(s, 'Listing spaces')).results || [];
  return {
    projects: projects.map((x) => ({ key: x.key, name: x.name, style: x.style })),
    spaces: spaces.map((x) => ({ id: x.id, key: x.key, name: x.name })),
  };
}

function adf(text) {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
  };
}

async function issueTypeId(projectKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, { headers: J });
  const body = await ok(res, 'Reading issue types');
  const types = (body.issueTypes || body.values || []).filter((t) => !t.subtask);
  const pick = types.find((t) => t.name === 'Task') || types.find((t) => t.name === 'Story') || types[0];
  if (!pick) throw new Error(`Project ${projectKey} has no issue type SafeChange can use.`);
  return pick.id;
}

async function ensureComponents(projectKey, names) {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectKey}/components`, { headers: J });
  const have = new Set(((await ok(res, 'Reading components')) || []).map((c) => c.name));
  for (const name of names) {
    if (have.has(name)) continue;
    const r = await api.asUser().requestJira(route`/rest/api/3/component`, {
      method: 'POST',
      headers: J,
      body: JSON.stringify({ project: projectKey, name, description: 'Created by SafeChange sample data' }),
    });
    await ok(r, `Creating component ${name}`);
  }
}

async function createIssue(projectKey, typeId, summary, description, components = [], labels = []) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: J,
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        issuetype: { id: typeId },
        summary,
        description: adf(description),
        ...(components.length ? { components: components.map((name) => ({ name })) } : {}),
        labels,
      },
    }),
  });
  return (await ok(res, `Creating "${summary}"`)).key;
}

async function link(fromKey, toKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: fromKey }, outwardIssue: { key: toKey } }),
  });
  await ok(res, `Linking ${fromKey} to ${toKey}`);
}

export async function createDemo({ projectKey, spaceId }) {
  if (!projectKey || !spaceId) throw new Error('Pick a Jira project and a Confluence space first.');
  const steps = [];

  // 1. Hazard log page
  const title = `Hazard log: sample infusion pump (SafeChange) ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const pageRes = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ spaceId, status: 'current', title, body: { representation: 'storage', value: HAZARD_LOG_HTML } }),
  });
  const page = await ok(pageRes, 'Creating the hazard log page');
  const pageUrl = page._links?.base && page._links?.webui ? page._links.base + page._links.webui : '';
  await saveSettings({ pageId: page.id, pageTitle: page.title, pageUrl });
  steps.push(`Created the hazard log page "${page.title}" and set it as the hazard log.`);

  // 2. Components used by the sample changes
  const { hazards } = parseHazardLog(HAZARD_LOG_HTML);
  const comps = [...new Set(DEMO_CHANGES.flatMap((c) => c.components))];
  await ensureComponents(projectKey, comps);
  steps.push(`Made sure ${comps.length} components exist in ${projectKey}.`);

  // 3. One verification test per hazard
  const typeId = await issueTypeId(projectKey);
  const testKeys = {};
  // Created in order so the test keys follow the hazard numbers.
  for (const h of hazards) {
    testKeys[h.id] = await createIssue(projectKey, typeId, `Verify ${h.id}: ${h.verification}`, `Verification test for ${h.id} (${h.title}).\nRisk control under test: ${h.control}`, [], ['verification']);
  }
  steps.push(`Created ${hazards.length} verification tests.`);

  // 4. Sample changes, linked to the tests for the hazards they touch
  const created = [];
  for (const c of DEMO_CHANGES) {
    const key = await createIssue(projectKey, typeId, c.summary, c.description, c.components, c.labels);
    const touched = analyzeChange({ ...c, files: extractFiles(c.description) }, hazards, loadModel().score(`${c.summary}\n${c.description}`));
    created.push({ key, summary: c.summary, hazards: touched.map((t) => t.hazard.id) });
  }
  // Links do not depend on each other, so make them all at once.
  await Promise.all(created.flatMap((c) => c.hazards.map((id) => link(c.key, testKeys[id]))));
  steps.push(`Created ${created.length} sample changes and linked each to its tests.`);

  return { ok: true, steps, page: { id: page.id, title: page.title, url: pageUrl }, tests: testKeys, changes: created };
}
