// Thin wrappers over the Jira and Confluence REST APIs.

import api, { route, fetch } from '@forge/api';
import { recallUrl, shapeRecalls } from '../core/recalls.js';

async function json(res, what) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${what} failed (${res.status}) ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ---------- Jira ----------

const ISSUE_FIELDS = 'summary,description,components,labels,status,issuelinks,issuetype,project,fixVersions';

export async function getIssue(key) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}?fields=${ISSUE_FIELDS}`, {
    headers: { Accept: 'application/json' },
  });
  return json(res, `Reading ${key}`);
}

/** Linked issues of a change, as test candidates. */
export function linkedIssues(issue) {
  return (issue.fields.issuelinks || [])
    .map((l) => {
      const other = l.outwardIssue || l.inwardIssue;
      if (!other) return null;
      return {
        key: other.key,
        summary: other.fields?.summary || '',
        status: other.fields?.status?.name || '',
        statusCategory: other.fields?.status?.statusCategory?.key || '',
        relation: l.outwardIssue ? l.type?.outward : l.type?.inward,
      };
    })
    .filter(Boolean);
}

/** Status of a set of issues, for checking linked tests. */
export async function getStatuses(keys) {
  const out = {};
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return out;
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql: `key in (${unique.map((k) => `"${k}"`).join(',')})`, fields: ['summary', 'status'], maxResults: 100 }),
  });
  const body = await json(res, 'Reading linked tests');
  for (const i of body.issues || []) {
    out[i.key] = {
      summary: i.fields.summary,
      status: i.fields.status?.name || '',
      statusCategory: i.fields.status?.statusCategory?.key || '',
    };
  }
  return out;
}

export async function searchIssues(jql, maxResults = 50) {
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, fields: ISSUE_FIELDS.split(','), maxResults }),
  });
  const body = await json(res, 'Searching issues');
  return body.issues || [];
}

export async function getUserName(accountId) {
  if (!accountId) return '';
  const res = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return '';
  const u = await res.json();
  return u.displayName || '';
}

// ---------- Confluence ----------

export async function getPage(pageId) {
  const res = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`, {
    headers: { Accept: 'application/json' },
  });
  const p = await json(res, 'Reading the hazard log page');
  return {
    id: p.id,
    title: p.title,
    version: p.version?.number || 0,
    body: p.body?.storage?.value || '',
    url: p._links?.base && p._links?.webui ? p._links.base + p._links.webui : '',
    webui: p._links?.webui || '',
    spaceId: p.spaceId || '',
  };
}

export async function createPage(spaceId, title, html, parentId) {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId, status: 'current', title, ...(parentId ? { parentId } : {}), body: { representation: 'storage', value: html } }),
    // a wide page, so the record table is readable
  });
  const p = await json(res, 'Creating the release record page');
  return { id: p.id, title: p.title, url: p._links?.base && p._links?.webui ? p._links.base + p._links.webui : '' };
}

function adfParagraphs(text) {
  return { type: 'doc', version: 1, content: text.split('\n').map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) };
}

export async function addComment(issueKey, text) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfParagraphs(text) }),
  });
  return json(res, `Commenting on ${issueKey}`);
}

export async function findPages(text) {
  const cql = text ? `type=page AND title ~ "${text.replace(/"/g, '')}*"` : 'type=page AND title ~ "hazard*"';
  const res = await api.asUser().requestConfluence(route`/wiki/rest/api/search?cql=${cql}&limit=15`, {
    headers: { Accept: 'application/json' },
  });
  const body = await json(res, 'Searching Confluence');
  return (body.results || [])
    .filter((r) => r.content?.id)
    .map((r) => ({ id: r.content.id, title: r.content.title || r.title, space: r.resultGlobalContainer?.title || '' }));
}

// ---------- openFDA ----------

export async function similarRecalls(words, productCodes) {
  try {
    const res = await fetch(recallUrl(words, productCodes, 3));
    if (res.status === 404) return { total: 0, items: [], updated: '' };
    if (!res.ok) return { total: 0, items: [], updated: '', error: `openFDA ${res.status}` };
    return shapeRecalls(await res.json());
  } catch (e) {
    return { total: 0, items: [], updated: '', error: String(e.message || e) };
  }
}
