// Where SafeChange keeps its data.
//  - Settings (which Confluence page is the hazard log): Forge app storage.
//  - Risk reviews: a Jira issue property on each change, so they travel with
//    the issue and show in Jira's own history and exports.
//  - A short cache of the parsed hazard log, keyed by page version.

import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';

const SETTINGS = 'settings';
export const REVIEWS_PROP = 'safechange-reviews';

export const DEFAULT_SETTINGS = {
  pageId: '',
  pageTitle: '',
  pageUrl: '',
  productCodes: ['FRN'],
  fdaLookups: true,
  doneOnly: true,
};

export async function getSettings() {
  const s = (await kvs.get(SETTINGS)) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await kvs.set(SETTINGS, next);
  return next;
}

export async function getCachedLog(pageId, version) {
  const c = await kvs.get(`log:${pageId}`);
  return c && c.version === version ? c.log : null;
}

export async function setCachedLog(pageId, version, log) {
  await kvs.set(`log:${pageId}`, { version, log });
}

/** All reviews on an issue: { [hazardId]: review } */
export async function getReviews(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${REVIEWS_PROP}`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Could not read reviews on ${issueKey} (${res.status})`);
  const body = await res.json();
  return body.value?.reviews || {};
}

export async function putReview(issueKey, hazardId, review) {
  const reviews = await getReviews(issueKey);
  const history = reviews[hazardId]?.history || [];
  if (reviews[hazardId]) {
    const { history: _h, ...prev } = reviews[hazardId];
    history.unshift(prev);
  }
  reviews[hazardId] = { ...review, history: history.slice(0, 10) };
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${REVIEWS_PROP}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews }),
  });
  if (!res.ok) throw new Error(`Could not save the review on ${issueKey} (${res.status})`);
  return reviews[hazardId];
}

const ALERT_PROP = 'safechange-alert';

/** Fingerprint of the change version we last alerted about. */
export async function getAlertMark(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${ALERT_PROP}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = await res.json();
  return body.value?.fingerprint || null;
}

export async function setAlertMark(issueKey, fingerprint) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${ALERT_PROP}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, at: new Date().toISOString() }),
  });
}
